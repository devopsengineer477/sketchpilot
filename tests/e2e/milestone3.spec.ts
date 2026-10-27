import { expect, test, type Route } from '@playwright/test';
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

/**
 * These specs run the real extension against a *routed* provider endpoint: Playwright
 * intercepts the HTTPS call, so the whole path (settings → prompt → HTTP → validation →
 * layout → preview → insert) is exercised without a network or a real API key.
 */

const PROVIDER_BASE = 'https://api.openai.com/v1';

const VALID_DIAGRAM = {
  schemaVersion: 1,
  title: 'Password reset',
  nodes: [
    { id: 'start', label: 'User requests reset', shape: 'ellipse', emphasis: true },
    { id: 'exists', label: 'Account exists?', shape: 'diamond' },
    { id: 'send', label: 'Email reset link' },
    { id: 'deny', label: 'Show generic message' },
  ],
  edges: [
    { from: 'start', to: 'exists' },
    { from: 'exists', to: 'send', label: 'yes' },
    { from: 'exists', to: 'deny', label: 'no' },
  ],
  notes: [{ text: 'Never reveal whether an address is registered.' }],
};

function chatResponse(content: string, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 120, completion_tokens: 180, total_tokens: 300 },
    }),
  };
}

/** The editor opens in its own tab, so the stub must be routed on *that* page. */
async function stubProvider(page: import('@playwright/test').Page, content: string, status = 200) {
  await page.route(`${PROVIDER_BASE}/chat/completions`, (route: Route) =>
    route.fulfill(chatResponse(content, status)),
  );
}

async function configureAi(page: import('@playwright/test').Page, app: LaunchedExtension) {
  await page.goto(surfaceUrl(app.extensionId, 'settings'));
  await page.getByRole('checkbox', { name: /Enabled/ }).check();
  await page.getByLabel('Model').fill('gpt-4o-mini');
  await page.getByRole('textbox', { name: 'API key' }).fill('sk-test-key-abcdefghijkl');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('AI settings saved')).toBeVisible();
}

let app: LaunchedExtension;

test.beforeEach(async () => {
  app = await launchExtension();
});

test.afterEach(async () => {
  await app.close();
});

test('12. AI settings can be configured, tested and removed', async () => {
  await app.page.route(`${PROVIDER_BASE}/chat/completions`, (route: Route) => route.fulfill(chatResponse('ready')));

  await app.page.goto(surfaceUrl(app.extensionId, 'settings'));
  await expect(app.page.getByText('AI assistant')).toBeVisible();

  // Keys are masked, never echoed back in full.
  await app.page.getByRole('textbox', { name: 'API key' }).fill('sk-test-key-abcdefghijkl');
  await app.page.getByRole('checkbox', { name: /Enabled/ }).check();
  await app.page.getByRole('button', { name: 'Save settings' }).click();
  await expect(app.page.getByText('Saved key:')).toBeVisible();
  await expect(app.page.getByText('abcdefghijkl', { exact: false })).toHaveCount(0);

  await app.page.getByRole('button', { name: 'Test connection' }).click();
  await expect(app.page.getByText(/Connected/)).toBeVisible();

  const stored = await app.page.evaluate(async () => {
    const result = await chrome.storage.local.get('sketchpilot.ai');
    return result['sketchpilot.ai'] as { apiKey: string; enabled: boolean; usage: unknown[] };
  });
  expect(stored.apiKey).toBe('sk-test-key-abcdefghijkl');
  expect(stored.enabled).toBe(true);
  expect(stored.usage.length).toBeGreaterThan(0);

  await app.page.getByRole('button', { name: 'Remove key' }).click();
  await expect(app.page.getByText('API key removed')).toBeVisible();
  const cleared = await app.page.evaluate(async () => {
    const result = await chrome.storage.local.get('sketchpilot.ai');
    return result['sketchpilot.ai'] ?? null;
  });
  expect(cleared).toBeNull();
});

test('10 + 11. valid AI output previews, inserts as editable shapes, and undo restores', async () => {

  await configureAi(app.page, app);

  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await stubProvider(page, JSON.stringify(VALID_DIAGRAM));
  await drawRectangle(page);
  await waitForSaved(page);
  const before = await readStore(page);

  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByLabel('Describe the diagram').fill('Password reset flow with a decision');
  await page.getByRole('button', { name: 'Generate' }).click();

  // Preview only — nothing may touch the canvas yet.
  await expect(page.getByText('Preview — not on the canvas yet')).toBeVisible();
  await expect(page.getByText(/4 nodes · 3 edges/)).toBeVisible();
  expect((await readStore(page)).elements).toBe(before.elements);

  await page.getByRole('complementary', { name: 'AI assistant' }).getByRole('button', { name: 'Insert' }).click();
  await waitForSaved(page);

  const after = await readStore(page);
  expect(after.elements).toBeGreaterThan(before.elements);

  const labels = await page.evaluate(async () => {
    const id = new URLSearchParams(location.search).get('id');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sketchpilot');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const drawing = await new Promise<{ elements: Array<{ type: string; text?: string; containerId?: string }> }>(
      (resolve) => {
        const request = db.transaction('drawings').objectStore('drawings').get(id!);
        request.onsuccess = () => resolve(request.result as never);
      },
    );
    db.close();
    return {
      types: [...new Set(drawing.elements.map((element) => element.type))],
      texts: drawing.elements.filter((element) => element.type === 'text').map((element) => element.text),
    };
  });

  expect(labels.types).toContain('arrow');
  expect(labels.types).toContain('diamond');
  // Labels are bound text, so they wrap; compare on normalised text.
  const flat = labels.texts.join(' | ').replace(/\s+/g, ' ');
  expect(flat).toContain('User requests reset');
  expect(flat).toContain('Account exists?');
  expect(flat).toContain('Email reset link');
  expect(flat).toContain('Never reveal whether an address is registered.');

  // One undo removes the whole insertion (the AI plan is a single history entry).
  await page.getByRole('banner').getByRole('button', { name: /Undo/ }).click();
  await waitForSaved(page);
  expect((await readStore(page)).elements).toBe(before.elements);
});

test('11. a failed generation reports the problem and leaves the drawing byte-identical', async () => {

  await configureAi(app.page, app);

  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await stubProvider(page, 'I am afraid I cannot draw that.');
  await drawRectangle(page);
  await waitForSaved(page);

  const before = await page.evaluate(async () => {
    const id = new URLSearchParams(location.search).get('id');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sketchpilot');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const drawing = await new Promise((resolve) => {
      const request = db.transaction('drawings').objectStore('drawings').get(id!);
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return JSON.stringify(drawing);
  });

  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByLabel('Describe the diagram').fill('anything');
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect(page.getByRole('alert')).toContainText('did not return usable JSON');
  await expect(page.getByRole('alert')).toContainText('Your drawing was not changed.');
  await expect(page.getByText('Preview — not on the canvas yet')).toHaveCount(0);

  const after = await page.evaluate(async () => {
    const id = new URLSearchParams(location.search).get('id');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sketchpilot');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const drawing = await new Promise((resolve) => {
      const request = db.transaction('drawings').objectStore('drawings').get(id!);
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return JSON.stringify(drawing);
  });

  expect(after).toBe(before);
});

test('10. an invalid AI payload is rejected instead of corrupting the drawing', async () => {
  // Duplicate node id + an edge to a node that does not exist: the two failure modes the
  // schema exists to stop.
  const payload = {
    ...VALID_DIAGRAM,
    nodes: [
      { id: 'a', label: 'A' },
      { id: 'a', label: 'Duplicate id' },
      { id: 'b', label: 'B' },
    ],
    edges: [{ from: 'a', to: 'ghost' }],
  };

  await configureAi(app.page, app);
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await page.waitForTimeout(500);

  // The stub has to be in place before the editor tab exists.
  await stubProvider(app.page, JSON.stringify(payload));
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByLabel('Describe the diagram').fill('broken');
  await page.getByRole('button', { name: 'Generate' }).click();

  // The payload has one unusable edge and duplicate ids: it must be rejected cleanly,
  // never half-applied.
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await readStore(page)).elements).toBe(0);
});

test('AI is usable to explain the drawing, and text results never touch the canvas', async () => {

  await configureAi(app.page, app);
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await stubProvider(page, 'This diagram shows a reset flow with one decision.');
  await drawRectangle(page);
  await waitForSaved(page);
  const before = await readStore(page);

  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByRole('button', { name: /Explain this diagram/ }).click();
  await expect(page.getByText('This diagram shows a reset flow with one decision.')).toBeVisible();
  expect((await readStore(page)).elements).toBe(before.elements);
});

test('AI stays off, and clearly explained, without any configuration', async () => {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await page.getByRole('button', { name: 'AI', exact: true }).click();

  await expect(page.getByText('AI is not configured')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open AI settings' })).toBeVisible();
  await expect(page.getByLabel('Describe the diagram')).toHaveCount(0);

  // Drawing still works with no key at all.
  await drawRectangle(page);
  await waitForSaved(page);
  expect((await readStore(page)).elements).toBeGreaterThan(0);
});

test('replace canvas requires explicit confirmation', async () => {

  await configureAi(app.page, app);
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await stubProvider(page, JSON.stringify(VALID_DIAGRAM));
  await drawRectangle(page);
  await waitForSaved(page);

  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page.getByLabel('Describe the diagram').fill('A reset flow');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByText('Preview — not on the canvas yet')).toBeVisible();

  await page.getByRole('complementary', { name: 'AI assistant' }).getByRole('button', { name: 'Replace canvas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Replace everything on the canvas?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('This removes 1 existing element');

  // Cancelling changes nothing.
  const before = await readStore(page);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await readStore(page)).elements).toBe(before.elements);

  // Confirming swaps the canvas for the generated diagram.
  await page.getByRole('complementary', { name: 'AI assistant' }).getByRole('button', { name: 'Replace canvas' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace canvas' }).click();
  await waitForSaved(page);
  const after = await readStore(page);
  expect(after.elements).toBeGreaterThan(1);
});

test('the popup AI entry opens a drawing with the assistant already open', async () => {
  const popup = await app.context.newPage();
  await popup.goto(surfaceUrl(app.extensionId, 'popup'));

  await popup.getByRole('button', { name: 'Generate diagram with AI' }).click();
  const editor = await waitForSurface(app.context, /editor\.html/);
  await editor.waitForLoadState('domcontentloaded');

  await expect(editor.getByRole('complementary', { name: 'AI assistant' })).toBeVisible();
  // No key is configured in this fresh profile, so the panel explains what to do instead.
  await expect(editor.getByText('AI is not configured')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Open AI settings' })).toBeEnabled();
});
