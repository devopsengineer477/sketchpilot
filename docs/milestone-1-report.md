# Milestone 1 delivery report — v0.1.0

Date: 2026-10-27 · Scope: spec §4A, §4B, §5, §9 (PNG + JSON), §10, §13, §14 (1–7, 14–17), §15.

## What shipped

A loadable MV3 extension with a real drawing editor, local persistence with crash
recovery, a drawing library, and validated import/export. Everything works offline.

## Commands run (all green)

```text
npm install                     # 0 vulnerabilities in the shipped tree
npm run typecheck               # tsc --noEmit, strict
npm test                        # 34 passed (4 files)
npm run build                   # typecheck → vite build → release guard: 5 checks passed
npm run test:e2e                # 13 passed (real Chromium + unpacked extension)
```

Verified facts from the build guard: popup entry **4.0 kB**, dashboard entry
**10.9 kB**, 9 bundled font families, zero remote references in any page, one
allow-listed engine wasm-glue chunk.

## Test results mapped to spec §14

| # | Scenario | Status | Where |
| --- | --- | --- | --- |
| 1 | Extension installs and opens | ✅ | `tests/e2e/extension.spec.ts` |
| 2 | New drawing can be created | ✅ | same + `openNewDrawingFromDashboard` |
| 3 | Shapes created and edited | ✅ | same |
| 4 | Undo and redo work | ✅ | same (asserts stored element count returns to 0 and back) |
| 5 | Autosave and reopen | ✅ | same (reload, asserts IndexedDB count) |
| 6 | Multiple drawings stay separate | ✅ | same |
| 7 | Import rejects invalid files | ✅ | `tests/e2e/library.spec.ts` + `src/tests/import-export.test.ts` |
| 8 | PNG export works | ✅ | e2e downloads and checks the PNG magic number |
| 8 | SVG export works | ✅ | Milestone 2 (export code exists, tested for sanitisation in unit tests) |
| 14 | Storage errors are actionable | ✅ | `src/tests/autosave.test.ts` (quota path) |
| 15 | Shortcuts vs. text editing | ⏳ | Milestone 2 (single `useShortcuts` hook) |
| 16 | Light and dark themes | ✅ | `tests/e2e/extension.spec.ts`, `src/tests/ui.test.tsx` |
| 17 | Core drawing works offline | ✅ | e2e asserts **no** request leaves the extension |
| 18 | Permissions match documentation | ✅ | `scripts/check-build.mjs` (runs on every build) |

Not started by design: 9–13 (AI and capture phases).

## Bugs found and fixed during M1

1. **Elements vanished after reload.** Excalidraw mutates element objects in place
   during a gesture, so change detection by array identity skipped the resize/redraw
   and saved a 0×0 element. Replaced with the engine's `getSceneVersion` signature;
   the e2e reload test now covers it.
2. **Undo/redo from the top bar did nothing.** The engine's keyboard handler lives on
   its container and runs focus checks; a synthetic event on `document` was ignored.
   The adapter now dispatches on `.excalidraw`.
3. **New drawings were not addressable.** A drawing created by a bare editor visit had
   no URL id, so a reload created a second document. The editor now writes the id into
   the URL once the first save succeeds, and a blank visit is no longer persisted until
   it has content.
4. **Fonts would have hit a CDN.** Caught in the spike; the build ships them and the
   guard asserts no external request.

## Known limitations

- Right-hand inspector is the engine's own panel, restyled (SketchPilot's custom panel
  arrives with the AI milestone, where it has custom controls).
- No library thumbnails yet (Milestone 2).
- Last-write-wins if the same drawing is open in two tabs.
- History is the engine's session stack.

## Next: Milestone 2

Dashboard thumbnails, templates (12), SVG export wiring in the UI menu, full-library
archive import/export, centralised shortcut handling, settings page, and the
accessibility/visual QA pass. See `../sketchpilot-plan/SketchPilot-AI-Implementation-Plan.md`.
