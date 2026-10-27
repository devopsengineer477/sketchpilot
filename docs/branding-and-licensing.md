# Branding and licensing (v1.1.0)

## The decision

SketchPilot AI ships as an independent product. Nothing in the interface names, links to or
advertises another project, and nothing implies endorsement, partnership or affiliation in
either direction. The extension also states this itself — Settings → About carries the sentence,
and so do the store listing and `PRIVACY.md` — so a user never has to guess whose product this is.

## Two things that are easy to confuse

| | Rule |
| --- | --- |
| **Branding** | Another project's name, links, logos, upsells and "browse our library" hand-offs are *removed* from the UI. |
| **Attribution** | The copyright notices and licence texts of the open-source code we ship are *kept*, in full, because MIT/Apache-2.0/ISC require it. |

Removing the second would be a licence violation, not a branding win. So the notices are
generated, shipped, and verified — see below — while every visible reference is gone.

## What was removed, and why

| Removed | Reason | Where the capability lives now |
| --- | --- | --- |
| Engine menu group "Excalidraw links" (GitHub, X, Discord, excalidraw.com) | Third-party links in our product | The menu is rebuilt in `src/editor/EngineMenu.tsx`: canvas background, clear canvas, Keyboard shortcuts |
| Engine Help dialog (docs, blog, issue tracker, YouTube) | It was *only* links to another product | `?` opens SketchPilot's own shortcut sheet, also reachable from the canvas menu |
| Library panel "Browse libraries" button | Opened a third-party site with a referrer token containing the extension ID — a privacy leak as well as branding | The library is the dashboard; `.excalidrawlib` imports still work by drag-and-drop |
| "Mermaid to …" menu entry | Another product's converter, and inert here (the converter is not bundled) | Deliberately absent — Mermaid import is not claimed anywhere |
| **Web Embed** | Would load a live third-party page into the canvas — contradicts an offline, permission-minimal extension | Absent, and `frame-src 'none'` in the CSP makes it impossible even from future UI |
| Frame tool, Laser pointer | — | **Kept.** Both are local, offline and part of the drawing surface |

## How each rule is enforced

| Rule | Enforcement |
| --- | --- |
| No other product's name is visible | `tests/e2e/brand.spec.ts` — scans every surface, every toolbar tooltip, the canvas menu, library panel, AI panel, shortcut sheet and export menu, and fails on any hit |
| The removals stay surgical | Same test — asserts Frame tool and Laser pointer are still offered and Web Embed is not |
| The manifest names only us | Same test reads `chrome.runtime.getManifest()` and rejects another product's name; `check-build.mjs` also rejects it in shipped HTML/manifest |
| Notices ship and are complete | `npm run notices` generates them from the installed production tree; `check-build.mjs` fails without them; the test reads them *out of the installed package* and checks the MIT text, the Apache text and our own `LICENSE.txt` |
| No remote content can be embedded | CSP `script-src 'self'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'self'; base-uri 'self'`, asserted by `check-build.mjs` (which also rejects `unsafe-*` and any `https:` source) and by the zero-external-request test |

## What a user sees instead

- **Settings → About**: version, data schema, the privacy sentence, and a plain statement that
  this is an independent product with no other product's name/links, plus where the notices live.
- **Canvas menu**: three items that all work.
- **`?` sheet**: app shortcuts, canvas shortcuts and the browser commands with their live keys.

## Files

- `public/THIRD-PARTY-NOTICES.txt` — generated, 252 packages, ships at the ZIP root (28 KB).
- `public/LICENSE.txt` — our own MIT licence, ships with the package.
- `LICENSE` — the same licence at the repository root.
- `scripts/build-notices.mjs` — the generator (`npm run notices`, runs on every build).
