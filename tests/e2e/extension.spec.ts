import { expect, test } from '@playwright/test';
import {
  drawRectangle,
  launchExtension,
  openNewDrawingFromDashboard,
  readStore,
  surfaceUrl,
  waitForSaved,
  type LaunchedExtension,
} from './helpers';

let app: LaunchedExtension;

test.beforeEach(async () => {
  app = await launchExtension();
});

test.afterEach(async () => {
  await app.close();
});

test('1. the extension installs, registers a service worker and opens the editor', async () => {
  expect(app.extensionId).toMatch(/^[a-p]{32}$/);
  await app.page.goto(surfaceUrl(app.extensionId, 'editor'));
  await expect(app.page.locator('.excalidraw')).toBeVisible();
  await expect(app.page.getByRole('textbox', { name: 'Drawing title' })).toBeVisible();
});

test('2 + 3. a drawing can be created, shapes drawn, then undone and redone', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page, id } = await openNewDrawingFromDashboard(app.page, app.context);
  expect(id).toBeTruthy();

  await drawRectangle(page);
  await waitForSaved(page);
  const store = await readStore(page);
  expect(store.elements).toBeGreaterThan(0);

  await page.getByRole('banner').getByRole('button', { name: /Undo/ }).click();
  await page.waitForTimeout(700);
  await waitForSaved(page);
  expect((await readStore(page)).elements).toBe(0);

  await page.getByRole('banner').getByRole('button', { name: /Redo/ }).click();
  await page.waitForTimeout(700);
  await waitForSaved(page);
  expect((await readStore(page)).elements).toBe(store.elements);
});

test('5. drawings autosave and reopen after a reload', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);

  await drawRectangle(page);
  await waitForSaved(page);
  const before = await readStore(page);
  expect(before.elements).toBeGreaterThan(0);

  await page.reload();
  await page.locator('.excalidraw').waitFor();
  await page.waitForTimeout(2000);

  expect((await readStore(page)).elements).toBe(before.elements);
  await expect(page.getByText(/Saved/).first()).toBeVisible();
});

test('6. multiple drawings stay separate', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const first = await openNewDrawingFromDashboard(app.page, app.context);
  await drawRectangle(first.page);
  await waitForSaved(first.page);

  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const second = await openNewDrawingFromDashboard(app.page, app.context);
  await drawRectangle(second.page, { x: 40, y: 40 });
  await waitForSaved(second.page);
  await drawRectangle(second.page, { x: 80, y: 80 });
  await waitForSaved(second.page);

  expect(first.id).not.toBe(second.id);
  const store = await readStore(second.page);
  expect(store.drawings).toBeGreaterThanOrEqual(2);
  expect(store.elements).toBe(3);
});

test('8. PNG export produces a real image file', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await drawRectangle(page);
  await waitForSaved(page);

  await page.getByRole('button', { name: /Export/ }).click();
  const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
  await page.getByRole('menuitem', { name: /PNG image/ }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const buffer = Buffer.concat(chunks);
  expect(buffer.length).toBeGreaterThan(1000);
  expect(buffer.subarray(1, 4).toString()).toBe('PNG');
  await expect(page.getByText('PNG exported')).toBeVisible();
});

test('8d. exporting a PNG logs no engine warnings about ignored options', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await drawRectangle(page);
  await waitForSaved(page);

  // Collect everything the page logs, starting before the export and staying through the
  // idle-scheduled thumbnail render, which uses the same rasteriser.
  const messages: string[] = [];
  page.on('console', (message) => messages.push(message.text()));
  page.on('pageerror', (error) => messages.push(error.message));

  await page.getByRole('button', { name: /Export/ }).click();
  const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
  await page.getByRole('menuitem', { name: /PNG image/ }).click();
  await downloadPromise;
  await expect(page.getByText('PNG exported')).toBeVisible();

  // Give the throttled thumbnail job (idle callback, 4 s fallback) time to run as well.
  await page.waitForTimeout(5_000);

  // Regression: passing `quality` with a PNG mimeType made the engine log
  // `"quality" will be ignored for "image/png" mimeType`.
  expect(messages.filter((text) => /will be ignored/i.test(text))).toEqual([]);
});

test('8b. SVG export produces sanitised vector output', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await drawRectangle(page);
  await waitForSaved(page);

  await page.getByRole('button', { name: /Export/ }).click();
  const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
  await page.getByRole('menuitem', { name: /SVG vector/ }).click();
  const download = await downloadPromise;

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const svg = Buffer.concat(chunks).toString('utf8');
  expect(svg).toContain('<svg');
  expect(svg).not.toMatch(/<script/i);
  expect(svg).not.toMatch(/javascript:/i);
});

test('8c. JSON export is a valid, re-importable document', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await drawRectangle(page);
  await waitForSaved(page);

  await page.getByRole('button', { name: /Export/ }).click();
  const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
  await page.getByRole('menuitem', { name: /Editable JSON/ }).click();
  const download = await downloadPromise;

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(parsed.type).toBe('sketchpilot');
  // Schema version advances with the document model; assert it is a positive integer
  // and that the payload is the current format rather than pinning a number here.
  expect(parsed.schemaVersion).toBeGreaterThanOrEqual(1);
  expect(parsed.drawing.schemaVersion).toBe(parsed.schemaVersion);
  expect(parsed.drawing.elements.length).toBeGreaterThan(0);
});

test('17. no request ever leaves the extension while drawing and exporting', async () => {
  const external: string[] = [];
  app.context.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('chrome-extension://') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
    }
  });

  await app.page.goto(surfaceUrl(app.extensionId, 'editor'));
  await app.page.locator('.excalidraw').waitFor();
  await drawRectangle(app.page);
  await waitForSaved(app.page);
  await app.page.waitForTimeout(2000);

  expect(external).toEqual([]);
});

test('16. the theme toggle switches the editor between light and dark', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'editor'));
  await app.page.locator('.excalidraw').waitFor();

  await expect(app.page.locator('html')).not.toHaveClass(/dark/);
  await app.page.getByRole('button', { name: /Switch to dark theme/ }).click();
  await expect(app.page.locator('html')).toHaveClass(/dark/);
  await expect(app.page.getByRole('button', { name: /Switch to light theme/ })).toBeVisible();
});
