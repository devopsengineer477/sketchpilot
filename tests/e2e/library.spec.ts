import { expect, test } from '@playwright/test';
import { launchExtension, openNewDrawingFromDashboard, readStore, surfaceUrl, waitForSaved, type LaunchedExtension } from './helpers';

let app: LaunchedExtension;

test.beforeEach(async () => {
  app = await launchExtension();
});

test.afterEach(async () => {
  await app.close();
});

test('dashboard lists drawings, searches and opens them', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);

  await page.getByRole('textbox', { name: 'Drawing title' }).fill('Quarterly roadmap');
  await page.getByRole('textbox', { name: 'Drawing title' }).blur();
  await page.waitForTimeout(1500);
  await waitForSaved(page);

  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  await expect(app.page.getByText('Quarterly roadmap')).toBeVisible();

  await app.page.getByRole('searchbox', { name: 'Search drawings by title' }).fill('roadmap');
  await expect(app.page.getByText('Quarterly roadmap')).toBeVisible();

  await app.page.getByRole('searchbox', { name: 'Search drawings by title' }).fill('nothing-matches-this');
  await expect(app.page.getByText('No drawings match that')).toBeVisible();
});

test('7. importing an invalid file shows an error and creates nothing', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const before = await readStore(app.page);

  await app.page.locator('input[type="file"]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"totally":"not a drawing"}'),
  });

  await expect(app.page.getByRole('alert')).toContainText('does not look like a SketchPilot drawing');
  const after = await readStore(app.page);
  expect(after.drawings).toBe(before.drawings);
});

test('7b. importing a valid export adds the drawing', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const valid = {
    type: 'sketchpilot',
    schemaVersion: 1,
    appVersion: '0.1.0',
    exportedAt: Date.now(),
    drawing: {
      id: '3f0a4c1e-1111-4111-8111-111111111111',
      schemaVersion: 1,
      title: 'Imported flow',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      appVersion: '0.1.0',
      elements: [
        { id: 'el-1', type: 'rectangle', x: 0, y: 0, width: 120, height: 60 },
      ],
      appState: {},
      files: {},
    },
  };

  await app.page.locator('input[type="file"]').setInputFiles({
    name: 'imported.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(valid)),
  });

  await expect(app.page.getByText('Imported flow')).toBeVisible();
});

test('popup renders and lists recent drawings', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  await openNewDrawingFromDashboard(app.page, app.context);

  await app.page.goto(surfaceUrl(app.extensionId, 'popup'));
  await expect(app.page.getByRole('button', { name: 'New drawing' })).toBeVisible();
  await expect(app.page.getByText('Recent')).toBeVisible();
  await expect(app.page.getByText(/No drawings yet|Untitled drawing/).first()).toBeVisible();
});
