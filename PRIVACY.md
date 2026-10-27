# SketchPilot AI — privacy policy

_Last updated: 27 October 2026 · applies to SketchPilot AI 1.0.0_

SketchPilot AI is a drawing and diagramming extension for Chrome. This policy is short
because the product collects almost nothing: **there is no account, no analytics, no
telemetry, no advertising, and no server of ours.** Nothing is uploaded unless you
configure an AI provider yourself and press a button.

## What is stored on your device

| Data | Where | Why |
| --- | --- | --- |
| Drawings (elements, titles, notes, embedded images) | IndexedDB in your Chrome profile | This is the product. |
| Library metadata (titles, dates, favourites, element counts) | IndexedDB | Listing and search without loading full drawings. |
| Thumbnails | IndexedDB | Previews in the library. |
| Unsaved recovery drafts | IndexedDB | Restores work if a tab closes mid-edit. |
| Preferences (theme, grid, last-used tool) | `chrome.storage.local` | Keeps your settings between sessions. |
| AI settings (provider, model, base URL, API key) | `chrome.storage.local` | Needed to call the provider you chose. |
| Pending screenshot or captured text | `chrome.storage.session` (memory only) | Held only between capture and the editor; deleted on read, and cleared when Chrome closes. |

Nothing in that table leaves your device. There is no sync, no backup, no cloud account.

## What can leave your device

Only in these three cases, and only because you did something:

1. **AI generation / refinement / explanation.** When you open the AI panel, type a request
   and press *Generate* (or *Refine*, *Explain*, *Document*, *Mermaid*), SketchPilot sends your
   request — plus, if you approve it, the selected page text or the current drawing's elements —
   to the provider **you** configured. The exact payload is shown to you before it is sent, and
   page text cannot be included without an explicit confirmation step.
2. **The provider's response** comes back to your browser. It is validated locally before
   anything is drawn.
3. **Exporting a file** (PNG, SVG, JSON, library archive) writes a local download. Nothing is
   uploaded.

SketchPilot itself contacts no server: there is no update check, no license check, no crash
reporting. If you never configure an AI provider, the extension makes **zero** network
requests — this is asserted by an automated test on every build
(`tests/e2e/milestone5.spec.ts`, scenario 17).

## Independence

SketchPilot AI is an independent product. It is not affiliated with, endorsed by, sponsored by or
produced by any other project, and no other product's name, links, offers or embedded content
appear in it. The one place another project's name is required is the copyright notice in
`THIRD-PARTY-NOTICES.txt`, which the licences of the open-source components oblige us to ship —
that is attribution, not affiliation. See `README.md` → *Independence, branding and licences*.

## Who else sees your data

- **Your AI provider** (only if you configure one) sees the payload you approved. What they do
  with it is governed by *their* privacy policy — OpenAI, OpenRouter, or whatever
  OpenAI-compatible endpoint you entered. SketchPilot has no relationship with them and no
  visibility into their handling.
- **Nobody else.** No third-party analytics, fonts, scripts, images or *frames* are loaded. Fonts
  ship inside the extension, and the extension's Content-Security-Policy sets
  `frame-src 'none'`, so no page, dialog or canvas object can embed a live remote site.

## Browser permissions

Each permission and its exact purpose is documented in
[`PERMISSIONS.md`](PERMISSIONS.md). In short: `storage` to save your work, `activeTab` +
`scripting` so a capture or text grab only ever touches the tab you explicitly invoked it on,
`contextMenus` for the right-click items, `clipboardWrite` so *Copy* works. There are **no**
host permissions and **no** content scripts, so SketchPilot cannot read pages in the
background or on page load.

## Your control

- **Delete a drawing, a template, or everything** from the library (also available in
  Settings → *Delete all local data*). Deletion is immediate and local.
- **Remove your API key** at any time in Settings → AI. The key is masked in the UI, never
  logged, never written into a drawing.
- **Keep screenshots out of storage entirely** by pressing *Discard* — nothing is written.
- **Work offline** indefinitely; the editor, library, templates and exports are fully local.

## Security notes we would rather state than hide

- Your API key is stored in `chrome.storage.local`, which is protected by your Chrome profile,
  **not** encrypted with a separate passphrase. Anyone with access to your profile (or your
  unlocked computer) can read it, exactly as they could read your drawings. If that is not
  acceptable, do not store a key, or use a provider key scoped to a spending limit you are
  comfortable with.
- If you use a shared computer, use a separate Chrome profile.

## Children

SketchPilot AI is a general-purpose productivity tool and is not directed at children under 13.

## Changes

Material changes to this policy will be published with a new version of the extension and
noted in [`CHANGELOG.md`](CHANGELOG.md).

## Contact

Privacy questions: open an issue in the project repository. There is no data to request or
delete from us, because we never receive any.
