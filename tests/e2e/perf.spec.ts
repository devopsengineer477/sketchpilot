import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchExtension, surfaceUrl, type LaunchedExtension } from './helpers';

/**
 * Plan P5-T10/T11 — performance budgets, measured on the real extension.
 *
 * Run with `npm run perf`; the numbers it prints go into `docs/performance.md`. The
 * budgets are deliberately generous relative to a mid-range laptop because this runs in
 * headless Chromium in a small container (2 vCPU, ~2 GB): what is being guarded against is
 * a *regression* — a bundle that doubles, or an editor that stops painting — not the exact
 * milliseconds of the machine that happened to run it.
 */

const BUDGETS = {
  popupInteractiveMs: 300,
  editorInteractiveMs: 1500,
  dashboardFirstPaintMs: 800,
  frameP95Ms: 50,
  popupBundleKb: 300,
  editorBundleKb: 6000,
  distTotalMb: 10,
  fontAssetsMb: 3,
};

let app: LaunchedExtension;
const measured: string[] = [];

function record(label: string, value: number, unit: string, budget?: number) {
  const verdict = budget === undefined ? '' : value <= budget ? '  ✓ within budget' : '  ✗ OVER BUDGET';
  measured.push(`${label.padEnd(46)} ${value.toFixed(1).padStart(8)} ${unit}${budget === undefined ? '' : `  (budget ${budget} ${unit})`}${verdict}`);
}

test.beforeAll(async () => {
  app = await launchExtension();
});

test.afterAll(async () => {
  await app?.close();
  console.log(`\nPerformance measurements (v${process.env.npm_package_version ?? '1.0.0'})\n${'-'.repeat(96)}\n${measured.join('\n')}\n`);
});

/**
 * Time from navigation start until the page has painted a frame *and* shows its main
 * landmark. Measured in the page, so it includes scripting, layout and the first paint.
 */
async function timeToInteractive(page: Page, url: string, readySelector: string): Promise<number> {
  await page.goto(url, { waitUntil: 'commit' });
  return page.evaluate(async (selector) => {
    const started = performance.now();
    const ready = () =>
      document.querySelector(selector) !== null &&
      (document.body?.textContent?.trim().length ?? 0) > 0;
    while (performance.now() - started < 20_000) {
      if (ready()) break;
      await new Promise((done) => requestAnimationFrame(() => done(null)));
    }
    await new Promise((done) => requestAnimationFrame(() => done(null)));
    return performance.now();
  }, readySelector);
}

test('budget: the popup is interactive well under 300 ms', async () => {
  const page = await app.context.newPage();
  const ms = await timeToInteractive(page, surfaceUrl(app.extensionId, 'popup'), 'main, [role="main"], body');
  record('Popup: navigation start → interactive', ms, 'ms', BUDGETS.popupInteractiveMs);
  // Paint timing entries are not emitted for extension pages in headless Chromium, so the
  // navigation timing marks are what we can honestly report.
  const marks = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return {
      domContentLoaded: nav?.domContentLoadedEventEnd ?? 0,
      load: nav?.loadEventEnd ?? 0,
    };
  });
  record('Popup: DOMContentLoaded', marks.domContentLoaded, 'ms');
  record('Popup: load event', marks.load, 'ms');
  expect(ms).toBeLessThan(BUDGETS.popupInteractiveMs);
  await page.close();
});

test('budget: the dashboard lists a full library quickly', async () => {
  const page = await app.context.newPage();
  // Seed the library first so this is a real list, not an empty state.
  await page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  await page.evaluate(async (count) => {
    const open = () => new Promise<IDBDatabase>((res, rej) => {
      const request = indexedDB.open('sketchpilot');
      request.onsuccess = () => res(request.result);
      request.onerror = () => rej(request.error);
    });
    const db = await open();
    // The library lists from `meta`, so a seeded drawing needs both records — writing only
    // the document would make the list look empty and the measurement meaningless.
    const tx = db.transaction(['drawings', 'meta'], 'readwrite');
    const drawings = tx.objectStore('drawings');
    const meta = tx.objectStore('meta');
    for (let index = 0; index < count; index += 1) {
      const updatedAt = Date.now() - index * 1000;
      drawings.put({
        id: `perf-${index}`,
        schemaVersion: 1,
        appVersion: '1.0.0',
        title: `Library item ${index}`,
        createdAt: updatedAt,
        updatedAt,
        elements: [{ id: `r-${index}`, type: 'rectangle', x: 0, y: 0, width: 80, height: 40 }],
        appState: {},
        files: {},
      });
      meta.put({
        id: `perf-${index}`,
        title: `Library item ${index}`,
        createdAt: updatedAt,
        updatedAt,
        elementCount: 1,
        favorite: false,
        hasThumbnail: false,
      });
    }
    await new Promise((done) => (tx.oncomplete = () => done(null)));
    db.close();
  }, 40);

  const ms = await timeToInteractive(page, surfaceUrl(app.extensionId, 'dashboard'), 'main');
  record('Dashboard: navigation start → 40-item list painted', ms, 'ms', BUDGETS.dashboardFirstPaintMs);
  await expect(page.getByText('Library item 0')).toBeVisible({ timeout: 10_000 });
  expect(ms).toBeLessThan(BUDGETS.dashboardFirstPaintMs);
  await page.close();
});

/** Imports a synthetic 200-element drawing and returns its new id. */
async function importStressScene(page: Page, elements: number, title: string): Promise<string> {
  const drawing = {
    type: 'sketchpilot',
    schemaVersion: 1,
    appVersion: '1.0.0',
    exportedAt: Date.now(),
    drawing: {
      id: `00000000-0000-4000-8000-${String(elements).padStart(12, '0')}`,
      schemaVersion: 1,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      appVersion: '1.0.0',
      elements: Array.from({ length: elements }, (_, index) => ({
        id: `el-${index}`,
        type: index % 3 === 0 ? 'ellipse' : 'rectangle',
        x: (index % 20) * 140,
        y: Math.floor(index / 20) * 110,
        width: 110,
        height: 70,
        strokeColor: '#1e1e1e',
        backgroundColor: 'transparent',
        strokeWidth: 2,
      })),
      appState: {},
      files: {},
    },
  };

  await page.locator('input[type="file"]').setInputFiles({
    name: `${title}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(drawing)),
  });
  await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });

  return page.evaluate(async (wanted) => {
    const open = () => new Promise<IDBDatabase>((res, rej) => {
      const request = indexedDB.open('sketchpilot');
      request.onsuccess = () => res(request.result);
      request.onerror = () => rej(request.error);
    });
    const db = await open();
    const found = await new Promise<{ id: string }[]>((res) => {
      const request = db.transaction('drawings', 'readonly').objectStore('drawings').getAll();
      request.onsuccess = () => res(request.result as { id: string; title: string }[]);
    });
    db.close();
    const match = found.find((item) => (item as unknown as { title: string }).title === wanted);
    if (!match) throw new Error(`imported drawing "${wanted}" not found`);
    return match.id;
  }, title);
}

test('budget: a 200-element drawing opens as an interactive editor in under 1.5 s', async () => {
  const page = await app.context.newPage();
  await page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const id = await importStressScene(page, 200, 'Stress 200');
  await page.close();

  const editor = await app.context.newPage();
  const ms = await timeToInteractive(editor, surfaceUrl(app.extensionId, 'editor', id), '.excalidraw canvas');
  record('Editor: 200-element scene → interactive', ms, 'ms', BUDGETS.editorInteractiveMs);
  await expect(editor.locator('.excalidraw canvas').first()).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Drawing title' })).toHaveValue('Stress 200');
  expect(ms).toBeLessThan(BUDGETS.editorInteractiveMs);

  // Panning across a populated scene is the closest thing to "drawing" that is stable in
  // headless Chromium: it forces the same renderer path without depending on tool state.
  await editor.evaluate(() => {
    const target = window as unknown as { __frames: number[]; __stop: boolean };
    target.__frames = [];
    target.__stop = false;
    let last = performance.now();
    const tick = (now: number) => {
      target.__frames.push(now - last);
      last = now;
      if (!target.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const box = await editor.locator('.excalidraw canvas').first().boundingBox();
  if (box) {
    await editor.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await editor.mouse.down();
    for (let step = 0; step < 40; step += 1) {
      await editor.mouse.move(box.x + box.width / 2 - step * 6, box.y + box.height / 2 - step * 2);
    }
    await editor.mouse.up();
  }
  await editor.waitForTimeout(300);

  const frames = await editor.evaluate(() => {
    const target = window as unknown as { __frames: number[]; __stop: boolean };
    target.__stop = true;
    return target.__frames.filter((value) => Number.isFinite(value) && value > 0);
  });

  const sorted = [...frames].sort((left, right) => left - right);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  record('Editor: p95 frame interval while panning (200 els)', p95, 'ms', BUDGETS.frameP95Ms);
  record('Editor: frames sampled', frames.length, 'frames');
  expect(p95).toBeLessThan(BUDGETS.frameP95Ms);
  await editor.close();
});

/** Every file under a directory, with its size in KB. */
function walk(dir: string, base = dir): { name: string; kb: number }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return walk(path, base);
    return [{ name: path.slice(base.length + 1), kb: statSync(path).size / 1024 }];
  });
}

test('budget: the shipped bundles stay code-split and small', async () => {
  const dist = resolve(process.cwd(), 'dist');
  const assets = readdirSync(resolve(dist, 'assets'), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = resolve(dist, 'assets', entry.name);
      return { name: entry.name, kb: statSync(path).size / 1024 };
    });

  const js = assets.filter((asset) => asset.name.endsWith('.js'));
  const popup = js.filter((asset) => /popup/i.test(asset.name)).reduce((sum, asset) => sum + asset.kb, 0);
  const editor = js.filter((asset) => /editor/i.test(asset.name)).reduce((sum, asset) => sum + asset.kb, 0);
  // Whole package, not just dist/assets: the engine's font files live in their own folder
  // and are by far the largest thing we ship.
  const everything = walk(dist);
  const fonts = everything
    .filter((asset) => /excalidraw-assets\/fonts\//.test(asset.name) && /\.(woff2?|ttf)$/i.test(asset.name))
    .reduce((sum, asset) => sum + asset.kb, 0);
  const locales = everything
    .filter((asset) => /excalidraw-assets\/locales\//.test(asset.name))
    .reduce((sum, asset) => sum + asset.kb, 0);
  const total = everything.reduce((sum, asset) => sum + asset.kb, 0);

  record('Bundle: popup JS', popup, 'KB', BUDGETS.popupBundleKb);
  record('Bundle: editor JS', editor, 'KB', BUDGETS.editorBundleKb);
  record('Package: fonts (self-hosted)', fonts / 1024, 'MB', BUDGETS.fontAssetsMb);
  record('Package: locales', locales / 1024, 'MB');
  record('Package: dist total (unzipped)', total / 1024, 'MB', BUDGETS.distTotalMb);

  // The popup must never pull the canvas engine in: that is the whole point of splitting.
  expect(popup).toBeLessThan(BUDGETS.popupBundleKb);
  expect(editor).toBeLessThan(BUDGETS.editorBundleKb);
  expect(total / 1024).toBeLessThan(BUDGETS.distTotalMb);
  expect(fonts / 1024).toBeLessThan(BUDGETS.fontAssetsMb);

  const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8')) as { version: string };
  console.log(`dist/manifest.json reports version ${manifest.version}`);
});
