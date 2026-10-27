# Permissions and data access

SketchPilot AI asks for the smallest permission set that lets it draw, save, capture a
page you asked for, and open files. **This file is the contract:**
`scripts/check-build.mjs` parses the table below and fails the build if
`dist/manifest.json` declares anything else, or omits anything listed here.

## Declared in the manifest (v1.0.0)

| Permission | Why it is required | What it does **not** allow |
| --- | --- | --- |
| `storage` | Drawing titles, favourites, preferences and AI settings in `chrome.storage.local`; pending screenshots in `chrome.storage.session`. (Drawing bodies live in IndexedDB, which is not a Chrome permission.) | Reading page content, tabs, cookies, history. |
| `activeTab` | Capture the visible tab, or read the current selection, **only** for the tab in front of you and **only** after you click the toolbar icon, a context-menu item, or a keyboard command. | Background access to any tab. The grant expires as soon as you navigate or switch tabs. |
| `scripting` | Inject one small function that returns the current text selection, at the moment you ask for it. | Injecting on page load, into pages you never asked about, or into protected pages. |
| `contextMenus` | The right-click items: new drawing, sticky note from selection, mind map from selection, capture the page. | Reading the page for menus you did not click. |
| `clipboardWrite` | Copy a diagram, a note, or a source reference to the clipboard when you press Copy. | Reading the clipboard. |

```json
"permissions": ["storage", "activeTab", "scripting", "contextMenus", "clipboardWrite"],
"host_permissions": [],
"content_scripts": []
```

### Deliberately not requested

| Capability | Status | Why |
| --- | --- | --- |
| `<all_urls>` / any host permission | Never | `activeTab` is a per-click, expiring grant. A host permission would let the extension read every page you visit, forever, for a feature that runs once per click. |
| Content scripts declared in the manifest | None | The selection reader is injected on demand with `scripting.executeScript` and lives for one call. |
| `tabs` | Not requested | Opening our own pages needs nothing. Tab *titles and URLs* are only read for the tab you invoked us on, under `activeTab`. |
| `cookies`, `history`, `webRequest`, `webNavigation` | Never | Nothing in the product needs them. |
| `identity`, `sidePanel`, `notifications`, `alarms`, `unlimitedStorage` | Not requested | No account and no side panel in 1.0 (see the plan: it is deferred, not stubbed), no background reminders. |
| `debugger` | Never | Capture uses the documented `captureVisibleTab` API, not the debugging protocol. |

## Where your data goes

- **Local only, by default.** Drawings, drafts, thumbnails, preferences and AI settings
  stay in this browser profile.
- **Screenshots are memory-only until you keep them.** A capture is held in
  `chrome.storage.session` (RAM, cleared when the browser closes) and deleted the moment
  the editor reads it. If you press *Discard* nothing is written to disk at all.
- **No analytics, no telemetry, no remote code.** The build check enforces that no shipped
  page loads a remote resource and that fonts ship inside the extension.
- **AI is opt-in and gated.** Text from a page reaches a provider only if you configured
  one, opened the AI panel yourself, reviewed the exact outgoing payload and confirmed it.
  See `docs/privacy-review-m4.md` for the full list of outbound paths.

## Keyboard commands

Declared in the manifest, all rebindable at `chrome://extensions/shortcuts` (Chrome allows
at most four suggested shortcuts, which is why "Open the library" ships unbound):

| Command | Default |
| --- | --- |
| Open the popup | `Ctrl/⌘ + Shift + K` |
| New drawing | `Ctrl/⌘ + Shift + 7` |
| Capture the visible tab | `Ctrl/⌘ + Shift + 9` |
| Sticky note from selected text | `Ctrl/⌘ + Shift + 8` |
| Open the library | unbound — bind it yourself |

No browser-reserved combination is overridden: everything is a `Ctrl/⌘ + Shift` chord that
Chrome does not already use.

## Deleting your data

Dashboard → **Delete all local data** removes every drawing, draft and thumbnail stored by
the extension. Settings → AI assistant → **Remove key** deletes the provider key and the
usage log. Removing the extension from `chrome://extensions` deletes its storage entirely.
