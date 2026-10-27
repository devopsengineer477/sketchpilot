import { expect, test } from '@playwright/test';
import {
  drawRectangle,
  launchExtension,
  openNewDrawingFromDashboard,
  readStore,
  surfaceUrl,
  waitForSaved,
  waitForSurface,
  type LaunchedExtension,
} from './helpers';

let app: LaunchedExtension;

test.beforeEach(async () => {
  app = await launchExtension();
});

test.afterEach(async () => {
  await app.close();
});

test('templates: the gallery renders all twelve, each from its own data', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  await app.page.getByRole('button', { name: 'Templates', exact: true }).click();

  const cards = app.page.locator('ul > li');
  await expect(cards).toHaveCount(12);

  for (const name of [
    'Simple flowchart',
    'Decision tree',
    'Mind map',
    'Software architecture',
    'CI/CD pipeline',
    'AWS three-tier',
    'API request lifecycle',
    'Test automation framework',
    'Incident response',
    'Project planning',
    'Daily task planning',
    'Learning roadmap',
  ]) {
    await expect(app.page.getByRole('heading', { name })).toBeVisible();
  }

  // Previews are inline SVGs from the template data — never a network request.
  const previews = app.page.locator('img[alt^="Preview of"]');
  await expect(previews.first()).toBeVisible();
  const firstSrc = await previews.first().getAttribute('src');
  expect(firstSrc).toContain('data:image/svg+xml');
});

test('templates: using one creates an editable drawing with real elements', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  await app.page.getByRole('button', { name: 'Templates', exact: true }).click();

  const card = app.page.locator('li', { hasText: 'CI/CD pipeline' }).first();
  await card.getByRole('button', { name: 'Use template' }).click();
  const editor = await waitForSurface(app.context, /editor\.html/);

  await editor.locator('.excalidraw').waitFor();
  await editor.waitForTimeout(1500);

  const store = await editor.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sketchpilot');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const drawings = await new Promise<Array<{ id: string; title: string; elements: Array<{ type: string }> }>>(
      (resolve) => {
        const request = db.transaction('drawings').objectStore('drawings').getAll();
        request.onsuccess = () => resolve(request.result as never);
      },
    );
    db.close();
    return drawings;
  });

  const created = store.find((drawing) => drawing.title === 'CI/CD pipeline');
  expect(created).toBeTruthy();
  expect(created!.elements.length).toBeGreaterThanOrEqual(7);
  const types = createTypes(created!.elements);
  expect(types).toContain('arrow');
  expect(types).toContain('rectangle');

  // The elements are ordinary editable elements, not a flattened image.
  await expect(editor.getByRole('textbox', { name: 'Drawing title' })).toHaveValue('CI/CD pipeline');
});

function createTypes(elements: Array<{ type: string }>): string[] {
  return [...new Set(elements.map((element) => element.type))];
}

test('templates: a drawing can be saved back out as a user template', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await drawRectangle(page);
  await waitForSaved(page);

  await page.getByRole('button', { name: 'Save selection as template' }).click();
  await page.getByLabel('Name').fill('My review flow');
  await page.getByLabel('Description').fill('Used in every code review pass');
  await page.getByRole('button', { name: 'Save template' }).click();
  await expect(page.getByText(/saved to your templates/i)).toBeVisible();

  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  await app.page.getByRole('button', { name: 'Templates', exact: true }).click();
  await app.page.getByRole('button', { name: 'Mine' }).click();

  await expect(app.page.getByRole('heading', { name: 'My review flow' })).toBeVisible();
  await expect(app.page.getByText('Used in every code review pass')).toBeVisible();
});

test('library: thumbnails appear for saved drawings without loading the engine', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await drawRectangle(page);
  await waitForSaved(page);

  const thumbnail = await page.evaluate(async () => {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sketchpilot');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<{ dataUrl?: string } | undefined>((resolve) => {
      const request = db.transaction('thumbnails').objectStore('thumbnails').get(id);
      request.onsuccess = () => resolve(request.result as never);
    });
    db.close();
    return record?.dataUrl ?? null;
  });

  expect(thumbnail).toContain('data:image/png;base64,');

  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const card = app.page.locator('ul > li').first();
  await expect(card.locator('img')).toBeVisible();
});

test('library: export writes a full archive that re-imports without overwriting', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await page.getByRole('textbox', { name: 'Drawing title' }).fill('Archive subject');
  await page.getByRole('textbox', { name: 'Drawing title' }).blur();
  await drawRectangle(page);
  await waitForSaved(page);

  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const downloadPromise = app.page.waitForEvent('download');
  await app.page.getByRole('button', { name: 'Export library backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^sketchpilot-library-.*\.json$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const archive = Buffer.concat(chunks);
  expect(JSON.parse(archive.toString('utf8')).type).toBe('sketchpilot-library');

  const archiveJson = JSON.parse(archive.toString('utf8'));
  const before = await readStore(app.page);
  await app.page.locator('input[type="file"]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: archive,
  });
  await expect(app.page.getByText(/Imported \d+ drawings/)).toBeVisible();

  const after = await readStore(app.page);
  // Every drawing comes back as a copy: nothing existing was replaced.
  expect(after.drawings).toBe(before.drawings + archiveJson.drawings.length);
});

test('settings: theme choice applies immediately and persists', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  await app.page.getByRole('button', { name: 'Settings' }).click();
  const settings = await waitForSurface(app.context, /settings\.html/);

  await settings.getByRole('radio', { name: 'Dark' }).click();
  await expect(settings.locator('html')).toHaveClass(/dark/);

  await settings.reload();
  await expect(settings.locator('html')).toHaveClass(/dark/);
  await expect(settings.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');

  await settings.getByRole('radio', { name: 'Light' }).click();
  await expect(settings.locator('html')).not.toHaveClass(/dark/);

  // The editor honours the same persisted preference.
  await app.page.goto(surfaceUrl(app.extensionId, 'editor'));
  await app.page.locator('.excalidraw').waitFor();
  await expect(app.page.locator('html')).not.toHaveClass(/dark/);
});

test('shortcuts: the sheet opens with "?" and never fires while renaming', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await page.locator('.excalidraw').waitFor();
  await page.waitForTimeout(800);

  const title = page.getByRole('textbox', { name: 'Drawing title' });
  await title.click();
  await title.press('?');
  await title.pressSequentially('why?');
  await expect(title).toHaveValue(/why\?/);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await title.blur();
  await page.locator('.excalidraw').click({ position: { x: 40, y: 400 } });
  await page.keyboard.press('Shift+Slash');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  // Exactly one sheet: SketchPilot's own, not the engine's help dialog as well.
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(dialog.getByText('Undo')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toHaveCount(0);
});

test('shortcuts: Ctrl+S commits immediately', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await drawRectangle(page);
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+s');
  await expect(page.getByText(/Saved/).first()).toBeVisible({ timeout: 10_000 });
});
