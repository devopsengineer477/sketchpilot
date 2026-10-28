import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const EXTENSION_PATH = resolve(process.cwd(), 'dist');

export type LaunchedExtension = {
  context: BrowserContext;
  extensionId: string;
  page: Page;
  close: () => Promise<void>;
};

/**
 * Chrome profiles live on the real disk, not /tmp: the sandbox's /tmp is a small tmpfs and
 * a full one kills Chromium mid-test ("target page has been closed") with no useful error.
 */
const PROFILE_ROOT = resolve(process.cwd(), '.cache', 'e2e-profiles');

export async function launchExtension(): Promise<LaunchedExtension> {
  mkdirSync(PROFILE_ROOT, { recursive: true });
  const userDataDir = mkdtempSync(join(PROFILE_ROOT, 'profile-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  const extensionId = new URL(worker.url()).host;

  // The install flow opens the editor once. Give it a moment, then clear the deck so a
  // test never races a background tab when it waits for the page it just triggered.
  await new Promise((done) => setTimeout(done, 700));
  for (const stray of context.pages()) {
    await stray.close().catch(() => {});
  }

  const page = await context.newPage();
  return {
    context,
    extensionId,
    page,
    // Temp Chrome profiles are ~3 MB each; without this a day of test runs fills /tmp
    // and Chromium then fails to register the extension worker.
    close: async () => {
      await context.close();
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // A locked profile directory is harmless — the OS temp cleaner will get it.
      }
    },
  };
}

/**
 * Waits for the tab whose URL matches `pattern`.
 *
 * Clicking a button that opens a tab cannot use `waitForEvent('page')` alone: the
 * extension may already have other tabs (the install-time editor), and the event may hand
 * back the wrong one.
 */
export async function waitForSurface(
  context: BrowserContext,
  pattern: RegExp,
  timeoutMs = 15_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = context.pages().find((candidate) => pattern.test(candidate.url()));
    if (found) return found;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`no tab matched ${pattern} within ${timeoutMs}ms`);
}

export function surfaceUrl(extensionId: string, surface: 'editor' | 'dashboard' | 'popup', drawingId?: string) {
  const base = `chrome-extension://${extensionId}/${surface}.html`;
  return drawingId ? `${base}?id=${drawingId}` : base;
}

/** Reads the app's IndexedDB directly — the source of truth for persistence tests. */
export async function readStore(page: Page): Promise<{ drawings: number; elements: number; titles: string[] }> {
  return page.evaluate(async () => {
    const open = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sketchpilot');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await open();
    const readAll = <T,>(store: string) =>
      new Promise<T[]>((resolve) => {
        const tx = db.transaction(store, 'readonly');
        const request = tx.objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
      });
    const drawings = await readAll<{ title: string; elements: unknown[] }>('drawings');
    db.close();
    return {
      drawings: drawings.length,
      elements: drawings.reduce((total, drawing) => total + (drawing.elements?.length ?? 0), 0),
      titles: drawings.map((drawing) => drawing.title),
    };
  });
}

/** Draws a rectangle by dragging on the canvas with the rectangle tool active. */
export async function drawRectangle(page: Page, offset = { x: 0, y: 0 }) {
  const canvas = page.locator('.excalidraw canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const startX = box.x + box.width / 2 - 120 + offset.x;
  const startY = box.y + box.height / 2 - 80 + offset.y;

  // Click once so the canvas owns keyboard focus, then pick the rectangle tool.
  await page.mouse.click(startX, startY);
  await page.keyboard.press('r');
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 160, startY + 100, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/**
 * Screen position of the selection's bottom-right resize handle.
 *
 * The transformer handles are painted on the canvas, not DOM nodes, so they cannot be located with
 * a selector. They are drawn in the engine's selection blue, so the handle is found by scanning a
 * screenshot for the bottom-most, right-most strongly-blue pixel. Used by the resize regression
 * test, which needs a real drag on a real handle.
 */
export async function findSelectionHandle(page: Page): Promise<{ x: number; y: number }> {
  const { PNG } = await import('pngjs');
  const png = PNG.sync.read(await page.screenshot());
  let best = { x: 0, y: 0 };
  let bestScore = -Infinity;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (png.width * y + x) << 2;
      const r = png.data[index]!;
      const g = png.data[index + 1]!;
      const b = png.data[index + 2]!;
      const isSelectionBlue = b > 150 && b - r > 40 && b - g > 40 && r < 150;
      if (isSelectionBlue && x + y > bestScore) {
        bestScore = x + y;
        best = { x, y };
      }
    }
  }
  return best;
}

export async function waitForSaved(page: Page) {
  await page.getByText(/Saved/).first().waitFor({ timeout: 15_000 });
}

/** Creates a drawing from the dashboard and returns the tab the extension opened. */
export async function openNewDrawingFromDashboard(page: Page, context: import('@playwright/test').BrowserContext) {
  const [editorPage] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'New drawing' }).first().click(),
  ]);
  await editorPage.locator('.excalidraw').waitFor();
  await editorPage.waitForTimeout(500);
  const id = new URL(editorPage.url()).searchParams.get('id');
  return { page: editorPage, id };
}
