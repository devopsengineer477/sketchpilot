import { expect, test, type Page } from '@playwright/test';
import {
  launchExtension,
  openNewDrawingFromDashboard,
  surfaceUrl,
  type LaunchedExtension,
} from './helpers';

/**
 * Production-readiness checks that need a real browser: offline containment (scenario 17)
 * and the accessibility behaviour you can only observe by actually pressing Tab
 * (plan P5-T2/T6/T7).
 */

let app: LaunchedExtension;

test.beforeAll(async () => {
  app = await launchExtension();
});

test.afterAll(async () => {
  await app?.close();
});

/** Every request a page makes, including ones the page makes on its own. */
async function recordRequests(page: Page): Promise<string[]> {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

test('17. every surface loads with zero external requests', async () => {
  const surfaces: Array<'popup' | 'dashboard' | 'editor'> = ['popup', 'dashboard', 'editor'];
  for (const surface of surfaces) {
    const page = await app.context.newPage();
    const urls = await recordRequests(page);
    await page.goto(surfaceUrl(app.extensionId, surface));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);

    const external = urls.filter(
      (url) => !url.startsWith('chrome-extension://') && !url.startsWith('data:') && !url.startsWith('blob:'),
    );
    expect(external, `${surface} made external requests`).toEqual([]);

    // The pages themselves must not reference anything remote either — a missing font
    // would only show up as a 404 on a machine that is actually offline.
    const remote = await page.evaluate(() =>
      [...document.querySelectorAll('link[href], script[src], img[src]')]
        .map((node) => node.getAttribute('href') ?? node.getAttribute('src') ?? '')
        .filter((value) => /^https?:\/\//i.test(value)),
    );
    expect(remote, `${surface} references a remote resource`).toEqual([]);
    await page.close();
  }
});

test('no surface hands the user off to a third-party site', async () => {
  // The engine's default menu ends with a group literally titled "Excalidraw links", its help
  // dialog is almost entirely links to excalidraw.com, and its library panel offers a
  // "Browse libraries" button to libraries.excalidraw.com (with a referrer token for our
  // extension ID). None of that belongs to SketchPilot, so all of it is gone — and this test
  // is what keeps it gone after a dependency bump.
  const visibleExternalAnchors = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .filter((anchor) => /^https?:/i.test(anchor.getAttribute('href') ?? ''))
        .filter((anchor) => (anchor as HTMLElement).offsetParent !== null)
        .map((anchor) => `${anchor.textContent?.trim()} → ${anchor.getAttribute('href')}`),
    );

  for (const surface of ['popup', 'dashboard', 'settings'] as const) {
    const page = await app.context.newPage();
    await page.goto(surfaceUrl(app.extensionId, surface));
    await page.waitForLoadState('networkidle');
    expect(await visibleExternalAnchors(page), `${surface} links out`).toEqual([]);
    await page.close();
  }

  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await page.locator('.excalidraw').waitFor();
  await page.waitForTimeout(900);

  expect(await visibleExternalAnchors(page), 'the editor links out on load').toEqual([]);

  // The canvas menu: only our items, no "Excalidraw links" group.
  const menuButton = page.locator('.excalidraw .dropdown-menu-button').first();
  await menuButton.click();
  const menu = page.locator('.excalidraw .dropdown-menu').first();
  await expect(menu).toBeVisible();
  const menuText = await menu.innerText();
  expect(menuText).not.toMatch(/excalidraw/i);
  await expect(menu).toContainText('Canvas background');
  await expect(menu).toContainText('Keyboard shortcuts');
  expect(await visibleExternalAnchors(page), 'the canvas menu links out').toEqual([]);
  await page.keyboard.press('Escape');

  // The shortcut entry in that menu opens SketchPilot's own sheet, not the engine's help.
  await menuButton.click();
  await menu.getByText('Keyboard shortcuts').click();
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toContainText(/excalidraw/i);
  expect(await visibleExternalAnchors(page), 'the shortcut sheet links out').toEqual([]);
  await page.getByRole('button', { name: 'Done' }).click();

  // The engine's library panel: our own library lives in the dashboard, so the panel's
  // "Browse libraries" hand-off must not be reachable.
  await page.locator('.excalidraw .library-button, .excalidraw [title*="Library" i]').first().click();
  await page.waitForTimeout(600);
  expect(await visibleExternalAnchors(page), 'the library panel links out').toEqual([]);
  const helpIconVisible = await page
    .locator('.excalidraw .help-icon')
    .isVisible()
    .catch(() => false);
  expect(helpIconVisible, 'the engine help dialog is still reachable').toBe(false);
});

test('a11y: a dialog opened from a button traps Tab and gives focus back', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page, id } = await openNewDrawingFromDashboard(app.page, app.context);
  await page.locator('.excalidraw').waitFor();
  await page.waitForTimeout(500);
  await page.close();

  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  await app.page.reload();
  const opener = app.page.getByRole('button', { name: /^Delete / }).first();
  await expect(opener).toBeVisible({ timeout: 10_000 });
  await opener.click();

  const dialog = app.page.getByRole('dialog', { name: 'Delete this drawing?' });
  await expect(dialog).toBeVisible();

  const focusInsideDialog = () =>
    app.page.evaluate(() => {
      const dialogEl = document.querySelector('[role="dialog"]');
      const active = document.activeElement;
      return Boolean(dialogEl && active && active !== document.body && dialogEl.contains(active));
    });

  // The trap has to survive many more Tabs than the dialog has controls.
  for (let press = 0; press < 20; press += 1) {
    await app.page.keyboard.press('Tab');
    expect(await focusInsideDialog(), `focus left the dialog on Tab #${press + 1}`).toBe(true);
  }
  for (let press = 0; press < 8; press += 1) {
    await app.page.keyboard.press('Shift+Tab');
    expect(await focusInsideDialog(), `focus left the dialog on Shift+Tab #${press + 1}`).toBe(true);
  }

  await app.page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(id).toBeTruthy();
});

test('a11y: the shortcut sheet traps Tab away from the canvas', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await page.locator('.excalidraw').waitFor();
  await page.waitForTimeout(800);

  // Click the empty canvas first: the sheet only opens when the canvas has focus.
  await page.locator('.excalidraw').click({ position: { x: 60, y: 400 } });
  await page.keyboard.press('Shift+Slash');

  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();

  for (let press = 0; press < 20; press += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const dialogEl = document.querySelector('[role="dialog"]');
      const active = document.activeElement;
      return Boolean(dialogEl && active && active !== document.body && dialogEl.contains(active));
    });
    expect(inside, `focus left the sheet on Tab #${press + 1}`).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('a11y: reduced motion is honoured, and the editor still works', async () => {
  await app.page.emulateMedia({ reducedMotion: 'reduce' });
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await page.locator('.excalidraw').waitFor();
  // The editor opened in its own tab, so the media emulation has to be applied there too.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(600);

  const durations = await page.evaluate(() =>
    [...document.querySelectorAll('button')].slice(0, 12).map((button) => {
      const style = window.getComputedStyle(button);
      return {
        transition: parseFloat(style.transitionDuration || '0'),
        animation: parseFloat(style.animationDuration || '0'),
      };
    }),
  );
  for (const entry of durations) {
    expect(entry.transition, 'a transition survived reduced-motion').toBeLessThanOrEqual(0.002);
    expect(entry.animation, 'an animation survived reduced-motion').toBeLessThanOrEqual(0.002);
  }

  // Still usable: the toolbar responds.
  await expect(page.getByRole('textbox', { name: 'Drawing title' })).toBeVisible();
  await app.page.emulateMedia({ reducedMotion: null });
});

test('a11y: every interactive control on every surface has an accessible name', async () => {
  for (const surface of ['popup', 'dashboard', 'editor'] as const) {
    const page = await app.context.newPage();
    await page.goto(surfaceUrl(app.extensionId, surface));
    await page.waitForLoadState('networkidle');
    if (surface === 'editor') await page.locator('.excalidraw').waitFor().catch(() => {});
    await page.waitForTimeout(500);

    const unnamed = await page.evaluate(() => {
      const text = (node: Element) =>
        (node.getAttribute('aria-label') ??
          node.getAttribute('title') ??
          node.textContent ??
          '').trim();
      return [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')]
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .filter((node) => {
          if (node.closest('.excalidraw')) return false; // third-party chrome, excluded
          if (node instanceof HTMLInputElement && node.type === 'hidden') return false;
          if (text(node)) return false;
          const labelled = (node as HTMLInputElement).labels?.length ?? 0;
          return labelled === 0;
        })
        .map((node) => `${node.tagName.toLowerCase()}:${node.className}`);
    });
    expect(unnamed, `${surface} has controls with no accessible name`).toEqual([]);
    await page.close();
  }
});
