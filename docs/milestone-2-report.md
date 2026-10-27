# Milestone 2 delivery report — v0.2.0

Date: 2026-10-27 · Scope: spec §4C, §8, §9 (full), §10 (schema v2), §12, §14 (8, 15, 16), §15.

## What shipped

The library became a library: previews, templates, whole-library backup, a settings page
and one shortcut system.

| Area | Result |
| --- | --- |
| Dashboard | Recent / All / Favourites / Templates tabs, search, three sort orders |
| Thumbnails | Generated on idle from the saved document, stored separately, placeholder fallback |
| Templates | 12 built-ins authored as data + user-saved templates, previewed from their own elements |
| Backup | Whole-library export/import in one file, additive only (never overwrites) |
| Settings | Appearance, storage usage, full shortcut reference, version/schema |
| Shortcuts | One capture-phase system, `?` sheet, text-entry guard, `Ctrl/⌘+S`, `Ctrl/⌘+Shift+E` |

## Commands run (all green)

```text
npm run typecheck   → clean (strict)
npm test            → 54 passed (6 files)
npm run build       → typecheck → vite build → release guard: 6 checks passed
npm run test:e2e    → 21 passed (real Chromium + unpacked extension)
```

Release-guard facts: popup **4.1 kB**, dashboard **23.4 kB**, settings **6.9 kB**,
9 bundled font families, zero remote references, one allow-listed engine chunk,
manifest version locked to package version.

## Test coverage added this milestone

- **§14 test 8 (SVG export)** — wired into the UI menu, e2e asserts a downloaded `.svg`
  with no `<script>` or `javascript:`.
- **§14 test 15 (shortcuts vs. text editing)** — the shortcut sheet stays shut while
  typing `why?` into the title field, then opens on `?` from the canvas; also asserts the
  engine's own help dialog does not open alongside ours.
- **§14 test 16 (themes)** — dashboard → settings → Dark → reload persists → Light, and
  the editor honours the same stored preference.
- Template integrity (unit): 12 templates, unique ids, no dangling edges, bounded
  geometry, arrow clipping to node edges, preview escaping, corrupt-edge rejection.
- Archive integrity (unit): round-trip, double-import creates copies, invalid/corrupt/
  newer-schema archives rejected with nothing written.
- Template gallery and user-template creation (e2e), thumbnail persistence (e2e).

## Bugs found and fixed during M2

1. **The library loaded the canvas engine.** Instantiation lived in the dashboard, which
   dragged Excalidraw (and ~4 MB of Mermaid/Cytoscape/KaTeX) into the page and made the
   build exceed this machine's memory. Fixed twice over: templates are now instantiated
   inside the editor, and the unused Mermaid converter is stubbed out. Build time fell
   from ~110 s to ~9 s and `dist/` dropped by ~4 MB.
2. **Template arrows ran through their own labels.** The engine was anchoring arrows at
   node centres; they now start and end on the shape edges (unit-tested, including
   vertical and diagonal cases) while staying bound to their nodes.
3. **Shortcut keys collided with the engine's help dialog.** A plain `?` was claimed by
   Excalidraw. SketchPilot's bindings now run in the capture phase and stop the event
   when they match, without touching keys the app does not bind.
4. **No migration was exercised.** The database moved to v2 (thumbnails + templates) with
   an additive upgrade, and the schema-version drift surfaced a stale assertion in the
   Milestone 1 suite that is now version-agnostic.

## Known limitations

- Thumbnails regenerate at most every 8 s and on idle, so a card can lag one save.
- Template previews are a simplified SVG rendering (geometry and labels, not the hand-
  drawn texture) — deliberate, so the library stays engine-free.
- Deleting a user template does not affect drawings already created from it.

## Next: Milestone 3 (AI)

Schema-validated text-to-diagram with a preview/approval gate, provider adapters
(OpenAI-compatible + OpenRouter), refine-existing-drawing, credential handling with an
honest disclosure, and an adversarial test corpus. See
`../sketchpilot-plan/SketchPilot-AI-Implementation-Plan.md`.
