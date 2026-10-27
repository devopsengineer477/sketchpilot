import { expect, test, type Page } from '@playwright/test';
import {
  drawRectangle,
  launchExtension,
  openNewDrawingFromDashboard,
  readStore,
  surfaceUrl,
  waitForSaved,
  type LaunchedExtension,
} from './helpers';

/**
 * Browser capture (spec §7).
 *
 * One seam is not drivable from Playwright: `chrome.tabs.captureVisibleTab` needs an
 * `activeTab` grant, which Chrome only issues when a *real* person clicks the toolbar
 * icon, a context-menu item or a keyboard command. There is no supported way to fake that
 * gesture, so these specs cover everything around it for real — the protected-page check
 * runs against a genuinely protected tab, and the review/insert/save path runs from a
 * pending capture seeded with the same storage key the background worker writes.
 *
 * The screenshot API itself is covered by unit tests with a mocked `chrome.tabs`.
 */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M+AFzCOKhhVMAIVAADhWQIB7bL5owAAAABJRU5ErkJggg==';

const PENDING_KEY = 'sketchpilot.pending.';

async function seedPendingCapture(page: Page, capture: Record<string, unknown>): Promise<string> {
  await page.evaluate(
    async ({ key, value }) => {
      await chrome.storage.session.set({ [key]: value });
    },
    { key: `${PENDING_KEY}${capture.id as string}`, value: capture },
  );
  return capture.id as string;
}

function imageCapture(id: string) {
  return {
    id,
    kind: 'image',
    dataUrl: PNG,
    width: 10,
    height: 10,
    pageUrl: 'https://example.com/article',
    pageTitle: 'Example article',
    capturedAt: Date.now(),
  };
}

function selectionCapture(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'selection',
    text: 'SketchPilot captures the text you highlight on a page and keeps the source URL with it.',
    pageUrl: 'https://example.com/research/notes',
    pageTitle: 'Research notes',
    capturedAt: Date.now(),
    ...overrides,
  };
}

let app: LaunchedExtension;

test.beforeEach(async () => {
  app = await launchExtension();
});

test.afterEach(async () => {
  await app.close();
});

test('13. a protected page is refused with honest copy, not a silent failure', async () => {
  const popup = await app.context.newPage();
  await popup.goto(surfaceUrl(app.extensionId, 'popup'));

  // The popup tab is itself a browser-extension page, which is exactly the class of page
  // Chrome protects — so this exercises the real refusal path end to end.
  await popup.bringToFront();
  const reply = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'capture.tab' }));

  expect(reply.ok).toBe(false);
  expect(reply.message).toMatch(/browser extension|not a website/i);
  expect(reply.hint).toMatch(/protected|PDF viewer/i);
});

test('13. capture without a grant explains what to do instead of hanging', async () => {
  const popup = await app.context.newPage();
  await popup.goto(surfaceUrl(app.extensionId, 'popup'));

  const chromeTab = await app.context.newPage();
  await chromeTab.goto('chrome://version');
  await chromeTab.bringToFront();

  const reply = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'capture.tab' }));
  expect(reply.ok).toBe(false);
  expect(reply.message).toBeTruthy();
  expect(reply.hint).toMatch(/toolbar icon|click/i);

  // The failure is also delivered to the editor, so a keyboard/context-menu capture never
  // disappears without a word.
  const editor = await app.context.newPage();
  await editor.goto(`${surfaceUrl(app.extensionId, 'editor')}`);
  await expect(editor.locator('.excalidraw')).toBeVisible();
});

test('a screenshot is reviewed, inserted as a real image element, and survives a reload', async () => {
  const seedPage = await app.context.newPage();
  await seedPage.goto(surfaceUrl(app.extensionId, 'popup'));
  const id = await seedPendingCapture(seedPage, imageCapture('img-e2e-1'));

  const editor = await app.context.newPage();
  await editor.goto(`${surfaceUrl(app.extensionId, 'editor')}?pending=${id}`);

  // Review first: nothing is on the canvas until Insert is pressed.
  const dialog = editor.getByRole('dialog', { name: 'Capture this page?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('not part of the drawing yet');
  await expect(dialog).toContainText('example.com');

  await dialog.getByRole('button', { name: 'Insert into drawing' }).click();
  await expect(editor.getByText('Page captured')).toBeVisible();
  await waitForSaved(editor);

  const stored = await readStore(editor);
  expect(stored.drawings).toBe(1);

  // The image is a real element with its file data persisted, not a flattened bitmap.
  const inspected = await editor.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sketchpilot');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const drawings = await new Promise<any[]>((resolve) => {
      const request = db.transaction('drawings').objectStore('drawings').getAll();
      request.onsuccess = () => resolve(request.result as never);
    });
    db.close();
    const drawing = drawings[0];
    const image = drawing.elements.find((element: any) => element.type === 'image');
    return {
      elementType: image?.type ?? null,
      fileId: image?.fileId ?? null,
      hasFile: Boolean(image?.fileId && drawing.files?.[image.fileId]?.dataURL),
      link: image?.link ?? null,
      source: image?.customData?.sketchpilotSource ?? null,
    };
  });

  expect(inspected.elementType).toBe('image');
  expect(inspected.hasFile).toBe(true);
  expect(inspected.link).toBe('https://example.com/article');
  expect(inspected.source?.title).toBe('Example article');

  // Reopen: the picture comes from IndexedDB, with no network involved.
  await editor.reload();
  await expect(editor.locator('.excalidraw')).toBeVisible();
  await waitForSaved(editor);
  expect((await readStore(editor)).elements).toBeGreaterThan(0);
});

test('a discarded screenshot leaves nothing behind — not even an empty drawing', async () => {
  const seedPage = await app.context.newPage();
  await seedPage.goto(surfaceUrl(app.extensionId, 'popup'));
  const id = await seedPendingCapture(seedPage, imageCapture('img-e2e-2'));

  const editor = await app.context.newPage();
  await editor.goto(`${surfaceUrl(app.extensionId, 'editor')}?pending=${id}`);

  const dialog = editor.getByRole('dialog', { name: 'Capture this page?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Discard' }).click();
  await expect(editor.getByText('Capture discarded')).toBeVisible();
  await editor.waitForTimeout(600);

  expect((await readStore(editor)).drawings).toBe(0);

  // The pending record is single-use: it was deleted when the editor read it.
  const stillThere = await seedPage.evaluate(async (key) => {
    const stored = await chrome.storage.session.get(key);
    return stored[key] ?? null;
  }, `${PENDING_KEY}${id}`);
  expect(stillThere).toBeNull();
});

test('selected text becomes a sticky note that remembers its source', async () => {
  await app.context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const seedPage = await app.context.newPage();
  await seedPage.goto(surfaceUrl(app.extensionId, 'popup'));
  const id = await seedPendingCapture(seedPage, selectionCapture('sel-e2e-1'));

  const editor = await app.context.newPage();
  await editor.goto(`${surfaceUrl(app.extensionId, 'editor')}?pending=${id}`);

  const dialog = editor.getByRole('dialog', { name: 'Text captured from this page' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Research notes');
  await dialog.getByRole('button', { name: 'Add as sticky note' }).click();

  await expect(editor.getByText('Sticky note added')).toBeVisible();
  await waitForSaved(editor);

  const note = await editor.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('sketchpilot');
      request.onsuccess = () => resolve(request.result);
    });
    const drawings = await new Promise<any[]>((resolve) => {
      const request = db.transaction('drawings').objectStore('drawings').getAll();
      request.onsuccess = () => resolve(request.result as never);
    });
    db.close();
    const drawing = drawings[0];
    const box = drawing.elements.find((element: any) => element.type === 'rectangle');
    const label = drawing.elements.find(
      (element: any) => element.type === 'text' && element.containerId === box?.id,
    );
    return { source: box?.customData?.sketchpilotSource ?? null, link: box?.link ?? null, text: label?.text ?? '' };
  });

  expect(note.link).toBe('https://example.com/research/notes');
  expect(note.source?.title).toBe('Research notes');
  // Bound labels wrap, so compare on collapsed whitespace.
  expect(note.text.replace(/\s+/g, ' ')).toContain('SketchPilot captures the text you highlight');

  // Selecting the note shows where it came from, and Copy carries the URL with the text.
  await editor.locator('.excalidraw').click({ position: { x: 420, y: 300 } });
  await editor.keyboard.press('Control+a');
  const chip = editor.locator('text=Research notes').first();
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await editor.getByRole('button', { name: 'Copy' }).first().click();
  const clipboard = await editor.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('https://example.com/research/notes');
});

test('page text cannot reach a provider until the payload is confirmed', async () => {
  let requests = 0;
  await app.page.route('https://api.openai.com/v1/chat/completions', (route) => {
    requests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        choices: [
          {
            message: {
              content: JSON.stringify({
                schemaVersion: 1,
                title: 'Notes',
                nodes: [{ id: 'a', label: 'Capture' }, { id: 'b', label: 'SketchPilot' }],
                edges: [{ from: 'a', to: 'b' }],
                notes: [],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    });
  });

  // Configure a provider first, otherwise the panel shows its "not configured" state.
  await app.page.goto(surfaceUrl(app.extensionId, 'settings'));
  await app.page.getByRole('checkbox', { name: /Enabled/ }).check();
  await app.page.getByRole('textbox', { name: 'API key' }).fill('sk-test-key-abcdefghijkl');
  await app.page.getByRole('button', { name: 'Save settings' }).click();
  await expect(app.page.getByText('AI settings saved')).toBeVisible();

  const seedPage = await app.context.newPage();
  await seedPage.goto(surfaceUrl(app.extensionId, 'popup'));
  const id = await seedPendingCapture(seedPage, selectionCapture('sel-e2e-2', { intent: 'mindmap' }));

  const editor = await app.context.newPage();
  await editor.route('https://api.openai.com/v1/chat/completions', (route) => {
    requests += 1;
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await editor.goto(`${surfaceUrl(app.extensionId, 'editor')}?pending=${id}`);

  const dialog = editor.getByRole('dialog', { name: 'Text captured from this page' });
  await dialog.getByRole('button', { name: 'Mind map (AI)' }).click();

  // The panel opens with the text in the prompt, and refuses to send it unconfirmed.
  await expect(editor.getByText('This prompt contains text from a web page')).toBeVisible();
  await expect(editor.getByText(/character/)).toBeVisible();
  const generate = editor.getByRole('button', { name: 'Generate' });
  await expect(generate).toBeDisabled();
  expect(requests).toBe(0);

  // Editing the prompt revokes consent too.
  await editor.getByLabel('Describe the diagram').fill('Different prompt');
  await expect(editor.getByText('This prompt contains text from a web page')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Generate' })).toBeDisabled();

  // "Remove page text" clears the payload instead of sending it.
  await editor.getByRole('button', { name: 'Remove page text' }).click();
  await expect(editor.getByLabel('Describe the diagram')).toHaveValue('');
  expect(requests).toBe(0);
});

test('the commands are declared, bound, and listed with their effective keys', async () => {
  const popup = await app.context.newPage();
  await popup.goto(surfaceUrl(app.extensionId, 'popup'));
  const commands = await popup.evaluate(() => chrome.commands.getAll());
  const byName = Object.fromEntries(commands.map((command) => [command.name, command.shortcut]));

  expect(byName['new-drawing']).toBe('Ctrl+Shift+7');
  expect(byName['capture-tab']).toBe('Ctrl+Shift+9');
  expect(byName['capture-selection']).toBe('Ctrl+Shift+8');
  // Declared but unbound: rebindable at chrome://extensions/shortcuts.
  expect(byName['open-dashboard']).toBe('');

  // The editor's own sheet lists what Chrome actually has, not what the manifest wished for.
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await drawRectangle(page);
  await waitForSaved(page);
  await page.keyboard.press('?');
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Browser commands')).toBeVisible();
  await expect(sheet.getByText('Ctrl+Shift+7')).toBeVisible();
  await expect(sheet.getByText('Unbound')).toBeVisible();
});

test('the capture entry points exist and are wired, not decorative', async () => {
  const popup = await app.context.newPage();
  await popup.goto(surfaceUrl(app.extensionId, 'popup'));
  await expect(popup.getByRole('button', { name: 'Capture this page' })).toBeEnabled();
  await expect(popup.getByText(/right-click/i)).toBeVisible();

  // Clicking it runs the real handler end to end; on this (extension) tab Chrome refuses.
  await popup.getByRole('button', { name: 'Capture this page' }).click();
  await expect(popup.getByRole('alert')).toBeVisible();
  await expect(popup.getByRole('alert')).toContainText(/extension|protected|permission/i);
});
