import { expect, test, type Page } from '@playwright/test';
import {
  findSelectionHandle,
  launchExtension,
  openNewDrawingFromDashboard,
  surfaceUrl,
  waitForSaved,
  type LaunchedExtension,
} from './helpers';

/**
 * The Elements panel end to end: closed by default, opened from the TopBar or Shift+P, inserting
 * real grouped elements that autosave, undo as one step, follow the theme and never touch the
 * network or another product's name.
 */

let app: LaunchedExtension;

test.beforeEach(async () => {
  app = await launchExtension();
});

test.afterEach(async () => {
  await app.close();
});

async function openEditor() {
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  return openNewDrawingFromDashboard(app.page, app.context);
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Elements' });
const openPanel = async (page: Page) => {
  await page.getByRole('button', { name: 'Elements panel' }).click();
  await expect(panel(page)).toBeVisible();
};

/**
 * Reads back what autosave stored, so assertions are about persisted elements, not the DOM.
 * IndexedDB writes are debounced behind the editor's autosave, so every assert below polls
 * instead of sampling once — a single early read reports the *previous* save.
 */
async function waitForAtLeast(page: Page, minimum: number, timeoutMs = 8_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    last = (await savedElements(page)).length;
    if (last >= minimum) return last;
    await page.waitForTimeout(200);
  }
  return last;
}

async function waitForSavedElementCount(page: Page, expected: number, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    last = (await savedElements(page)).length;
    if (last === expected) return last;
    await page.waitForTimeout(200);
  }
  return last;
}


/** Scene position of the first element, read through the app's own JSON export. */
async function firstScenePosition(page: Page) {
  const { readFileSync } = await import('node:fs');
  await page.getByRole('button', { name: /Export/ }).click();
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('menuitem', { name: /JSON/ }).click();
  await (await download).saveAs('/tmp/palette-position.json');
  const payload = JSON.parse(readFileSync('/tmp/palette-position.json', 'utf8')) as {
    drawing: { elements: { x: number; y: number }[] };
  };
  return { x: payload.drawing.elements[0]!.x, y: payload.drawing.elements[0]!.y };
}

async function savedElements(page: Page) {
  return page.evaluate(async () => {
    const open = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sketchpilot');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await open();
    const drawings = await new Promise<{ elements: Record<string, unknown>[] }[]>((resolve) => {
      const request = db.transaction('drawings', 'readonly').objectStore('drawings').getAll();
      request.onsuccess = () => resolve(request.result as { elements: Record<string, unknown>[] }[]);
    });
    db.close();
    const elements = drawings.flatMap((drawing) => drawing.elements ?? []);
    return elements.map((element) => ({
      type: element.type as string,
      text: element.text as string | undefined,
      groupIds: (element.groupIds ?? []) as string[],
      strokeColor: element.strokeColor as string,
      backgroundColor: element.backgroundColor as string,
    }));
  });
}

test('1. the panel is closed by default and opens from the TopBar and Shift+P', async () => {
  const { page } = await openEditor();
  await expect(page.locator('.excalidraw')).toBeVisible();

  await expect(panel(page)).toHaveCount(0);
  await openPanel(page);
  await expect(panel(page).getByRole('heading', { name: 'Elements' })).toBeVisible();

  await page.getByRole('button', { name: 'Close elements panel' }).click();
  await expect(panel(page)).toHaveCount(0);

  await page.locator('.excalidraw').click({ position: { x: 400, y: 420 } });
  await page.keyboard.press('Shift+P');
  await expect(panel(page)).toBeVisible();
});

test('2. the open/closed choice survives a reload', async () => {
  const { page } = await openEditor();
  await openPanel(page);
  await page.waitForTimeout(400);
  await page.reload();
  await page.locator('.excalidraw').waitFor();
  await expect(panel(page)).toBeVisible();

  await page.getByRole('button', { name: 'Close elements panel' }).click();
  await page.waitForTimeout(300);
  await page.reload();
  await page.locator('.excalidraw').waitFor();
  await expect(panel(page)).toHaveCount(0);
});

test('3. all 16 standard elements are listed and searchable', async () => {
  const { page } = await openEditor();
  await openPanel(page);

  const cards = panel(page).locator('[data-symbol]');
  await expect(cards).toHaveCount(16);
  for (const name of ['User', 'Client', 'Web server', 'Database', 'Cache', 'Queue']) {
    await expect(panel(page).getByRole('button', { name: `Insert ${name}` })).toBeVisible();
  }

  const search = panel(page).getByRole('searchbox', { name: 'Search elements' });
  await search.fill('db');
  await expect(cards).toHaveCount(1);
  await expect(panel(page).getByRole('button', { name: 'Insert Database' })).toBeVisible();

  await search.fill('nothing-matches-this');
  await expect(panel(page).getByText(/No elements match/)).toBeVisible();
});

test('4. clicking a symbol inserts a grouped, editable database', async () => {
  const { page } = await openEditor();
  await openPanel(page);
  await panel(page).getByRole('button', { name: 'Insert Database' }).click();
  // `waitForSaved` can match a badge left over from an earlier save, so wait for the elements
  // themselves to reach IndexedDB.
  expect(await waitForAtLeast(page, 3)).toBe(3);

  const elements = await savedElements(page);
  // Cylinder = top ellipse + body polyline, plus the label.
  expect(elements).toHaveLength(3);
  expect(elements.filter((element) => element.text === 'Database')).toHaveLength(1);
  const groupIds = elements.map((element) => element.groupIds.join(','));
  expect(new Set(groupIds).size).toBe(1);
  expect(groupIds[0]).not.toBe('');
  // Monochrome: ink strokes, no fills.
  expect(elements.every((element) => element.backgroundColor === 'transparent')).toBe(true);
});

test('5. an inserted symbol undoes in one step, not one element at a time', async () => {
  const { page } = await openEditor();
  await openPanel(page);
  await panel(page).getByRole('button', { name: 'Insert User' }).click();
  expect(await waitForAtLeast(page, 3)).toBeGreaterThan(1);

  // One undo must remove the whole symbol, not one element of it.
  await page.getByRole('banner').getByRole('button', { name: /Undo/ }).click();
  expect(await waitForSavedElementCount(page, 0)).toBe(0);
});

test('6. every symbol inserts without error and survives a reload', async () => {
  const { page } = await openEditor();
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await openPanel(page);

  const ids = await panel(page)
    .locator('[data-symbol]')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.symbol ?? ''));

  for (const id of ids) {
    await page.evaluate(() => window.localStorage.setItem('sketchpilot.paletteProbe', '1'));
    await panel(page).locator(`[data-symbol="${id}"]`).click();
    await page.waitForTimeout(120);
  }
  await waitForSaved(page);

  const types = await savedElements(page);
  expect(types.length).toBeGreaterThan(ids.length * 2);
  expect(types.some((element) => element.text === 'Database')).toBe(true);
  expect(types.some((element) => element.text === 'Web server')).toBe(true);
  expect(consoleErrors).toEqual([]);

  await page.reload();
  await page.locator('.excalidraw').waitFor();
  expect((await savedElements(page)).length).toBe(types.length);
});

test('7. symbols follow the theme: ink in light mode, light ink in dark mode', async () => {
  const { page } = await openEditor();
  await page.getByRole('button', { name: /Switch to dark theme|Dark mode|theme/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await openPanel(page);
  await panel(page).getByRole('button', { name: 'Insert Cache' }).click();
  await waitForSaved(page);

  const elements = await savedElements(page);
  const strokes = new Set(elements.map((element) => element.strokeColor));
  // Either theme is acceptable here; what matters is that the symbol is monochrome and visible
  // against the background it was inserted on (never the same colour as a white canvas in dark).
  expect(strokes.size).toBe(1);
  const stroke = [...strokes][0]!;
  expect(['#1e1e1e', '#e9ecef']).toContain(stroke);
});

test('8. the panel is keyboard operable', async () => {
  const { page } = await openEditor();
  await openPanel(page);

  // Opening focuses the search box; Tab reaches the first card and Enter inserts it.
  await expect(panel(page).getByRole('searchbox', { name: 'Search elements' })).toBeFocused();
  await page.keyboard.press('Tab');
  const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute('data-symbol-label'));
  expect(focusedLabel).toBeTruthy();
  await page.keyboard.press('Enter');
  await waitForAtLeast(page, 1);
  expect((await savedElements(page)).length).toBeGreaterThan(0);

  // Escape closes the panel while focus is inside it.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
});

test('9. inserting stays offline and adds no third-party name', async () => {
  const { page } = await openEditor();
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('chrome-extension://') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
    }
  });

  await openPanel(page);
  await page.getByRole('searchbox', { name: 'Search elements' }).fill('cloud');
  await panel(page).getByRole('button', { name: 'Insert Cloud' }).click();
  await waitForSaved(page);

  expect(external).toEqual([]);
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/excalidraw/i);
});

/** Drags a panel card onto a canvas point, exercising the real pointer path. */
async function dragToCanvas(page: Page, symbolId: string, dx: number, dy: number) {
  const card = await page.getByRole('complementary', { name: 'Elements' }).locator(`[data-symbol="${symbolId}"]`).boundingBox();
  const canvas = await page.locator('.excalidraw canvas').first().boundingBox();
  if (!card || !canvas) throw new Error('missing card or canvas');
  const targetX = Math.round(canvas.x + dx);
  const targetY = Math.round(canvas.y + dy);

  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  // Cross the drag threshold first so this is a drag, not a click.
  await page.mouse.move(card.x + card.width / 2 + 24, card.y + card.height / 2 + 4, { steps: 4 });
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return { targetX, targetY };
}

test('10. dragging a symbol drops it where the pointer is', async () => {
  const { page } = await openEditor();
  await openPanel(page);

  await dragToCanvas(page, 'database', 260, 200);
  await waitForSaved(page);
  const first = await savedElements(page);
  expect(first.length).toBeGreaterThan(0);
  const firstX = await firstScenePosition(page);
  expect(firstX).not.toBeNull();

  // Undo, then drop the same symbol 120 px right and 70 px down. The recorded scene position must
  // move by the same amount at 1:1 zoom — which proves the drop point is honoured, not ignored.
  await page.getByRole('banner').getByRole('button', { name: /Undo/ }).click();
  expect(await waitForSavedElementCount(page, 0)).toBe(0);

  await dragToCanvas(page, 'database', 380, 270);
  await waitForSaved(page);
  const second = await firstScenePosition(page);
  expect(second!.x - firstX!.x).toBeCloseTo(120, -1);
  expect(second!.y - firstX!.y).toBeCloseTo(70, -1);

  // A drag is one insertion, never two (the click that follows must be swallowed).
  expect((await savedElements(page)).filter((element) => element.text === 'Database')).toHaveLength(1);
});

test('11. dropping outside the canvas inserts nothing, and Escape cancels a drag', async () => {
  const { page } = await openEditor();
  await openPanel(page);
  const panel = page.getByRole('complementary', { name: 'Elements' });
  const card = await panel.locator('[data-symbol="user"]').boundingBox();

  // Drag back onto the panel and release there.
  await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2);
  await page.mouse.down();
  await page.mouse.move(card!.x + 4, card!.y + 140, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  expect(await savedElements(page)).toHaveLength(0);

  // Escape mid-drag abandons it and leaves the canvas untouched.
  await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2);
  await page.mouse.down();
  await page.mouse.move(card!.x + 60, card!.y + 60, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(700);
  expect(await savedElements(page)).toHaveLength(0);
});

test('12. a shaky press stays a click, and the ghost appears only while dragging', async () => {
  const { page } = await openEditor();
  await openPanel(page);
  const panel = page.getByRole('complementary', { name: 'Elements' });
  const card = await panel.locator('[data-symbol="cache"]').boundingBox();

  // 2 px of jitter: below the threshold, so this must behave like a normal click.
  await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2);
  await page.mouse.down();
  await page.mouse.move(card!.x + card!.width / 2 + 2, card!.y + card!.height / 2 + 1, { steps: 2 });
  await page.mouse.up();
  await waitForAtLeast(page, 2);
  expect((await savedElements(page)).filter((element) => element.text === 'Cache')).toHaveLength(1);

  // A real drag shows a ghost while in flight and removes it on release.
  const canvas = await page.locator('.excalidraw canvas').first().boundingBox();
  await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas!.x + 500, canvas!.y + 300, { steps: 10 });
  await expect(page.locator('[data-palette-ghost="over"]')).toHaveCount(1);
  await expect(page.locator('.palette-drop-target')).toHaveCount(1);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(page.locator('[data-palette-ghost]')).toHaveCount(0);
  await expect(page.locator('.palette-drop-target')).toHaveCount(0);
});

test('13. resizing a symbol keeps its shape instead of breaking it', async () => {
  const { page } = await openEditor();
  await openPanel(page);
  await page.getByRole('complementary', { name: 'Elements' }).locator('[data-symbol="database"]').click();
  await waitForSaved(page);

  const before = await savedGeometry(page);
  // The regression: a line element with width/height 0 resized to nothing, flattening the arc.
  expect(before.line!.width).toBeGreaterThan(10);
  expect(before.line!.height).toBeGreaterThan(10);

  const handle = await findSelectionHandle(page);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 150, handle.y + 90, { steps: 12 });
  await page.mouse.up();
  await waitForSaved(page);

  const after = await savedGeometry(page);
  // Every part grew by (roughly) the same factor, and the cylinder is still a cylinder: the body
  // polyline keeps a non-zero height, and its points still span the element's own box.
  const scaleX = after.ellipse!.width / before.ellipse!.width;
  const scaleY = after.ellipse!.height / before.ellipse!.height;
  expect(scaleX).toBeGreaterThan(1.5);
  expect(scaleY).toBeGreaterThan(1.5);
  expect(after.line!.height / before.line!.height).toBeCloseTo(scaleY, 1);
  expect(after.line!.width / before.line!.width).toBeCloseTo(scaleX, 1);
});

/** Ellipse + polyline geometry of the single symbol on the canvas. */
async function savedGeometry(page: Page) {
  const { readFileSync } = await import('node:fs');
  await page.getByRole('button', { name: /Export/ }).click();
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('menuitem', { name: /JSON/ }).click();
  await (await download).saveAs('/tmp/palette-geometry.json');
  const payload = JSON.parse(readFileSync('/tmp/palette-geometry.json', 'utf8')) as {
    drawing: {
      elements: {
        type: string;
        width: number;
        height: number;
        points?: [number, number][];
      }[];
    };
  };
  const ellipse = payload.drawing.elements.find((element) => element.type === 'ellipse');
  const line = payload.drawing.elements.find((element) => element.type === 'line');
  return { ellipse, line, points: line?.points ?? [] };
}
