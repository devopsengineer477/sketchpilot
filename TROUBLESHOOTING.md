# Troubleshooting

## Build

**`npm install` fails with `ERESOLVE` / peer dependency errors**
The project pins React 18.3.1 on purpose (see `docs/adr-002-react-version.md`). Use a
clean install: `rm -rf node_modules package-lock.json && npm install`. Do not add
`--force`; if a peer conflict appears, the dependency that introduced it needs a
decision, not a flag.

**`npm build` fails in `check-build.mjs` with "permissions changed"**
The manifest and `PERMISSIONS.md` disagree. That check exists so permissions can never
widen silently. Update both in the same commit if the change is intended.

**Build fails with "new Function() found in …"**
The allowlist only covers the engine's `subset-shared.chunk` / `subset-worker.chunk`
(its Emscripten wasm glue). If a new file appears, treat it as a real finding: find the
dependency, decide, then extend the allowlist with a written reason — never delete the
check.

**The extension loads but shows a blank page**
Open DevTools on the tab and check the console. If you see a failed request to
`esm.sh`, the asset path was not set: `src/editor/bootstrap.ts` must run before the
engine mounts (`window.EXCALIDRAW_ASSET_PATH`), and `dist/excalidraw-assets/fonts`
must exist in the build.

## Extension

**"Load unpacked" rejects the folder**
Point it at `dist/`, not the repository root. `dist/manifest.json` only exists after
`npm run build`.

**Nothing happens when I click the toolbar icon**
Make sure `dist/popup.html` exists. If you changed the manifest, click the reload
button on `chrome://extensions`.

**The drawing is empty after reloading the page**
This was a real bug in the first cut of the adapter: Excalidraw mutates element objects
in place during a gesture, so change detection based on array identity persisted a 0×0
element. It now uses the engine's `getSceneVersion` signature, and an end-to-end test
covers the reload path. If you see it again, capture a trace with
`npx playwright show-trace`.

**Undo does nothing from the top bar**
The engine only exposes undo/redo through its keyboard binding, which must be
dispatched on the `.excalidraw` container — dispatching on `document` is silently
ignored. This is contained in `src/editor/engine/scene.ts`.

## Storage

**"Local storage is full, so this change was not saved."**
Chrome's per-origin quota was hit (often from large embedded images). Export the
drawing as JSON, delete drawings you no longer need from the dashboard, then re-import
the JSON.

**The dashboard says a drawing no longer exists**
It was deleted in another tab or by "delete all local data". Nothing else removes
drawings.

**I cleared site data and lost drawings**
Extension storage is removed with the extension's data. Use
**Export → Editable JSON** for anything you want to keep outside the browser.

## Import / export

**"That file does not look like a SketchPilot drawing"**
The file is neither a SketchPilot export, a `.excalidraw` scene, nor a document with an
`elements` array. Plain images and Mermaid files are not importable yet.

**"This drawing was saved by a newer version of SketchPilot"**
The file's `schemaVersion` is ahead of this build. Update the extension rather than
editing the file.

**Exports are huge or slow**
PNG export is capped at ~40 megapixels; very large scenes are scaled down instead of
freezing the tab. SVG has no such cap but is rendered from the same scene bounds.

**The exported SVG has no fonts when opened elsewhere**
Excalidraw draws text using bundled handwriting fonts. Viewers that do not embed or
have those fonts will substitute them; convert to PNG if the exact look matters.

## Tests

**Playwright cannot find the extension**
`npm run build` must run first: the suite loads `dist/`. Ensure
`npx playwright install chromium` has been run.

**Playwright fails to launch Chromium with a missing `libnspr4.so` (Linux)**
Install the browser dependencies: `npx playwright install-deps chromium`.

**`--load-extension` is ignored**
Since Chrome 137 the flag is restricted for branded Chrome builds. Use Playwright's
bundled Chromium (as configured) or Chrome for Testing.

## Capture (Milestone 4)

**"Chrome does not allow extensions to read its own pages."**
Expected. `chrome://`, the Chrome Web Store, other extensions' pages and `file://` (unless
you grant file access) are protected. The message names the page type; the hint says what
to do instead. Nothing is broken.

**"SketchPilot did not have permission for this tab."**
`activeTab` is granted only for the tab in front of you, only at the moment you act. If you
switched tabs between clicking the popup and pressing Capture, click the SketchPilot icon
again while the page you want is visible. For a keyboard-first workflow, bind
`chrome://extensions/shortcuts` → "Capture the visible tab" to something memorable.

**The screenshot came out blank or of the wrong tab.**
Chrome captures the *visible* area of the *active* tab. Full-screen video players and
DRM-protected sites can return a black frame; that is a browser restriction, not an
extension bug.

**"The extension could not be loaded" after a rebuild.**
Chrome refuses a manifest with more than four *suggested* shortcuts. `npm run check:build`
fails the build for that now, but if you hand-edit `dist/manifest.json`, that is the usual
culprit.

**A capture disappeared.**
Pending captures are held in `chrome.storage.session` — RAM only, cleared when Chrome
closes — and are deleted the moment the editor reads them. If the review tab was closed
before you pressed Insert, capture the page again.

**File pages will not capture.**
Enable *Allow access to file URLs* for SketchPilot on `chrome://extensions`.

## The editor UI

**There is no `?` help button in the bottom-left corner of the canvas.**
Deliberate. The engine's help dialog is a list of links to excalidraw.com (documentation,
blog, GitHub, YouTube) and nothing else, so it was removed in 1.0.1 — including its button.
Press `?` (or open the canvas menu → *Keyboard shortcuts*) for SketchPilot's own sheet, which
documents the app, the canvas and the browser commands.

**The library panel has no "Browse libraries" button.**
Also deliberate: it opened libraries.excalidraw.com with a referrer token for the extension
ID. SketchPilot's library is the dashboard ("Open dashboard" in the top bar). Dragging a
`.excalidrawlib` file onto the canvas still imports it.

**I want the engine's menu back.**
`src/editor/EngineMenu.tsx` is what renders the menu; delete its use in `EditorApp.tsx` (the
`<EngineMenu />` child of `<Excalidraw>`) and the default returns — along with the external
links. The regression test in `tests/e2e/milestone5.spec.ts` will then fail, on purpose.

## Tests, CI and the release guard (Milestone 5)

**`'NODE_OPTIONS' is not recognized as an internal or external command` (or the same for any
variable name).** You are on a version where an npm script used the POSIX `VAR=value command`
prefix, which `cmd.exe` and PowerShell do not understand. Fixed in 1.0.0: the heap flag is
passed as a node argument (`node --max-old-space-size=6144 node_modules/vite/bin/vite.js build`)
and the doc generator is a node script, so no script needs a shell variable. If you still hit
it, your `package.json` is older than the fix — pull it again. `src/tests/toolchain.test.ts`
fails the suite if such a script is ever reintroduced.

**`'&&' is not a valid statement separator` in PowerShell.** PowerShell 5.1 (the one bundled
with Windows 10/11) does not support `&&`. Either run the steps one at a time, or use
PowerShell 7+ (`pwsh`). `npm run verify` is a single npm script, so `npm run verify` works in
any shell.

**`npm ci` / `npm install` fails with `ERESOLVE`.** The canvas engine's peer range does not
include our React 18.3 pin (ADR-002), so the repo commits an `.npmrc` containing
`legacy-peer-deps=true`; a plain install then resolves. If you still see `ERESOLVE`, you are
either in a directory without that file (check `npm config get legacy-peer-deps` → `true`) or
a dev-dependency's peer major has drifted from its parent (a real example: `@eslint/js@10`
requires `eslint@10`, so it must stay on the same major as `eslint`). Match the majors rather
than reaching for `--force`, and never "fix" this by upgrading React.

**`npm run lint` complains about a React hook inside a callback.** It is usually right. The
one deliberate exception is annotated in the source with a written reason (the shortcut list in
`EditorApp.tsx`, where the rule misreads handler closures). Add an
`// eslint-disable-next-line <rule>` with why, not a blanket disable.

**Playwright tests fail with "Target page, context or browser has been closed" at random.**
Almost always a full temp filesystem, not product code: each Chromium launch writes a ~3 MB
profile. This repo keeps profiles under `./.cache/e2e-profiles` (excluded from git and from
workspace snapshots) and deletes them on close. If you see it in a container, check `df -h /tmp`
and make sure `TMPDIR` is not a small tmpfs. `npx playwright install --with-deps chromium` fixes
the other common cause (missing system libraries).

**A test waits forever for a tab that never appears.** Clicking a button that opens a tab
cannot use `Promise.all([context.waitForEvent('page'), click()])` when the extension may already
have other tabs. Use the `waitForSurface(context, /editor\.html/)` helper.

**`getByRole('button', { name: 'Templates' })` matched two elements.** Pass `exact: true`. The
suite does this everywhere now.

**A dialog's own Done button is off-screen.** `Dialog` must stay scrollable
(`max-h-[85vh] overflow-y-auto`). If you increase a dialog's content, do not remove that class —
and never fix the symptom in the test.

**`npm run check:build` fails on permissions.** That is the point: `PERMISSIONS.md` is the
contract. Either remove the permission or document it in the table (the check parses the
markdown), then rebuild.

**`npm run test:coverage` fails on thresholds.** The 80 % statements/lines floor applies to
`src/storage/`, `src/ai/` and `src/export/`. Add a test rather than lowering the number, unless
the uncovered code is genuinely untestable in jsdom (canvas rasterisation) — in which case say so
in the pull request.

**The perf numbers look worse than `docs/performance.md`.** Compare machines first: headless
Chromium on a shared 2 vCPU container is the baseline recorded there. A real regression shows up
as a *large* jump — a doubled bundle, or an editor that takes seconds to become interactive.

**End-to-end tests pass locally but fail in CI.** Make sure the CI step builds before testing
(`npm run build` → `npx playwright test`); the suite drives `dist/`, not the dev server. Also
check that both Playwright steps use the same browser install (`--with-deps chromium`).

**I need the release ZIP.** Run `npm run build`, then zip the *contents* of `dist/`:
`cd dist && zip -qr ../release/sketchpilot-1.1.0.zip .` (bash), `Compress-Archive -Path dist\*
-DestinationPath release\sketchpilot-1.1.0.zip -Force` (PowerShell), or
`tar -a -c -f release\sketchpilot-1.1.0.zip -C dist *` (cmd). `manifest.json` must be at the ZIP
root.
The version in `package.json`, `public/manifest.json` and `src/storage/schemas.ts` must agree, or
the guard fails the build — that is deliberate, so a release can never be mislabelled.
