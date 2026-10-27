# Changelog

All notable changes to SketchPilot AI. Versions follow semantic versioning; every release is
an installable, loadable extension (no partial builds).

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
