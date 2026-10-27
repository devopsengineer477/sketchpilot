# ADR-001 — Use `@excalidraw/excalidraw` as the drawing engine, behind an adapter

**Status:** Accepted (Milestone 1) · **Date:** 2026-10-27

## Context

The product needs a real, fast freehand/canvas editor (shapes, arrows, text,
freedraw, selection handles, snapping, zoom). Writing that from scratch is a
multi-month project on its own and is not where this product's value sits.

The spec asks us to evaluate the official `@excalidraw/excalidraw` package and, if
it is incompatible with a requirement, to document why and propose an alternative
before replacing it.

## Decision

Embed `@excalidraw/excalidraw@0.18.1` and put every call behind
`src/editor/engine/*` (`CanvasAdapter`). No other module imports engine internals.
All engine interaction goes through four functions and one component:
`toEngineElements`, `snapshotDocument`, `applyZoom`/`requestHistoryStep`/`setEngineTheme`,
and `<Excalidraw>` mounted once in `EditorApp`.

## Evidence from the spike (Phase 0)

| Risk | Result |
| --- | --- |
| Fonts fetched from a CDN at runtime | **Real.** The engine resolves fonts from `window.EXCALIDRAW_ASSET_PATH` and falls back to `esm.sh` when unset — a CSP violation in MV3 and an offline failure. Mitigated: the build copies `dist/prod/fonts` into `dist/excalidraw-assets/` and `src/editor/bootstrap.ts` points the global there before anything renders. Verified: an end-to-end test asserts **zero** non-extension requests. |
| Vite `process.env` shims | Needed (`IS_PREACT`, `NODE_ENV`) and added to `vite.config.ts`. |
| React 19 peer conflicts | Excalidraw 0.18 pins an older Radix Tabs. Chosen: React 18.3.1 (see ADR-002). |
| `eval` / `new Function` in the bundle | One Emscripten "wasm glue" chunk from the engine's Mermaid path. Allow-listed with a written justification in `scripts/check-build.mjs`; everything else is asserted clean. |
| Bundle size | The editor entry is large (~1.1 MB raw). Popup and dashboard are separate entries and stay ~4 kB / ~11 kB, enforced by build budgets. |
| MV3 CSP | Loads and runs with the default MV3 CSP. No `unsafe-eval` needed at runtime. |

## Consequences

- We inherit a mature editor: undo/redo, snapping, binding, zoom, image support.
- We inherit its schema. Persistence validates the invariants we care about
  (identity, type, finite geometry) and preserves unknown fields, so a future
  engine version does not silently degrade saved drawings.
- Two engine-specific quirks are contained in the adapter and documented in code:
  elements are **mutated in place** during a gesture (so change detection uses
  `getSceneVersion`, not array identity), and undo/redo is only reachable by
  replaying the engine's keyboard binding on its container element.

## Alternative considered

Konva/Fabric + a custom element model, or tldraw. Rejected for now: months of work
to reach parity on the interactions users actually judge the product by. The
adapter seam keeps this option open — swapping engines is a rewrite of
`src/editor/engine/` plus `EditorApp`, not of the app.
