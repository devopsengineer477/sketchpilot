# Chrome Web Store submission package — SketchPilot AI 1.0.0

Everything below is ready to paste into the Web Store developer console. Nothing here
describes a feature that is not in the shipped build; the wording was checked against
`README.md` and the §17 audit (`docs/definition-of-done.md`).

## Independence statement (put this in the description and the reviewer notes)

> SketchPilot AI is an independent product. It is not affiliated with, endorsed by or sponsored by
> any other project, and it shows no other product's name, links or offers. It is built on
> open-source software; the required copyright notices and licence texts ship inside the package
> as `THIRD-PARTY-NOTICES.txt`. The extension makes no network requests unless you configure your
> own AI provider, and it cannot embed remote pages (`frame-src 'none'`).

## Item details

| Field | Value |
| --- | --- |
| Name | SketchPilot AI |
| Short description (≤132 chars) | Sketch and diagram on a fast canvas. Capture pages and text, use templates or AI, and keep everything local, offline and private. |
| Category | Productivity |
| Language | English |
| Version | 1.0.0 |
| Manifest | V3, minimum Chrome 110 |
| Package | `release/sketchpilot-1.1.0.zip` |
| Privacy policy URL | host `PRIVACY.md` (GitHub blob or Pages URL) |
| Homepage / support URL | repository README / issues |

## Detailed description

```
Sketch, diagram and think — without leaving the tab you are working in.

SketchPilot AI is a fast, local-first canvas for Chrome. It opens in a tab with the full
toolbar you expect (shapes, arrows, freehand, text, frames, layers), and it never sends
your work anywhere unless you ask it to.

DRAW AND DIAGRAM
• Shapes, arrows, freehand, text and notes on an infinite canvas
• Twelve built-in templates: flowchart, mind map, architecture, wireframe, retrospective,
  Kanban, timeline, journey map, org chart, comparison, storyboard and decision tree
• Frames, layers, alignment, snapping and a zoomable, pannable workspace
• Undo/redo, autosave, and instant recovery of unsaved work if a tab closes

SAVE AND ORGANISE
• A searchable library with thumbnails, favourites and sort order
• Export PNG, SVG or JSON; import JSON, single drawings or a whole library archive
• Save your own templates
• Light and dark themes, and a light/dark choice that is remembered

CAPTURE THE PAGE YOU ARE ON
• Screenshot the visible tab straight into a drawing, in a review step first
• Turn selected text into a sticky note — with the source page kept on the note
• Right-click menu entries for a new drawing, a note from the selection, a mind map from
  the selection, and a page capture
• Capture only ever touches the tab you invoked it on, and only after you invoke it

OPTIONAL AI — YOUR KEY, YOUR PROVIDER
• Describe a diagram and get editable shapes (not an image): flowcharts, mind maps,
  architecture, and more
• Refine an existing drawing: align it, add missing steps, improve labels, add error
  branches, group components
• Explain a drawing, generate documentation from it, or convert it to Mermaid
• Works with OpenAI, OpenRouter, or any OpenAI-compatible endpoint, including a local
  server
• Strict, versioned JSON schema with validation and repair — a bad response becomes an
  error message, never a corrupted drawing
• AI is off until you configure it. You review the exact outgoing payload before it is sent.

PRIVATE BY DESIGN
• No account, no analytics, no telemetry, no tracking
• No host permissions and no content scripts: SketchPilot cannot read pages in the
  background
• Drawings live in your browser profile. Your AI key stays in your profile too
• Every font and asset ships inside the extension — it works offline
```

## Permission justifications

Use the wording in [`docs/security-review.md`](security-review.md) §3 — that section is the
submission copy, in the exact order the console asks for it (`storage`, `activeTab`,
`scripting`, `contextMenus`, `clipboardWrite`).

One-line summary for the "Additional details" box:

> SketchPilot AI processes everything locally. The extension requests no host permissions and
> no content scripts; `activeTab` + `scripting` are used solely for the screenshot and
> selected-text features the user explicitly triggers, and no code is loaded remotely.

## Screenshots (1280×800, real captures)

| File | Shows |
| --- | --- |
| `store/screenshots/01-editor-light.png` | The editor with a real diagram on the canvas |
| `store/screenshots/02-templates.png` | The template gallery |
| `store/screenshots/03-editor-ai-preview.png` | AI output previewed before it touches the canvas |
| `store/screenshots/04-capture-review.png` | The capture review step (*Insert* / *Discard*) |
| `store/screenshots/05-editor-dark.png` | Dark theme |

Promo tile: `store/promo-tile-440x280.png` (composited from the real template capture).

All screenshots — the app surfaces in `docs/screenshots/` and the five store images above — are
generated from the packaged build by `tests/e2e/shots.spec.ts`, so they cannot show UI that does
not exist (or omit UI that was removed).

## Data-use answers (console "Privacy practices" tab)

| Question | Answer |
| --- | --- |
| Does it collect personally identifiable information? | No |
| Health information? | No |
| Financial and payment information? | No |
| Authentication information? | No |
| Personal communications? | No |
| Location? | No |
| Web history? | No |
| User activity (clicks, mouse position)? | No |
| Website content? | No — page text you explicitly capture is stored locally and only sent to a provider you configure, after review |
| Is data sold to third parties? | No |
| Is data used for purposes unrelated to the single purpose? | No |
| Is data used to determine creditworthiness? | No |
| Single purpose statement | A local-first canvas for sketching and diagramming, with optional page capture and optional user-configured AI assistance. |
| Remote code | No — all code is packaged. |

## Reviewer notes

Paste into the "Notes for review" field:

1. **No account or login is needed** to test any feature except AI. Open the toolbar popup →
   *New drawing* to reach the editor, or the dashboard for the library.
2. **AI is opt-in.** To test it, go to Settings → AI, paste an API key for OpenAI or
   OpenRouter (or point the base URL at any OpenAI-compatible endpoint), then use *Test
   connection*. Without a key the panel explains exactly what to configure — that path is
   tested.
3. **Capture needs a user gesture.** Chrome only grants `activeTab` on a real click, so use
   the right-click menu or `Ctrl/⌘+Shift+9` on an ordinary `https` page. `chrome://` pages are
   refused on purpose with an explanation (Chrome blocks capture there for every extension).
4. **The extension makes no network requests** unless an AI provider is configured; this is
   covered by an automated test.
5. Keyboard shortcuts are `Ctrl/⌘+Shift+K` (popup), `+7` (new drawing), `+9` (capture tab),
   `+8` (sticky note from selection). Chrome allows at most four suggested shortcuts, so
   "Open library" ships unbound.
