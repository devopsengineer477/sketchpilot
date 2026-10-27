# Milestone 4 delivery report — v0.4.0

Date: 2026-10-27 · Scope: spec §7 (browser integration), §11 (permission minimisation),
§14 tests 13 and 18, plus the `BrowserCapture` model from §10.

## What shipped

The extension now earns its toolbar slot: it can take something **from the web** and turn
it into something you own, without ever reading a page you did not point at.

| Area | Result |
| --- | --- |
| Screenshot capture | Popup, context menu and `Ctrl/⌘+Shift+9` → review dialog → crop → insert as a real image element |
| Discard | Captures live in `chrome.storage.session` (RAM), are single-use, and discarding leaves **no drawing record at all** |
| Selected text | Right-click → sticky note, or `Ctrl/⌘+Shift+8` (injects a one-shot reader) → sticky note / canvas text / source reference / mind map |
| Source references | `{url, title, capturedAt, excerpt}` on the element's `customData`, plus an on-canvas chip, link, and URL included when copying |
| Protected pages | `chrome://`, Web Store, extension pages, `file://`, `view-source`, `data:` each refused **before** any API call, with their own message and next step |
| Context menus | New drawing, library, capture page, note from selection, mind map from selection — routed through the worker |
| Commands | Four suggested shortcuts (Chrome's maximum) + one declared-but-unbound command; the editor's `?` sheet lists the **live** bindings |
| AI consent gate | Page text cannot leave the browser until the exact payload is shown and confirmed; editing the prompt revokes consent |
| Permissions | `storage`, `activeTab`, `scripting`, `contextMenus`, `clipboardWrite` — **no host permissions, no content scripts, no `tabs`** |

## Commands run (all green)

```
npx tsc --noEmit        → clean
npx vitest run          → 146 passed / 9 files
npx vite build          → ✓ built
npm run check:build     → all checks passed (permissions parsed from PERMISSIONS.md)
npx playwright test     → 39 passed (37 specs + 2 docs screenshot captures)
```

Milestone 3 baseline: 103 unit / 30 e2e. M4 adds **43 unit tests** and **9 e2e specs**
(8 capture specs + the popup/capture screenshot captures that keep the docs honest).

## Test coverage added

**Unit — `src/tests/capture.test.ts` (43)**

| Group | Covers |
| --- | --- |
| Page classification | 15 allowed/refused URL cases; every refusal carries a message *and* a next step; PDF-viewer pages named honestly |
| Chrome failure translation | protected page, denied `activeTab`, oversized capture, unknown error |
| `captureVisibleTab` | happy path, **no API call for a protected page**, denied permission → copy, oversize rejection, undecodable image |
| `captureSelection` | whitespace normalisation, empty selection, refusal before injection, missing tab id, 100 k-character truncation |
| Injection parsing | well-formed payload, no result, missing fields (never invents text) |
| Capture model | `data:text/html` rejected, source reference JSON round-trip, junk `customData`, copy-includes-URL, note truncation, consent summary |
| Pending store | single-use read, corrupted record refused |
| Context menus | id → action mapping, empty selection ignored |

**E2E — `tests/e2e/milestone4.spec.ts` (8)**: protected page refused with real Chrome
errors · capture without a grant explains itself · screenshot reviewed → inserted → image
file persisted → survives reload · discard leaves zero drawings and the pending record gone
· selected text → sticky note with source, chip and clipboard URL · **page text cannot reach
a provider until confirmed (`requests === 0`)** · commands declared/bound/listed ·
capture entry points are functional.

## Bugs found and fixed during M4

| Bug | Cause | Fix |
| --- | --- | --- |
| The extension would not load at all | Chrome allows **four** suggested shortcuts; we declared five, and the failure is silent | Four suggested + one declared-but-unbound command; the release guard now fails the build above four |
| `PERMISSIONS.md` check flagged `debugger`/`tabs` as "documented but not declared" | The parser swallowed the *"deliberately not requested"* table too | Parse only the declared section; the doc is now the contract in both directions |
| Every editor open created an empty drawing | The engine fires `onChange` on mount, so the autosave wrote a blank record | A drawing is only persisted once it has content or already exists — which also makes "capture → discard leaves nothing" true |
| The shortcut sheet could not be dismissed | Adding the commands section made the dialog taller than the viewport, pushing **Done** off-screen | `Dialog` now scrolls (`max-h-[85vh]`), so no dialog can trap the user |
| Capture tabs raced the install-time editor tab | `waitForEvent('page')` returned whichever tab arrived first | New `waitForSurface()` helper matches the URL that was actually requested |
| E2E runs died with "target page has been closed" | Chrome profiles filled the 992 MB `/tmp` tmpfs | Profiles moved to `./.cache/e2e-profiles` and deleted on close |

## Known limitations

- **A screenshot cannot be taken from a Playwright test.** `activeTab` is granted only by a
  real user gesture (toolbar click, context menu, keyboard command); there is no supported
  way to synthesise it. The e2e suite drives everything around that seam — including a real
  protected-tab refusal — and seeds the review path with the same storage key the worker
  writes. The API call itself is unit-tested against a mocked `chrome.tabs`.
- **A capture opens the editor; it does not ask "new drawing or existing?".** That keeps the
  privacy story simple (nothing is written until you Insert) at the cost of one drag if you
  wanted it in another drawing.
- **Cropping is a rectangle.** No annotation tools: the plan's P4-T4 accepted "annotate by
  inserting and drawing on the canvas" instead of building a second editor.
- **No side panel.** Optional in the plan, deferred to the post-1.0 backlog rather than
  stubbed.
- **`file://` pages need "Allow access to file URLs"** on `chrome://extensions`; without it
  the refusal message says exactly that.
- Captured screenshots are stored as PNG inside the drawing (≈1–3 MB each). The storage
  meter counts them, and the quota error path already offers an export escape hatch.

## Next: Milestone 5 (production readiness)

Depth in tests (all 18 §14 scenarios named and running), accessibility and keyboard pass,
performance budgets with recorded numbers, security review, store package + `PRIVACY.md`,
and a final DoD audit — see Phase 5 in `../sketchpilot-plan/`.
