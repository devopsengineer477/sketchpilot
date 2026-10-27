import { expect, test, type Page } from '@playwright/test';
import { launchExtension, openNewDrawingFromDashboard, surfaceUrl, type LaunchedExtension } from './helpers';

/**
 * Branding and attribution guard.
 *
 * SketchPilot AI is its own product. Two things follow from that, and this file enforces both:
 *
 * 1. **Nothing in the UI may present another product's name, links or offers.** No "Excalidraw
 *    links" menu group, no help dialog full of third-party links, no library hand-off to a
 *    third-party site. Those existed because the drawing engine ships them by default; they are
 *    removed, and this test keeps them removed across dependency upgrades.
 * 2. **The licences of the open-source components we ship are still honoured.** Removing
 *    branding is not the same as removing attribution: MIT and Apache-2.0 require the copyright
 *    notice to travel with the code. `THIRD-PARTY-NOTICES.txt` ships inside the package and is
 *    referenced from the README and the store listing — that is a legal requirement, not an
 *    endorsement, and it is deliberately not hidden.
 */

let app: LaunchedExtension;

test.beforeAll(async () => {
  app = await launchExtension();
});

test.afterAll(async () => {
  await app?.close();
});

const BRAND = /excalidraw/i;

/** Every user-visible string on a page that mentions another product's brand. */
async function brandHits(page: Page): Promise<string[]> {
  return page.evaluate((pattern: string) => {
    const brand = new RegExp(pattern, 'i');
    const hits = new Set<string>();
    // Visible only: the underlying library still contains its own strings in the bundle, and
    // hidden elements are not part of what the user sees. What must hold is that nothing the
    // user can see or focus names another product.
    const visible = (node: Element) => (node as HTMLElement).offsetParent !== null || node.getClientRects().length > 0;
    for (const node of document.querySelectorAll('body *')) {
      if (node.children.length > 0) continue;
      const text = (node.textContent ?? '').trim();
      if (text && brand.test(text) && visible(node)) hits.add(`${node.tagName.toLowerCase()} text: ${text.slice(0, 90)}`);
    }
    for (const node of document.querySelectorAll('[title], [aria-label], [placeholder], [alt], [value]')) {
      if (!visible(node)) continue;
      for (const attribute of ['title', 'aria-label', 'placeholder', 'alt', 'value']) {
        const value = node.getAttribute(attribute);
        if (value && brand.test(value)) hits.add(`${node.tagName.toLowerCase()} ${attribute}: ${value.slice(0, 90)}`);
      }
    }
    if (brand.test(document.title)) hits.add(`document title: ${document.title}`);
    return [...hits];
  }, BRAND.source);
}

test('no surface shows another product\'s name, in any state we can reach', async () => {
  test.setTimeout(300_000);
  const findings: Record<string, string[]> = {};

  for (const surface of ['popup', 'dashboard', 'settings'] as const) {
    const page = await app.context.newPage();
    await page.goto(surfaceUrl(app.extensionId, surface));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    const hits = await brandHits(page);
    if (hits.length) findings[surface] = hits;
    await page.close();
  }

  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await page.locator('.excalidraw').waitFor();
  await page.waitForTimeout(1200);

  const record = async (state: string) => {
    const hits = await brandHits(page);
    if (hits.length) findings[state] = hits;
  };

  await record('editor (idle)');

  // Tooltips on every toolbar control (cheap), plus the ones that open a panel or dialog.
  const toolbar = page.locator('.excalidraw .App-toolbar button, .excalidraw .Island button');
  const count = await toolbar.count();
  const opensSomething = /library|menu|more|mermaid|palette|stats|frame|extra|help|search/i;
  for (let index = 0; index < count; index += 1) {
    const button = toolbar.nth(index);
    const label = (await button.getAttribute('title')) ?? (await button.getAttribute('aria-label')) ?? `#${index}`;
    await button.hover({ timeout: 1_000 }).catch(() => {});
    await page.waitForTimeout(120);
    await record(`toolbar hover: ${label}`);
    if (!opensSomething.test(label)) continue;
    await button.click({ timeout: 1_000 }).catch(() => {});
    await page.waitForTimeout(300);
    await record(`toolbar open: ${label}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }

  // The panels and dialogs a user can actually open.
  const states: Array<[string, () => Promise<unknown>]> = [
    ['canvas menu', () => page.locator('.excalidraw .dropdown-menu-button').first().click({ timeout: 2_000 })],
    ['library panel', () => page.locator('.excalidraw .library-button').first().click({ timeout: 2_000 })],
    ['AI panel', () => page.getByRole('button', { name: 'AI', exact: true }).click({ timeout: 2_000 })],
    ['shortcut sheet', async () => {
      await page.locator('.excalidraw').click({ position: { x: 300, y: 760 }, timeout: 2_000 });
      await page.keyboard.press('Shift+Slash');
    }],
    ['export menu', () => page.getByRole('button', { name: /Export/ }).click({ timeout: 2_000 })],
  ];

  for (const [state, open] of states) {
    await open().catch(() => {});
    await page.waitForTimeout(500);
    await record(state);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  console.log(`BRAND FINDINGS\n${JSON.stringify(findings, null, 1)}`);

  // The removals must be surgical: the "More tools" menu still offers its two local tools.
  await page.locator('.excalidraw [data-testid="dropdown-menu-button"]').first().click({ timeout: 2_000 }).catch(() => {});
  await page.waitForTimeout(400);
  const menuText = await page.locator('.excalidraw .dropdown-menu').first().innerText().catch(() => '');
  expect(menuText, 'Frame tool was removed along with the third-party entries').toMatch(/frame tool/i);
  expect(menuText, 'Laser pointer was removed along with the third-party entries').toMatch(/laser pointer/i);
  expect(menuText, 'Web Embed is still offered').not.toMatch(/web embed/i);
  await page.keyboard.press('Escape');

  // Report everything found at once, so a fix pass is one look rather than ten runs.
  expect(findings).toEqual({});
});

test('the package ships the licences of its open-source components', async () => {
  // Removing other products' branding must not remove their copyright notices: MIT/Apache-2.0
  // require them to travel with the shipped code. This is attribution, not endorsement.
  await app.page.goto(surfaceUrl(app.extensionId, 'popup'));
  const notices = await app.page.evaluate(async (extensionId) => {
    const url = `chrome-extension://${extensionId}/THIRD-PARTY-NOTICES.txt`;
    const response = await fetch(url);
    return response.ok ? response.text() : '';
  }, app.extensionId);

  expect(notices.length, 'THIRD-PARTY-NOTICES.txt is missing from the package').toBeGreaterThan(1000);
  expect(notices).toMatch(/MIT License/i);
  expect(notices).toMatch(/Permission is hereby granted, free of charge/i);
  expect(notices).toMatch(/THE SOFTWARE IS PROVIDED "AS IS"/i);
  expect(notices).toMatch(/Excalidraw/); // the notice we are legally required to keep
  expect(notices).toMatch(/Apache License/i); // react / zod / others

  // Our own licence ships too — the package is self-describing.
  const own = await app.page.evaluate(async (extensionId) => {
    const response = await fetch(`chrome-extension://${extensionId}/LICENSE.txt`);
    return response.ok ? response.text() : '';
  }, app.extensionId);
  expect(own).toMatch(/MIT License/);
  expect(own).toMatch(/SketchPilot AI contributors/);
});

test('the manifest and store metadata describe one product, our own', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'popup'));
  const manifest = await app.page.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.name).toMatch(/^SketchPilot AI$/);
  expect(JSON.stringify(manifest)).not.toMatch(BRAND);
  expect(manifest.description).not.toMatch(BRAND);
});
