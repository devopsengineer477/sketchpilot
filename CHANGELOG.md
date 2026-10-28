# Changelog

All notable changes to SketchPilot AI. Versions follow semantic versioning; every release is
an installable, loadable extension (no partial builds).

## 1.3.1 — resizing a symbol keeps its shape

**Fixed**
- **Resizing an inserted element destroyed it.** Dragging a corner handle flattened the database
  cylinder into a bar, straightened the user's shoulders and the cloud's bumps. Cause: every
  polyline was created with the engine's default `width`/`height` of **0**, even though its points
  spanned dozens of units. Drawing looked fine, but the engine resizes a line by scaling its points
  against that box — with a zero-height box the vertical scale collapsed and every arc became a
  straight line. Polylines now carry their real bounding box, so a resize scales the shape
  proportionally.
- The same defect also distorted the multi-stroke symbols on any resize: `firewall`, `queue`,
  `web-server`, `worker`, `client-desktop` and `broker` all had zero-sized lines.
- Regression coverage: a unit test asserts every polyline's `width`/`height` matches the extent of
  its points, and a new end-to-end test *13* drags a real resize handle and checks that all parts
  of the symbol grow by the same factor (and that the cylinder's body keeps a non-zero height).

**Unchanged** — no visual change at insert time, no schema change, no new dependency in the
package (the resize test uses `pngjs`, a dev-only dependency, to locate the canvas-painted handle).

## 1.3.0 — drag elements onto the canvas

**Added**
- **Drag-to-place.** Pick a symbol up in the Elements panel and drop it exactly where you want it.
  While a symbol is in flight a translucent ghost follows the pointer and the canvas is outlined as
  the drop target; releasing outside the canvas inserts nothing.
- The press is only a drag after a few pixels of travel, so a shaky click still behaves as a click
  (and inserts at the canvas centre, as before). <kbd>Esc</kbd> cancels a drag in progress.
- Dropping centres the symbol on the pointer in **scene** coordinates, so it lands where it looks
  even when the canvas is zoomed or scrolled.
- Implemented with pointer events bound only while a press is in flight — no HTML5 drag-and-drop —
  so it cannot interfere with the engine's own dragging or its file-drop handling.

**Unchanged** — click-to-insert, keyboard operation, the storage schema, permissions and the
monochrome look. Drag adds no dependency and no network access.

## 1.2.0 — standard diagram elements

**Added**
- **Elements panel** — a library of 16 standard system-diagram symbols on the left of the canvas:
  User, Client, Mobile, Web server, Worker, Database, Cache, Object storage, Queue, Message broker,
  Load balancer, API gateway, Cloud, CDN / Edge, Firewall and External API. Searchable by what
  people actually type (`db`, `sql`, `postgres`, `kafka`, `s3`, `waf`…), grouped by role
  (People · Compute · Data · Network).
- Every symbol is inserted as **native, editable engine elements**: rectangles, ellipses,
  polylines and a text label sharing one group id. That means one click gives you a real database
  cylinder you can recolour, resize, retype or ungroup — not an image, not a locked template, not
  a third-party plugin. It saves, exports and re-opens through the code paths that already existed,
  so storage needed no schema change.
- Symbols are **monochrome**: no fills, ink strokes that follow the theme (dark ink on light, light
  ink on dark), so a diagram reads cleanly and prints.
- Panel is **closed by default** (the canvas is the product) and opens from the *Elements* button in
  the top bar or **Shift + P**; the choice is remembered. It is fully keyboard operable: opening
  focuses the search box, Tab reaches the cards, arrows walk them, Enter inserts, Escape closes.
- Clicking a symbol inserts it in the middle of the *canvas* (not the window, so panels cannot hide
  it), selects it, and hands keyboard focus to the canvas so Delete, arrow-nudging and dragging work
  immediately.

**Fixed**
- Polylines were inserted with their first point off the origin, so a symbol's line parts (the
  user's shoulders, the client's stand, the database body) slid out of position the moment the
  group was dragged. Recipes are now normalised to the engine's convention (`points[0] === [0,0]`,
  offset folded into the element's `x`/`y`).
- `Worker` read as a donut and `Cloud` had no base line; both were redrawn. `Message broker` now
  carries two opposing arrows so it cannot be confused with `External API`.

**Unchanged** — no new dependency, no network request, no new file type, no third-party name: the
shapes are numbers in `src/editor/palette/catalog.ts`. Storage schema, export formats and
permissions are untouched.

## 1.1.2 — a warning-free console

**Fixed**
- Exporting a PNG (and generating a library thumbnail) passed a `quality` value alongside
  `mimeType: "image/png"`. PNG is lossless, so the canvas engine ignored it and logged
  `"quality" will be ignored for "image/png" mimeType` in the extension's own console — visible
  to anyone with DevTools open, and easy to mistake for a defect in a store review. The option is
  no longer sent for any lossless format.
- `src/export/quality.ts` now holds the single rule: a `quality` value is only attached for lossy
  mime types (`jpeg`, `webp`, `avif`). SketchPilot only exports PNG and SVG today, so nothing is
  attached anywhere — but if a lossy format is ever offered, it cannot reintroduce the warning.
- New unit tests (`src/tests/export-quality.test.ts`, 4 cases) pin the rule, and
  `src/tests/export-render.test.ts` now asserts `quality` is **absent** from the export call
  rather than present.
- New end-to-end test (`extension.spec.ts` → *8d*): exports a real PNG while capturing every
  console message and page error, waits for the throttled thumbnail render, and fails if anything
  logs "will be ignored".

**Fixed (package size)**
- `dist/excalidraw-assets/locales/` is gone. That folder was a copy of the engine package's 55
  locale files (1.7 MB) — and nothing ever fetched it: the engine imports its locale JSON
  statically, so Rollup already emits one lazy chunk per language in `assets/`, which is what the
  editor actually loads. The ZIP dropped from **2.7 MB / 190 files to 2.2 MB / 134 files**
  (unzipped: 7.1 MB → 5.1 MB) with no behavioural change.
- `dist/excalidraw-assets/fonts/` **stays** — that one is genuinely read at runtime. The editor
  resolves every text-family URL through `window.EXCALIDRAW_ASSET_PATH`; without the local fonts
  the engine falls back to a CDN (a CSP violation and a privacy leak) and drawings would render in
  the wrong typeface.
- `scripts/check-build.mjs` now fails the build if `excalidraw-assets/locales` reappears, so the
  dead weight cannot creep back in.

**Fixed (exported files)**
- **Every exported SVG began with `<!-- svg-source:excalidraw -->`.** The engine stamps that
  provenance comment into the file, and an export is a *user-facing artefact* — it travels into
  documents, slide decks, issue trackers and other tools, so it was the one place another
  product's name still appeared. `sanitizeSvg` now strips all XML comments (they carry no
  rendering information), and the end-to-end SVG export test asserts the file contains neither
  the name nor a comment. JSON (our own envelope: `"type": "sketchpilot"`) and PNG (no embedded
  scene metadata) were already clean — verified by inspecting the real downloads.

**Changed (package layout)**
- One asset folder instead of two. The engine fonts moved from `dist/excalidraw-assets/fonts/` to
  `dist/assets/fonts/`, so `dist/` now holds a single asset root (`assets/` = hashed chunks +
  fonts, plus `icons/`, the four HTML entry points and the licence files).
  `window.EXCALIDRAW_ASSET_PATH` points at `assets/`; `src/editor/engine/assets.ts` is the only
  place that knows the path. Verified in the packaged extension: the asset base resolves to
  `/assets/`, both a Cascadia and an Excalifont `.woff2` return `200`, and drawn text renders in
  the handwritten face (i.e. no CDN fallback, no silently-substituted system font).
- `scripts/check-build.mjs` now fails the build if a `dist/excalidraw-assets` folder reappears, so
  the layout cannot drift back.

**Fixed (build, Windows)**
- `npm run build` could stop with `Error: spawnSync npm ENOENT` while generating
  `THIRD-PARTY-NOTICES.txt`: `scripts/build-notices.mjs` called `execFileSync('npm', …)`, and on
  Windows `npm` is an `npm.cmd` shim that Node will not spawn from a bare name (it does not apply
  `PATHEXT`, and refuses `.cmd` without a shell). The script now runs npm's own JS entry point with
  the running Node binary via `process.env.npm_execpath`, falls back to `npm.cmd`, and as a final
  fallback derives the production tree from `package-lock.json` (a resolver that follows
  dependencies, optional dependencies and installed peer dependencies, so it reaches the same
  packages as `npm ls --omit=dev`). All three routes were verified to produce **byte-identical**
  output (252 packages) — no `shell: true`, no cmd.exe quoting, nothing to break on either OS.
- `npm run notices:lockfile` exercises the lockfile route deliberately, so the fallback is
  testable on any platform.

**Unchanged** — the exported PNG bytes and library thumbnails are identical: the value was
discarded by the engine before this release too. No manifest, permission or CSP change.

## 1.1.1 — the Mermaid importer is removed at the source

**Fixed**
- The engine's **"Mermaid to …"** entry was hidden with CSS only; it is now switched off at the
  source with `aiEnabled={false}` on the canvas, which also removes its **"Text to diagram"** tab
  beside it, the matching command-palette commands and the magic-frame "convert to code" action.
  The entry carries a shared `data-testid` with **Web Embed**, so hiding it by CSS was one DOM
  change away from also hiding (or re-exposing) the wrong item.
- The "Generate" heading that the engine renders above those entries is gone too, so the *More
  tools* menu now reads exactly: **Frame tool · Laser pointer**.
- A defensive guard in the editor closes that dialog and explains it if a future engine version
  ever re-exposes it by another route (palette, shortcut, restored state). The converter is not
  bundled, so it could never have produced a diagram.
- `src/stubs/mermaid-to-excalidraw.ts` now documents the feature as *removed*, not dormant.
- New end-to-end test: the menu contains no Mermaid or "text to diagram" text, its two remaining
  items are the only visible ones, tabbing through it can never reach a removed entry, and no
  visible control anywhere in the editor offers the importer.

**Unchanged** — no behavioural change to drawing, captures, AI or storage. The AI panel's
*Convert to Mermaid* (producing plain Mermaid **text** from a drawing, the opposite direction,
with no renderer) is SketchPilot's own feature and stays.

## 1.1.0 — an independent product, end to end

SketchPilot AI is now presented as a product of its own from the toolbar to the shipped
licences: no other project's name, links, offers or embedded content anywhere in the
extension, and every licence obligation explicitly met.

**Removed (branding)**
- The engine's **"Excalidraw links"** menu group is gone; the canvas menu is SketchPilot's own
  (canvas background, clear canvas, **Keyboard shortcuts** → our `?` sheet).
- The engine's **Help** dialog — four external links (docs, blog, issue tracker, YouTube) and
  nothing else — is gone, along with its button.
- The library panel's **"Browse libraries"** button is gone: it opened a third-party site with a
  referrer token containing the extension ID.
- The **"Mermaid to …"** entry is gone (it pointed at another product's converter and was inert
  here, since the converter is not bundled).

**Removed (privacy)**
- **Web Embed** is gone from *More tools*, and the manifest CSP is tightened to
  `script-src 'self'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'self';
  base-uri 'self'`. A canvas object can no longer pull a live remote page into an offline,
  permission-minimal extension — and if some future UI tried, the policy refuses it.
- Frame tool and Laser pointer stay: both are local and offline.

**Added (attribution, done properly)**
- `THIRD-PARTY-NOTICES.txt` is generated from the production dependency tree (252 packages) by
  `npm run notices`, regenerated on every build, shipped at the package root, and verified from
  the installed extension by an end-to-end test (MIT text, Apache text, bundled components).
- SketchPilot's own code is MIT licensed (`LICENSE`); `package.json` gains `license`, `author`,
  `description` and `homepage`.
- Settings → About states the non-affiliation and points at the notices file.
- README gains *Independence, branding and licences*; PRIVACY, the store listing and the security
  review gained the matching statements.

**Guards**
- New `tests/e2e/brand.spec.ts`: walks every surface, toolbar tooltip, panel and dialog and fails
  if another product's name becomes visible; checks the notices ship and contain the required
  texts; checks the manifest names only this product; and checks the removals stayed surgical
  (Frame tool and Laser pointer are still offered, Web Embed is not).
- `scripts/check-build.mjs` now fails the build for: a missing/incomplete notices file, a CSP
  that is not closed (no `frame-src 'none'`, or any `unsafe-*`/`https:` source), or any shipped
  HTML/manifest that names another product.

## 1.0.1 — no links to somebody else's product

**Fixed**
- **The canvas menu is SketchPilot's own.** The engine's default menu ended with a group
  titled *"Excalidraw links"* (GitHub, X, Discord and a link back to excalidraw.com). It is
  replaced by a menu built from the engine's own primitives containing only what does
  something here: canvas background, clear canvas, and **Keyboard shortcuts**, which opens
  SketchPilot's `?` sheet.
- **The engine's Help dialog is gone.** Every link in it pointed at excalidraw.com (docs,
  blog, GitHub issues, YouTube). The button is hidden and the information moved to our own
  sheet; the `?` shortcut was already ours.
- **The library panel's "Browse libraries" button is gone.** It opened
  libraries.excalidraw.com *with a referrer token containing the extension ID*. SketchPilot's
  library is the dashboard; importing from a `.excalidrawlib` file still works.
- **Documentation screenshots are now generated, not hand-taken.** `tests/e2e/shots.spec.ts`
  gained a *core surface* pass covering the empty and populated library, the editor in light
  and dark, a template, the shortcut sheet and both settings themes. This caught a stale
  hand-captured `editor-light.png` that still showed the removed help button, and a library
  screenshot showing the "PREVIEW PENDING" placeholder instead of a real thumbnail.
- New end-to-end test (`milestone5.spec.ts` → *no surface hands the user off to a
  third-party site*) asserts zero visible off-extension anchors on popup, dashboard, settings
  and the editor, including with the menu, shortcut sheet and library panel open, and that
  the engine's help dialog cannot be reached. A dependency bump that reintroduces any of them
  fails CI.

**Unchanged** — no functional, storage or permission change; drawings keep their format.

## 1.0.0 — production readiness

Release that turns the 0.4 feature set into a store-ready product. No new user-facing
features were added in this version; the work was correctness, accessibility, performance and
documentation.

**Accessibility**
- Accessibility palette fix: the muted text colour (`ink-500`) was 4.41:1 on the light
  panel background, just under WCAG AA. Darkened to 4.81:1. Every other pair was already
  compliant — now asserted numerically for both themes by `src/tests/a11y-contrast.test.ts`
  (19 real UI combinations).
- Dialogs are now real modal dialogs: Tab and Shift+Tab cycle inside the panel, focus is
  moved in when it opens and returned to the control that opened it, Escape closes.
  Previously Tab could walk into the canvas behind the dialog.
- The save-status badge and the AI panel now announce state changes through polite live
  regions (`Saving…`, `Saved`, `Unsaved changes`, `Generation failed`).
- Reduced-motion preference is honoured on every surface and covered by an end-to-end test.
- `contenteditable` regions are recognised as text entry even where `isContentEditable` is
  unavailable, so shortcuts can never eat a keystroke from the engine's in-canvas editor.

**Fixed**
- **Windows: `npm run build` failed with `'NODE_OPTIONS' is not recognized…`.** The scripts used
  the POSIX `VAR=value command` prefix, which `cmd.exe`/PowerShell reject. The heap flag is now
  passed as a node argument and `npm run docs:matrix` is a node script, so every script runs
  unchanged in PowerShell, cmd, bash and zsh. `src/tests/toolchain.test.ts` now fails the suite
  if a POSIX-only script is reintroduced, and the README gives release-ZIP commands for all
  three shells.
- `npm install` failed with `ERESOLVE` on a fresh clone: the new lint toolchain pinned
  `@eslint/js@10` (whose peer is `eslint@10`) next to `eslint@9`. Both are now on 9.x, and the
  repo ships an `.npmrc` with `legacy-peer-deps=true` so plain `npm install` and `npm ci` work
  without a flag anywhere (CI and the docs no longer pass one).
- PNG export could exceed the documented 40-megapixel budget on very large scenes: the scale
  floor clamped the safety factor back up to 1×, so a 20 000 px-wide scene would have exported
  at 400 MP. The budget now always wins (`src/export/render.ts`), and the dimensions are
  floored rather than rounded so the result can never land just over the limit.
- The AI "Replace canvas" confirmation read scene elements during render (a React
  anti-pattern flagged by the lint pass); it now captures the count when the dialog opens.
- Lint pass over the whole source tree (new ESLint 9 flat config) fixed a mis-named
  `useTemplate` non-hook, two dead assignments in the capture path, and an unused fixture.

**Packaging**
- The package dropped from 20 MB to 6.6 MB unzipped (15.5 MB → 2.6 MB zipped). Excalidraw
  ships a CJK handwriting face (`Xiaolai`) as ~200 unicode-range subset files that made up
  13 MB of the extension; it is excluded for this English-only release, so CJK text falls back
  to the system font. Re-enable it by deleting one entry in `SKIPPED_FONT_FAMILIES`
  (`vite.config.ts`).

**Testing**
- The specification's §14 matrix is now data: `src/tests/scenario-map.ts` names the exact
  test for each of the 18 scenarios, `npm run docs:matrix` generates `docs/test-matrix.md`,
  and a test fails if any referenced test is renamed or deleted.
- New reliability suite: 10-cycle autosave soak, `maxWait` burst, slow-write overlap,
  undo/redo fuzz over the save path, failed-save recovery, 200-element round-trip and a
  60 000-element file that must be rejected rather than truncated.
- New end-to-end spec for production readiness: zero external requests on every surface,
  focus trap on a button-opened dialog (with focus restoration), the shortcut sheet trapping
  Tab away from the canvas, reduced motion, and an accessible-name sweep of every control on
  every surface.
- New performance spec (`npm run perf`) measures popup start-up, dashboard render, opening a
  200-element scene, frame pacing while panning it, and the shipped bundle sizes; it fails the
  build if a budget regresses. Numbers are recorded in `docs/performance.md`.
- Toolchain guard tests: eslint/`@eslint/js` majors, coverage-provider/vitest majors, the
  committed `.npmrc`, and the React 18 pin are asserted so a dependency edit cannot break a
  fresh install silently.
- Coverage thresholds enforced on `storage/`, `ai/` and `export/` (80 % statements/lines);
  current: 84.8 %, 90.0 %, 81.2 %.
- CI workflow: install → lint → typecheck → unit + coverage → matrix sync → build →
  Playwright against the packaged `dist/` → artefact upload.

**Docs**
- `PRIVACY.md`, `docs/security-review.md` (checklist, three-position threat model,
  store-facing permission justifications, known limitations), `docs/performance.md`,
  `docs/test-matrix.md`, `docs/definition-of-done.md`, this changelog, and a store submission
  package in `docs/store-listing.md` + `store/`.
- README and `TROUBLESHOOTING.md` checked line-by-line against the shipped build.

## 0.4.0 — browser capture

- Capture the visible tab into a drawing, with a review step (insert as image / discard).
- Turn the current selection into a sticky note or a mind-map prompt, keeping a source
  reference on the note.
- Right-click menu entries and two new keyboard commands.
- Pending captures live in `chrome.storage.session` and are deleted on read.
- Fixed: a fifth suggested shortcut caused Chrome to refuse to load the extension; the
  shortcut sheet's own Done button could land off-screen on short viewports; a blank drawing
  was persisted on every editor open.

## 0.3.0 — AI

- Optional AI assistance with a user-supplied key: describe-to-diagram, refine, explain,
  document, Mermaid conversion.
- Strict versioned JSON schema, validation, repair and local layout; a failed generation
  leaves the drawing byte-identical.
- AI settings page with masked key, test connection, usage log and one-click removal.
- AI is off unless configured, and page text needs explicit confirmation before it is sent.

## 0.2.0 — library, templates, exports

- Dashboard library with thumbnails, search, sort, favourites and templates.
- Twelve templates, save-your-own templates, full library export/import.
- PNG, SVG and JSON export; JSON import with validation; settings page; dark theme.

## 0.1.0 — the editor

- MV3 extension with popup, editor tab, dashboard and settings surfaces.
- Excalidraw-based canvas, local storage in IndexedDB, autosave with recovery drafts.
