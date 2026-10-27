# Privacy review — Milestone 4 (browser capture)

Plan P4-T13. Every path that can take data **out** of the browser, with its trigger and the
person who has to act first. If a row says "user presses X", no code path can run it
without that press — there is no timer, no page hook, no background poll.

## Outbound paths

| # | What leaves | Where it goes | Trigger (must be a user action) | Can it happen without an explicit press? |
| --- | --- | --- | --- | --- |
| 1 | The generated diagram prompt + the current diagram's labels/edges (AI generate / refine) | The provider base URL you configured | You open the AI panel and press **Generate** | No. Nothing is sent on tab open, on selection, or on a schedule. |
| 2 | Text lifted from a web page (AI mind map from selection) | Same provider | You click **Mind map (AI)** in the capture dialog, read the payload summary, and press **Send to &lt;host&gt;**, then **Generate** | **No — two explicit confirmations.** The consent block lists host, model, character count and the exact text; editing the prompt revokes consent and requires a new confirmation. |
| 3 | Model traffic for **Test connection** | Same provider | You press **Test connection** in Settings | No. |
| 4 | Nothing else | — | — | The extension makes no other network request. Fonts, icons and logic ship inside the package. |

## What is read, and when

| Data | API used | Grant | Lifetime |
| --- | --- | --- | --- |
| The screenshot of the tab you are looking at | `chrome.tabs.captureVisibleTab` | `activeTab` | One call. The image is held in `chrome.storage.session` (RAM) and deleted the first time the editor reads it. |
| The text you have selected | `chrome.scripting.executeScript` with one self-contained function | `activeTab` + `scripting` | One call; the injected function returns and is gone. No listener, no mutation observer, no DOM retention. |
| The selected text for a context-menu note | Chrome's own `info.selectionText` | — | Provided by the browser to the menu handler; **no injection at all** for this path. |
| Tab title and URL of the tab you acted on | `chrome.tabs.query({active, currentWindow})` | `activeTab` | One call, to label the capture. |

Not read, ever: cookies, history, form values, the contents of any tab you did not act on,
the clipboard (we only *write* to it, and only when you press Copy).

## Deliberate refusals

- **Protected pages** (`chrome://`, `about:`, `devtools://`, the Chrome Web Store, other
  extensions' pages, `file://` without explicit access) are refused *before* any API call,
  with a message that says which kind of page it is and what to do instead.
- **No `host_permissions`.** `activeTab` expires when you navigate or switch tabs; a host
  permission would let the extension read every page you ever visit.
- **No content scripts in the manifest.** The reader is injected per invocation.
- **No side panel in this milestone.** It was optional in the plan and is deferred rather
  than stubbed (§16: no half-built surfaces).

## Verification

- Unit: `src/tests/capture.test.ts` — 43 tests, including "protected page → `captureVisibleTab` is never called" and "consent summary reports exactly what would be sent".
- E2E: `tests/e2e/milestone4.spec.ts` — a real protected tab is refused with real Chrome errors; a pending capture is single-use; discarding leaves **no drawing record at all**; page text cannot reach a provider until confirmed (`requests === 0` asserted while consent is pending).
- Build: `scripts/check-build.mjs` parses `PERMISSIONS.md` and fails if `manifest.json` drifts, if host permissions appear, or if a content script is declared.
