import { test } from '@playwright/test';
import { drawRectangle, launchExtension, openNewDrawingFromDashboard, surfaceUrl, waitForSaved } from './helpers';

/** Shown in the docs as the page being captured; rendered locally, no network involved. */
function mockArticleHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;background:#fff}
    .bar{background:#0f172a;color:#fff;padding:10px 24px;font-size:13px;display:flex;gap:16px}
    .wrap{max-width:760px;margin:0 auto;padding:36px 24px}
    h1{font-size:32px;line-height:1.25;margin:0 0 8px}
    p.meta{color:#6b7280;font-size:13px;margin:0 0 24px}
    h2{font-size:19px;margin:28px 0 8px}
    code{background:#f3f4f6;padding:1px 5px;border-radius:4px;font-size:14px}
    .highlight{background:#fef9c3}
  </style></head><body>
  <div class="bar"><strong>Engineering notebook</strong><span>Handbook</span><span>Search</span></div>
  <div class="wrap">
    <h1>Designing a capture pipeline that respects the page</h1>
    <p class="meta">Handbook · 6 min read · updated today</p>
    <p>When an extension reads a page, the interesting decisions are not about pixels — they are
    about <span class="highlight">what the extension is allowed to touch, and when.</span></p>
    <h2>Read on demand, never in the background</h2>
    <p>An injected reader that exists only for the duration of one user gesture is a different
    security proposition from a content script that loads on every page.</p>
    <h2>Keep provenance attached</h2>
    <p>Text lifted out of a page should carry its URL, its title and the time it was taken.</p>
    <h2>Never send a page to a model silently</h2>
    <p>Any flow that could transmit page text has to show the payload first.</p>
  </div></body></html>`;
}

/**
 * Screenshot capture for the docs. Not an assertion suite — run it explicitly with
 *   npx playwright test tests/e2e/shots.spec.ts
 * after a build, so docs/screenshots stays honest about what the extension looks like.
 */

const DIAGRAM = {
  schemaVersion: 1,
  title: 'CI/CD pipeline',
  nodes: [
    { id: 'dev', label: 'Developer pushes to GitHub', emphasis: true },
    { id: 'actions', label: 'GitHub Actions: build + test' },
    { id: 'ecr', label: 'Image pushed to Amazon ECR' },
    { id: 'ecs', label: 'Deploy to ECS Fargate' },
    { id: 'db', label: 'PostgreSQL on RDS' },
    { id: 'obs', label: 'CloudWatch logs + alarms' },
  ],
  edges: [
    { from: 'dev', to: 'actions' },
    { from: 'actions', to: 'ecr' },
    { from: 'ecr', to: 'ecs' },
    { from: 'ecs', to: 'db', label: 'reads/writes' },
    { from: 'ecs', to: 'obs', label: 'telemetry' },
  ],
  notes: [],
};

test('capture browser-capture screenshots', async () => {
  test.setTimeout(180_000);
  const app = await launchExtension();

  // Render a stand-in page and take a real screenshot of it to seed the review dialog.
  const web = await app.context.newPage();
  await web.setContent(mockArticleHtml());
  const shot = await web.screenshot();
  const dataUrl = `data:image/png;base64,${shot.toString('base64')}`;

  const surfaces = await app.context.newPage();
  await surfaces.goto(surfaceUrl(app.extensionId, 'popup'));
  await surfaces.screenshot({ path: 'docs/screenshots/popup.png' });

  const base = {
    pageUrl: 'https://handbook.example.com/capture-pipeline',
    pageTitle: 'Designing a capture pipeline that respects the page',
    capturedAt: Date.now(),
  };

  await surfaces.evaluate(
    async (value) => {
      await chrome.storage.session.set({ [`sketchpilot.pending.${value.id}`]: value });
    },
    { id: 'shot-image', kind: 'image', dataUrl, width: 1280, height: 800, ...base },
  );
  const imageEditor = await app.context.newPage();
  await imageEditor.goto(`${surfaceUrl(app.extensionId, 'editor')}?pending=shot-image`);
  await imageEditor.getByRole('dialog', { name: 'Capture this page?' }).waitFor();
  await imageEditor.waitForTimeout(300);
  await imageEditor.screenshot({ path: 'docs/screenshots/capture-review.png' });
  await imageEditor
    .getByRole('dialog', { name: 'Capture this page?' })
    .getByRole('button', { name: 'Insert into drawing' })
    .click();
  await waitForSaved(imageEditor);
  await imageEditor.waitForTimeout(500);
  await imageEditor.screenshot({ path: 'docs/screenshots/capture-inserted.png' });

  await surfaces.evaluate(
    async (value) => {
      await chrome.storage.session.set({ [`sketchpilot.pending.${value.id}`]: value });
    },
    {
      id: 'shot-selection',
      kind: 'selection',
      text:
        'An injected reader that exists only for the duration of one user gesture is a different security proposition from a content script that loads on every page.',
      ...base,
    },
  );
  const selectionEditor = await app.context.newPage();
  await selectionEditor.goto(`${surfaceUrl(app.extensionId, 'editor')}?pending=shot-selection`);
  await selectionEditor.getByRole('dialog', { name: 'Text captured from this page' }).waitFor();
  await selectionEditor.waitForTimeout(300);
  await selectionEditor.screenshot({ path: 'docs/screenshots/capture-selection.png' });

  await app.close();
});

test('capture AI screenshots', async () => {
  test.setTimeout(180_000);
  const app = await launchExtension();
  const reply = {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      choices: [{ message: { content: JSON.stringify(DIAGRAM) } }],
      usage: { prompt_tokens: 120, completion_tokens: 180, total_tokens: 300 },
    }),
  };
  await app.page.route('https://api.openai.com/v1/chat/completions', (route) => route.fulfill(reply));

  await app.page.goto(surfaceUrl(app.extensionId, 'settings'));
  await app.page.getByRole('checkbox', { name: /Enabled/ }).check();
  await app.page.getByRole('textbox', { name: 'API key' }).fill('sk-demo-key-for-screenshots');
  await app.page.getByRole('button', { name: 'Save settings' }).click();
  await app.page.waitForTimeout(400);
  await app.page.locator('#ai-heading').scrollIntoViewIfNeeded();
  await app.page.screenshot({ path: 'docs/screenshots/settings-ai.png', fullPage: true });

  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  await page.route('https://api.openai.com/v1/chat/completions', (route) => route.fulfill(reply));
  await drawRectangle(page);
  await waitForSaved(page);
  await page.getByRole('button', { name: 'AI', exact: true }).click();
  await page
    .getByLabel('Describe the diagram')
    .fill('Our CI/CD: push to GitHub, Actions builds and tests, image to ECR, deploy to ECS Fargate, PostgreSQL on RDS, CloudWatch.');
  await page.getByRole('button', { name: 'Generate' }).click();
  await page.getByText('Preview — not on the canvas yet').waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/screenshots/editor-ai-preview.png' });

  await page.getByRole('complementary', { name: 'AI assistant' }).getByRole('button', { name: 'Insert' }).click();
  await waitForSaved(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/screenshots/editor-ai-inserted.png' });
  await app.close();
});

/**
 * Core surfaces. These were previously hand-captured, which is how `editor-light.png` ended up
 * showing the engine's old help button long after it was removed. Everything in
 * `docs/screenshots/` is now produced from the packaged build by this file.
 */
test('capture core surface screenshots', async () => {
  test.setTimeout(300_000);
  const app = await launchExtension();

  // Empty library first — a fresh profile has no drawings.
  await app.page.setViewportSize({ width: 1440, height: 900 });
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  await app.page.waitForTimeout(900);
  await app.page.screenshot({ path: 'docs/screenshots/dashboard-empty.png' });

  // Then a populated one: import a real architecture scene through the normal import path.
  await app.page.locator('input[type="file"]').setInputFiles({
    name: 'payments.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      type: 'sketchpilot',
      schemaVersion: 1,
      appVersion: '1.0.1',
      exportedAt: Date.now(),
      drawing: {
        id: '8f0a4c1e-2222-4222-8222-222222222222',
        schemaVersion: 1,
        appVersion: '1.0.1',
        title: 'Payments architecture',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        elements: [
          { id: 'p1', type: 'rectangle', x: 0, y: 40, width: 170, height: 70, strokeColor: '#1971c2', backgroundColor: '#a5d8ff' },
          { id: 'p2', type: 'arrow', x: 175, y: 75, width: 80, height: 0, points: [[0, 0], [80, 0]] },
          { id: 'p3', type: 'rectangle', x: 260, y: 40, width: 190, height: 70, strokeColor: '#1971c2', backgroundColor: '#a5d8ff' },
          { id: 'p4', type: 'arrow', x: 455, y: 75, width: 75, height: 0, points: [[0, 0], [75, 0]] },
          { id: 'p5', type: 'diamond', x: 535, y: 20, width: 150, height: 110, backgroundColor: '#ffec99' },
          { id: 'p6', type: 'arrow', x: 690, y: 75, width: 70, height: 0, points: [[0, 0], [70, 0]] },
          { id: 'p7', type: 'rectangle', x: 765, y: 40, width: 170, height: 70, strokeColor: '#2f9e44', backgroundColor: '#b2f2bb' },
          { id: 'p8', type: 'arrow', x: 610, y: 135, width: 0, height: 75, strokeStyle: 'dashed', points: [[0, 0], [0, 75]] },
          { id: 'p9', type: 'rectangle', x: 520, y: 215, width: 180, height: 70, strokeColor: '#e03131', backgroundColor: '#ffc9c9' },
        ],
        appState: {},
        files: {},
      },
    })),
  });
  await app.page.getByText('Payments architecture').waitFor({ timeout: 15_000 });

  // Open it: this is also what makes the library generate a thumbnail.
  const [editorTab] = await Promise.all([
    app.context.waitForEvent('page'),
    app.page.getByText('Payments architecture').first().click(),
  ]);
  await editorTab.setViewportSize({ width: 1440, height: 900 });
  await editorTab.locator('.excalidraw').waitFor();
  await editorTab.waitForTimeout(1600);
  await editorTab.keyboard.press('Escape');
  await editorTab.waitForTimeout(400);
  await editorTab.screenshot({ path: 'docs/screenshots/editor-light.png' });

  await editorTab.getByRole('button', { name: 'Switch to dark theme' }).click();
  await editorTab.waitForTimeout(800);
  await editorTab.screenshot({ path: 'docs/screenshots/editor-dark.png' });
  await editorTab.getByRole('button', { name: 'Switch to light theme' }).click();
  await editorTab.waitForTimeout(400);

  // The shortcut sheet — the same one the canvas menu's "Keyboard shortcuts" entry opens.
  await editorTab.locator('.excalidraw').click({ position: { x: 300, y: 760 } });
  await editorTab.keyboard.press('Shift+Slash');
  await editorTab.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor();
  await editorTab.waitForTimeout(500);
  await editorTab.screenshot({ path: 'docs/screenshots/shortcuts.png' });
  await editorTab.getByRole('button', { name: 'Done' }).click();

  // Give the idle thumbnail job time to run (it regenerates at most every 8 s), then reopen
  // the library so the card shows a real preview rather than "PREVIEW PENDING".
  await editorTab.waitForTimeout(9_000);
  await editorTab.close();
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  await app.page.getByText('Payments architecture').waitFor({ timeout: 15_000 });
  await app.page
    .getByText('PREVIEW PENDING')
    .waitFor({ state: 'detached', timeout: 25_000 })
    .catch(() => {});
  await app.page.waitForTimeout(1000);
  await app.page
    .getByRole('button', { name: 'Dismiss notification' })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
  await app.page.screenshot({ path: 'docs/screenshots/dashboard.png' });

  // Templates gallery.
  await app.page.getByRole('button', { name: 'Templates', exact: true }).click();
  await app.page.waitForTimeout(900);
  await app.page.screenshot({ path: 'docs/screenshots/templates.png', fullPage: true });

  // A drawing instantiated from a template — the README hero.
  const [templateTab] = await Promise.all([
    app.context.waitForEvent('page'),
    app.page.getByRole('button', { name: 'Use template' }).first().click(),
  ]);
  await templateTab.setViewportSize({ width: 1440, height: 900 });
  await templateTab.locator('.excalidraw').waitFor();
  await templateTab.waitForTimeout(2400);
  await templateTab.keyboard.press('Escape');
  await templateTab.waitForTimeout(400);
  await templateTab.screenshot({ path: 'docs/screenshots/editor-template.png' });
  await templateTab.close();

  // Settings, light and dark (the theme there is a radio group, not an icon toggle).
  await app.page.goto(surfaceUrl(app.extensionId, 'settings'));
  await app.page.waitForTimeout(1000);
  await app.page.screenshot({ path: 'docs/screenshots/settings.png', fullPage: true });
  await app.page.getByRole('radio', { name: 'Dark' }).click();
  await app.page.waitForTimeout(900);
  await app.page.screenshot({ path: 'docs/screenshots/settings-dark.png', fullPage: true });

  await app.close();
});

/**
 * The Elements panel, captured while it is being used: four standard symbols placed by dragging
 * the freshly inserted group, so the screenshot shows the feature rather than a menu.
 */
test('capture standard-elements screenshots', async () => {
  test.setTimeout(180_000);
  const app = await launchExtension();
  await app.page.setViewportSize({ width: 1280, height: 800 });
  await app.page.goto(surfaceUrl(app.extensionId, 'dashboard'));
  const { page } = await openNewDrawingFromDashboard(app.page, app.context);
  page.setDefaultTimeout(15_000);

  await page.getByRole('button', { name: 'Elements panel' }).click();
  const panel = page.getByRole('complementary', { name: 'Elements' });
  const box = await page.locator('.excalidraw canvas').first().boundingBox();
  const cx = Math.round(box!.x + box!.width / 2);
  const cy = Math.round(box!.y + box!.height / 2);

  const place = async (id: string, dx: number, dy: number) => {
    await panel.locator(`[data-symbol="${id}"]`).click();
    await page.waitForTimeout(300);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 6 });
    await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  };

  await place('user', -260, -120);
  await place('client-desktop', -40, -120);
  await place('web-server', 180, -120);
  await place('database', -40, 80);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/editor-elements.png' });

  await page.getByRole('button', { name: /Switch to dark/i }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'docs/screenshots/editor-elements-dark.png' });

  // Drag-to-place, captured mid-flight: the ghost at the pointer and the canvas drop outline.
  await page.getByRole('button', { name: /Switch to light/i }).click();
  await page.waitForTimeout(700);
  const card = await panel.locator('[data-symbol="queue"]').boundingBox();
  const canvas = await page.locator('.excalidraw canvas').first().boundingBox();
  await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2);
  await page.mouse.down();
  await page.mouse.move(card!.x + 60, card!.y + 20, { steps: 5 });
  await page.mouse.move(canvas!.x + 420, canvas!.y + 470, { steps: 12 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'docs/screenshots/editor-elements-drag.png' });
  await page.mouse.up();
  await page.waitForTimeout(300);

  await app.close();
});
