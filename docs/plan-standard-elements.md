# Plan — Standard diagram elements palette (left panel)

**Status:** ✅ **implemented in 1.2.0.** Decisions taken: **16 symbols**, **monochrome**, **click to
insert** (no drag-to-place), panel **closed by default** (TopBar button + `Shift + P`). The shipped
behaviour is documented in [`feature-standard-elements.md`](feature-standard-elements.md); this file
is kept as the record of what was planned and why.
**Version:** 1.2.0 (new feature, minor bump; no schema change, no new dependency).

---

## 1. Problem

When someone explains a system while drawing — "the user hits the web server, that writes to the
database" — they redraw the same four or five symbols over and over: a **user**, a **client**, a
**web server**, a **database**. Today SketchPilot gives them the engine's generic primitives
(rectangle, ellipse, diamond, arrow, text) and a blank canvas, so every DB cylinder is rebuilt by
hand, and never quite the same twice.

**Goal:** a dedicated section in the editor's left panel where the 6–16 most-used system-diagram
symbols are one click away, inserted as *ordinary editable elements*.

**Non-goals:** icons/illustrations, cloud-provider logos (AWS/Azure/GCP stencil sets — brand and
licence minefield), a full stencil library, sticky-note or template replacement.

## 2. The one architectural decision that matters

**Every symbol is built from native engine primitives, grouped — never an image, never an SVG
asset, never an embed.**

| Approach | Verdict |
| --- | --- |
| Native primitives, grouped (`convertToExcalidrawElements`) | ✅ **Chosen.** Editable after insertion (recolour, resize, relabel, ungroup), themable, exports to PNG/SVG/JSON like anything else, saved by the existing autosave, zero new files, zero new dependencies, zero network. |
| Bundled SVG/PNG images as `image` elements | ❌ Not editable, blurry on scale-up, adds package weight, needs `files` handling for export, and dark mode cannot restyle them. |
| Engine plugin / custom shape registry | ❌ Excalidraw 0.18 has no public custom-shape API; anything else means patching the engine, which breaks the single-upgrade-path rule (ADR-001). |

A "database" is therefore a small **recipe**: top ellipse + body rectangle + bottom arc (a polyline
of ~16 points) + two side lines, sharing group ids, with a text label. It looks like a cylinder,
behaves like six normal elements, and can be taken apart.

This is the same mechanism `src/templates/instantiate.ts` already uses for templates, so the code
path is proven rather than new.

## 3. Where it lives in the UI

```
┌───────────────────────────────────────────────────────────────┐
│ TopBar: title · save state · undo/redo · zoom · Export · AI …  │
├──────────────┬────────────────────────────────────────────────┤
│ Elements     │                                                │
│ ┌──────────┐ │            canvas (engine)                     │
│ │ ▢ user   │ │                                                │
│ │ ▭ client │ │                                                │
│ │ ▤ server │ │                                                │
│ │ ⬭ db     │ │                                                │
│ └──────────┘ │                                                │
├──────────────┴────────────────────────────────────────────────┤
```

- A new `<aside>` on the left of the canvas, **ours** (`src/editor/palette/`), not the engine's
  floating toolbar, which stays where it is (top-centre). No engine CSS is touched.
- Header "Elements" + a search input (filters by name and aliases: `db`, `postgres`, `sql`).
- Grouped when the extended set is chosen: **People · Compute · Data · Network**.
- Width ~200 px, collapsible to a 40 px icon rail; the choice is remembered.
- Toggle: a button in the TopBar (`Elements`) with a shortcut (`Shift+E`, checked against the
  existing bindings — `Ctrl+S`, `Ctrl+Shift+E`, `?`, engine keys). Esc closes it when it has focus.
- The AI panel on the right is unaffected; both can be open (canvas keeps a usable width down to
  ~900 px, below that the palette auto-collapses).

## 4. Insertion behaviour

1. **Click** a symbol → inserted centred in the current viewport, all parts grouped, the new group
   selected, and one undo step (`CaptureUpdateAction.IMMEDIATELY`).
2. **Drag** (if chosen, §9) → a ghost follows the pointer, drop places it exactly there. Implemented
   with pointer events on our own layer, *not* HTML5 drag-and-drop, so it cannot collide with the
   engine's file-drop handler.
3. Position maths reuses what `insertStickyNote` already does
   (`appState.scrollX/scrollY/zoom` → scene coordinates), extracted into a shared helper.
4. Toast: "Database added — drag to move, double-click to rename." (Our toast system already
   exists.)
5. Default size ~120×120 (server/client ~120×90), label included; the user resizes the group as
   usual.
6. Inserting the same symbol twice never collides: ids are regenerated per insertion.

## 5. Catalogue (v1 content)

Each entry: `id`, `label`, `aliases[]`, `category`, `defaultSize`, `build(ctx) => skeleton[]`,
and a hand-written **preview** (inline SVG React component, same recipe, no icon files).

| # | Symbol | Built from | Notes |
| --- | --- | --- | --- |
| 1 | **User** | head ellipse + shoulders polyline | label under the figure |
| 2 | **Client (desktop)** | screen rect + stand lines | label inside |
| 3 | **Web server** | 3 stacked rounded rects + 2 dot ellipses | reads as a rack |
| 4 | **Database** | top ellipse + body rect + bottom arc polyline + 2 side lines | the classic cylinder |
| 5 | **Cache** | rounded rect, dashed stroke + label | dashed = ephemeral |
| 6 | **Queue** | rect + 3 vertical divider lines | label above |
| 7 | **Load balancer** | hexagon polyline + label | distinct silhouette |
| 8 | **Cloud** | 3 overlapping ellipses, same fill, no strokes between | silhouette trick |
| 9 | **Mobile client** | rounded rect + home bar + notch line | |
| 10 | **API gateway** | double-bordered rounded rect | |
| 11 | **Object storage** | 2 stacked parallelogram/trapezoid polylines | bucket |
| 12 | **Message broker** | rect + arrow polyline through it | |

Colour by role (see §9 for the alternative): compute = blue, data = violet, people = green,
queue/network = amber, neutral = grey — reusing `PALETTE` from `src/templates/types.ts` so the
palette and templates look like one product. Each role gets a **dark-mode pair** (deeper fills,
lighter strokes) because inserted elements carry explicit colours.

## 6. Files

**New**
```
src/editor/palette/catalog.ts        the 12 recipes + metadata (no React)
src/editor/palette/build.ts          recipe → ExcalidrawElementSkeleton[] (+ grouping, label)
src/editor/palette/previews.tsx      inline-SVG thumbnails
src/editor/palette/PalettePanel.tsx  the aside: search, groups, buttons, keyboard, a11y
src/tests/palette-catalog.test.ts    catalogue + geometry unit tests
docs/feature-standard-elements.md    user/reviewer-facing description
```

**Changed**
```
src/editor/EditorApp.tsx             panel state, insert-at-viewport-centre, toggle wiring
src/editor/TopBar.tsx                "Elements" toggle button
src/hooks/useShortcuts.ts            Shift+E binding (guarded like the others)
src/styles/index.css                 palette styles (dark mode via existing tokens)
tests/e2e/palette.spec.ts            new spec (§7)
tests/e2e/shots.spec.ts              + docs/screenshots/editor-palette.png
CHANGELOG.md, README.md, docs/definition-of-done.md, docs/test-matrix.md (regenerated)
package.json / manifest / schemas    version → 1.2.0
```

No change to `src/storage/schemas.ts` beyond the version string: inserted elements are ordinary
elements, so storage, export, thumbnails and import are untouched.

## 7. Test plan

**Unit (`palette-catalog.test.ts`)**
- every catalogue entry builds ≥ 1 element, all with unique ids, positive width/height, no `null`
  coordinates, no external URLs, no `image` type;
- all parts of one symbol share one group id, and groups differ between symbols;
- every entry has a label, aliases and a preview;
- dark and light builds differ only in colour fields;
- search/filter matches a DB by `db`, `database`, `postgres`, `sql`.

**End-to-end (`palette.spec.ts`)**
- toggle opens/closes the panel; state survives reload;
- click each of the 12 → canvas element count grows by the expected amount, all parts selected;
- one undo removes the whole symbol (not one part);
- drag-and-drop places it near the drop point (if chosen);
- keyboard-only: Tab to the panel, arrow through items, Enter inserts;
- insert → autosave → reload → symbol still there and still grouped;
- dark mode insertion uses the dark fills;
- no network request leaves the extension while inserting (extends existing test 17);
- brand test still finds no third-party name (the panel adds ~13 strings).

**Budgets:** editor chunk +≤ 25 kB (previews are inline SVG, catalogue is data); no new fonts,
no new files in `dist`, package size unchanged.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Cylinder/cloud look "off" in the engine's hand-drawn style | Recipe is validated visually: I'll insert all 12 into a scratch scene, export a PNG and inspect it *before* wiring the UI, and tune point counts/strokes then. |
| Arc approximations are heavy (many points) | Polylines are ≤ 20 points; measured against the existing 200-element perf budget (p95 frame interval still < 50 ms). |
| Left panel squeezes the canvas on small windows | Auto-collapse below 900 px; panel width capped at 200 px. |
| Users expect AWS/Azure icons | Explicitly out of scope: those are trademarks with licence terms. Documented in the feature doc. |
| Colour pastels look wrong in dark mode | Separate dark palette + e2e assertion. |

## 9. Decisions (answered)

| Question | Answer |
| --- | --- |
| How many symbols | **16** — the full set (People 3 · Compute 2 · Data 5 · Network 6) |
| Look | **Monochrome** — ink strokes, no fills, theme-aware, print-friendly |
| Interaction | **Click to insert**, then (1.3.0) **drag-to-place** as a follow-up |
| Panel visibility | **Closed by default** — TopBar *Elements* button and `Shift + P`; choice remembered |

## 10. Acceptance criteria

1. A left panel titled **Elements** exists in the editor, opens/closes, and remembers its state.
2. Each requested symbol (database, web server, client, user + the rest of the chosen set) inserts in
   one click as a **grouped, editable** set of native elements with a label.
3. Insert is one undo step; it is saved by the existing autosave and survives reload.
4. Keyboard operable, screen-reader labelled, visible focus, works in light and dark.
5. No new dependency, no network request, no third-party brand, no schema change.
6. All gates green and actually run: lint, `tsc`, unit, e2e, `check:build`, plus a rebuilt
   `release/sketchpilot-1.3.1.zip` and a fresh screenshot of the panel.
