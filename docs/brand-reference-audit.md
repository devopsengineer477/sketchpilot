# Third-party name audit — every remaining reference, and why it is there

**Question asked:** does any reference to the drawing engine's product name still exist in this
project? **Answer:** yes, in five categories — but only one of them was in front of a user, and it
was a defect (fixed in 1.1.2). Everything else is either a dependency name that cannot be renamed,
a comment for developers, or attribution the licences require.

Audited with `grep -ri` across the repository plus a live DOM scan of the packaged extension.

---

## 1. User-visible surfaces — clean (verified, not assumed)

| Surface | Result |
| --- | --- |
| Popup, dashboard, settings | No occurrence in text, `title`, `aria-label`, `placeholder`, `alt`, `value`, or `document.title` |
| Editor (idle) | Clean |
| Editor — canvas menu open | Clean: `Frame tool`, `Laser pointer` only |
| Editor — export menu open | Clean: `PNG image`, `SVG vector`, `JSON` |
| Editor — AI panel open | Clean; the AI prompt/JSON we send never names the engine either |
| Shortcuts sheet | Clean |

`tests/e2e/brand.spec.ts` enforces this on every run: it walks the DOM for visible text and for
every user-facing attribute on all four surfaces and in several editor states, and fails the build
on a hit.

### The defect this audit found

Every **exported SVG** started with:

```html
<!-- svg-source:excalidraw -->
```

An export is not part of the app — it is an artefact the user shares, pastes into a wiki, or opens
in another editor. That comment carried the other product's name into all of those places.

- **Fixed:** `sanitizeSvg()` (`src/export/io.ts`) now removes all XML comments (they carry no
  rendering information).
- **Pinned:** the end-to-end SVG export test asserts the file matches neither `/excalidraw/i` nor
  `/<!--/`, and a unit test covers the provenance comment specifically.
- **The other two formats were already clean**, confirmed by inspecting real downloads: PNG has no
  embedded scene metadata, and the JSON export is our own envelope (`"type": "sketchpilot"`).

## 2. The `.excalidraw` *file format* in user-facing copy — kept, deliberately

Two strings offer to read a file of that type, and the dashboard's file picker accepts the
extension:

| Location | String |
| --- | --- |
| `src/export/io.ts:45` | "Only SketchPilot JSON exports and .excalidraw files can be imported." |
| `src/export/io.ts:100` | "This .excalidraw file is malformed." |
| `src/dashboard/DashboardApp.tsx:214` | `accept=".json,.excalidraw,application/json"` (not visible) |

Reasoning: this is a file **extension** the user can see in their own file system, not a product
name, link, offer or logo. Saying "a supported drawing file" instead would make an import error
less actionable ("I dropped a `.excalidraw` file and it says…?"). Nothing in the UI suggests the
product *is* that product, links to it, or offers it.

If the stricter reading is preferred, both messages can be reworded to *"Only SketchPilot JSON
exports and supported drawing files can be imported."* — the import path itself is unaffected.

## 3. Dependency names — cannot be renamed

`package.json`, `package-lock.json` and the production tree necessarily contain
`@excalidraw/excalidraw`, `@excalidraw/laser-pointer`, `@excalidraw/random-username`,
`@excalidraw/markdown-to-text` and `@excalidraw/mermaid-to-excalidraw`. These are npm package
names, never shown to a user, and are what the licence attribution is *about*.

## 4. Engine API surface in our source — unavoidable identifiers

`import { Excalidraw } from '@excalidraw/excalidraw'`, the `ExcalidrawElement` /
`ExcalidrawImperativeAPI` types, `convertToExcalidrawElements()`, the CSS class `.excalidraw`
(scoped under our own `.excalidraw-host` wrapper) and the global `EXCALIDRAW_ASSET_PATH` are the
engine's public contract. Renaming them would break the build; none is user-visible.

The single-file blast radius is deliberate and documented in ADR-001: all engine internals are
reached through `src/editor/engine/scene.ts`, `src/editor/EngineMenu.tsx` and the one component
that mounts `<Excalidraw>`.

## 5. Attribution and developer documentation — required or intentional

| Where | Why it stays |
| --- | --- |
| `public/THIRD-PARTY-NOTICES.txt` (shipped in the package, 7 lines) | MIT/Apache-2.0 obligations. Removing it would violate the licences. It also states in plain words that SketchPilot is independent and unaffiliated. |
| `README.md`, `CHANGELOG.md`, `TROUBLESHOOTING.md`, `docs/adr-00*.md`, `docs/branding-and-licensing.md` | Developer/reviewer documentation. Naming the engine is honest disclosure, not branding. |
| `tests/e2e/*`, `src/tests/*` | Selectors and the brand assertions themselves. |

Note: the notices file lists `@excalidraw/mermaid-to-excalidraw` because it is still in the
installed production tree even though our build replaces it with a stub
(`src/stubs/mermaid-to-excalidraw.ts`) and never bundles it. Over-attribution is harmless; it is
listed because it is installed.

## Deliberately silent places — worth a decision

`PRIVACY.md`, `docs/store-listing.md` and `docs/store-submission-checklist.md` contain **zero**
occurrences: the listing describes the product in its own terms. A Web Store reviewer who wants to
know what the canvas is built on can read the shipped notices file, so nothing is concealed. If a
more explicit reviewer note is preferred ("built on an open-source canvas engine, MIT licensed,
bundled locally"), that is a one-paragraph addition to `docs/store-listing.md`.

---

## Standing guarantees

- No third-party link, menu group, help dialog, docs/blog/GitHub/Discord entry or "browse libraries"
  hand-off exists anywhere in the UI — they were removed in 1.1.0 and are regression-tested.
- No request leaves the extension while drawing, capturing or exporting (end-to-end test 17).
- Nothing in the package is fetched from a CDN: fonts are served from `dist/assets/fonts/`.
