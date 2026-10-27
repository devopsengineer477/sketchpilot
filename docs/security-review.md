# Security review — v1.0.0 (P5-T12, P5-T13, P5-T14)

Scope: the shipped extension (`dist/`), the fourteen source modules that touch untrusted
input, and the release process. Each line states what is true **and how it is enforced** —
a claim without a test or a build check is marked as such.

## 1. Checklist

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | No `eval`, no remote code, no dynamically loaded scripts in shipped pages | ✅ | `scripts/check-build.mjs` step 4 scans every shipped `.js` for `eval(` / `new Function(` and fails the build. One allowlisted chunk: Excalidraw's wasm glue (`subset-*.chunk-*.js`), never reachable from the popup/dashboard/settings entries and never given user input. |
| 2 | CSP declared and minimal | ✅ | `manifest.json` → `content_security_policy.extension_pages: "script-src 'self'; object-src 'none'"`. No `'unsafe-eval'`, no remote `script-src`, no `object-src`. |
| 3 | Zero network on cold start | ✅ | `tests/e2e/milestone5.spec.ts` → *17. every surface loads with zero external requests* records every request on popup, dashboard and editor and also rejects any `http(s)` reference in the shipped HTML. |
| 4 | SVG sanitised on export **and** import | ✅ | `export/io.ts:sanitizeSvg` strips `<script>`, `<foreignObject>`, `on*=` handlers and `javascript:`/`data:text/html` hrefs; applied to every SVG we produce (`export/render.ts`) and to imported `.svg`-derived content. Tests: `import-export.test.ts` (*strips scripts, event handlers and javascript: urls*), `export-render.test.ts` (*sanitises what the engine produces*), e2e *8b*. |
| 5 | HTML injection impossible in labels and notes | ✅ | Every user- and AI-supplied string is rendered as a React text node. There is no `dangerouslySetInnerHTML` in `src/` (grep is part of review; React escapes by default). The only HTML string in the codebase is the SVG string above, which is sanitised and only ever written to a downloaded file. |
| 5a | No remote content can be embedded in a page or on the canvas | ✅ | CSP is `script-src 'self'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'self'; base-uri 'self'` (enforced by `check-build.mjs`, which rejects `unsafe-eval`, `unsafe-inline` and any `https:` source). The engine's **Web Embed** tool — which would have loaded a live third-party page into the canvas — is removed from the UI, so the policy and the product agree. |
| 5b | Third-party licences are honoured in the shipped package | ✅ | `public/THIRD-PARTY-NOTICES.txt` is generated from the production dependency tree (252 packages) by `npm run notices`, regenerated on every build, required to exist by `check-build.mjs`, and read back out of the installed extension by `tests/e2e/brand.spec.ts` (MIT + Apache texts + the bundled components' notices). |
| 5c | No other product's branding or links in the shipped UI | ✅ | `tests/e2e/brand.spec.ts` scans every surface, toolbar tooltip, panel and dialog for another product's name and finds none; the canvas menu, help dialog, library panel and "More tools" entries were replaced or removed. |
| 6 | Credentials never logged, never in errors, never in drawings | ✅ | `ai/credentials.ts` keeps the key in `chrome.storage.local` under `sketchpilot.ai`; `usage` entries are content-free (`at, provider, model, kind, outcome, tokens, durationMs`). `ai-provider.test.ts` (*masks keys for display*) and `ai-validate.test.ts` cover the display/redaction paths. No `console.*` exists in `src/` outside error surfaces. |
| 7a | No outbound links anywhere in the UI | ✅ | The engine's "Excalidraw links" menu group, its Help dialog (docs/blog/GitHub/YouTube) and the library panel's "Browse libraries" button (which appended a referrer token with our extension ID) are removed — `src/editor/EngineMenu.tsx` replaces the menu, two CSS rules hide the help button and browse button. Enforced by `tests/e2e/milestone5.spec.ts` → *no surface hands the user off to a third-party site*, which allows zero visible off-extension anchors on any surface, with menu / shortcut sheet / library panel open. |
| 7 | No analytics, no telemetry, no auto-upload | ✅ | There is no analytics dependency in `package.json`; request capture (row 3) proves no traffic. Page text only leaves the machine after an explicit review-and-confirm step (`docs/privacy-review-m4.md`). |
| 8 | Untrusted input treated as untrusted everywhere | ✅ | Four entry points, one write path: imported JSON (`export/io.ts` zod envelope), library archives (`export/archive.ts`), AI output (`ai/validate.ts` → `ai/repair.ts` → `ai/layout.ts`), page text/selection (`platform/capture.ts` schema-checked). All four converge on `repository.save` after schema validation, which is why §17's "invalid output cannot corrupt a drawing" is structural. |
| 9 | Storage failures degrade, never lose data | ✅ | `storage/autosave.ts` keeps the pending revision and retries; failures surface as actionable copy (`scenario 14`). |
| 10 | Permissions minimal and documented | ✅ | `PERMISSIONS.md` is the contract: `scripts/check-build.mjs` parses its table and fails on any drift; `src/tests/permissions.test.ts` and `src/tests/test-matrix.test.ts` assert the same from the other side. |
| 11 | No content scripts, no host permissions | ✅ | Manifest check + e2e: `host_permissions` and `content_scripts` must be absent; `activeTab` is the only page-granting permission. |
| 12 | Screenshots are single-use and memory-first | ✅ | `platform/capture.ts` writes to `chrome.storage.session` (RAM), reads-and-deletes in one step (`takePendingCapture`), and *Discard* writes nothing to disk. |
| 13 | Release artefact is the audited artefact | ✅ | `npm run build` runs `typecheck → vite build → check:build`; the ZIP is made from that `dist/` and nothing else. |

## 2. Threat model — three attacker positions

### A. A malicious drawing file (`.json` / library archive) you were sent

**What they want:** code execution in the extension origin (which holds your other drawings
and your API key), or to have the app write somewhere it should not.

**What happens instead:**

1. Size is checked before parsing (12 MB JSON / archive multiplier), so a decompression-style
   memory attack is bounded.
2. `JSON.parse` is wrapped; a malformed file produces a message, not a stack trace.
3. The envelope, schema version, element array, ids, geometry and style values are validated
   by zod (`exportEnvelopeSchema`, `libraryArchiveSchema`). Non-finite geometry, duplicate
   ids and unknown types are rejected — see `import-export.test.ts` and `archive.test.ts`.
4. Import is *additive and id-fresh*: an imported document can never overwrite an existing
   drawing, so a crafted file cannot silently replace your work.
5. Nothing in the document is ever interpreted as markup or as a URL to fetch. Labels become
   text; there is no `dangerouslySetInnerHTML` and no remote `img src`.
6. Even the SVG path is sanitised after the engine renders it, so an element carrying
   `onclick` or a `javascript:` href cannot survive into the exported file.

**Residual risk:** a 12 MB file full of exotic elements may still make the canvas slow. That
is a denial-of-service on your own tab, bounded by the pixel/export budget (40 MP) and the
import size limit; it cannot read or send anything.

### B. A compromised or hostile AI provider

**What they want:** to inject content into your drawing, to see more than you agreed to send,
or to get you to leak a different key/endpoint.

**What happens instead:**

1. You choose the base URL. It must be `https` (the only network destination the product can
   ever use), and the key is sent only to that origin, only when you press a button.
2. Page text reaches the provider only after you open the AI panel, see the exact payload and
   confirm it (`scenario 13`, `docs/privacy-review-m4.md`).
3. The response is treated as hostile text: fenced/`prose` replies are extracted or rejected,
   then shape-validated, meaning-validated (duplicate ids, dangling edges, absurd counts),
   repaired where unambiguous, and laid out locally. Anything that fails becomes an error
   message — the canvas is untouched (`scenario 10`, `scenario 11`, e2e asserts the drawing is
   byte-identical after a failure).
4. Provider output cannot choose coordinates that escape the guard, cannot name a file, cannot
   trigger an export, and cannot reach the clipboard.
5. The provider never sees your library: each request carries only the prompt you typed and,
   if you explicitly approved it, the selected page text or the elements of the current
   drawing.

**Residual risk:** the provider sees whatever you approved sending. That is disclosed in the
UI at the moment of sending, and in `PRIVACY.md`.

### C. Someone else at your machine (shared profile, or a stolen laptop)

**What they get:** everything in the profile — drawings, page text you kept, and the API key
in `chrome.storage.local`.

**Why it is stated plainly:** this is a browser-profile boundary, not a secret manager. The
product therefore ships with no key, offers one-click *Remove key*, shows the key masked, and
documents the limitation in `PRIVACY.md` rather than implying encryption it does not have.
Encrypting the key with a passphrase was considered and rejected for 1.0: it would move the
secret into the same profile, add a lockout failure mode, and buy nothing against this
attacker.

## 3. Permission justifications (store-facing text, P5-T13)

These are the exact strings for the Chrome Web Store *Permission justification* fields.

**`storage`** — Saves drawings, titles, favourites, preferences and (only if the user adds
one) their own AI API key. Drawing bodies live in IndexedDB; this permission covers the small
settings surface in `chrome.storage.local` and the memory-only pending screenshot in
`chrome.storage.session`. No browsing data is stored.

**`activeTab`** — Needed for the two capture features: taking a screenshot of the tab the user
is looking at, or reading the text they selected. It is granted only by an explicit click on
the toolbar icon, a context-menu item or a keyboard shortcut, only for that tab, and expires
when the tab navigates. SketchPilot has no host permissions, so it cannot read any page in the
background.

**`scripting`** — Used to inject a single small function that returns the current text
selection, at the moment the user asks for it (keyboard shortcut or context menu). Nothing is
injected at page load and no declared content scripts exist.

**`contextMenus`** — Adds right-click items: new drawing, sticky note from selection, mind map
from selection, capture this page. The menu items only act when clicked.

**`clipboardWrite`** — Lets the user copy a diagram, a note or a source reference to the
clipboard. SketchPilot never reads the clipboard.

**No remote code.** All code ships inside the package; the extension makes no network requests
except to an AI provider the user configures themselves.

## 4. Release-process controls

- Three-way version sync (`package.json`, `public/manifest.json`, `APP_VERSION`) is enforced by
  `check-build.mjs`; a release cannot be mislabelled.
- `check-build.mjs` also enforces: required artefacts present, MV3, permission-parity with
  `PERMISSIONS.md`, ≤4 suggested shortcuts, no remote asset references in shipped HTML, fonts
  bundled, popup chunk under 200 kB and free of the canvas engine.
- CI (`.github/workflows/ci.yml`) runs lint → typecheck → unit+coverage → build → end-to-end
  tests against the packaged `dist/`, then uploads that `dist/` as the release artefact. The
  artefact that ships is the artefact the tests ran against.
- No dependency is added that can execute at runtime without being bundled; the only runtime
  dependencies are React, Excalidraw, zod, lucide-react and tailwind-merge.

## 5. Known limitations (stated, not hidden)

1. **The API key is protected by your browser profile, not by encryption.**
2. **No CSP `report-uri`/telemetry** — by design; violations surface in the DevTools console.
3. **Excalidraw's wasm "glue" chunk contains `new Function`.** It is unused by SketchPilot's
   own export paths (`exportToBlob`/`exportToSvg` with our own SVG sanitiser), is not loaded by
   the popup/dashboard/settings entries, and cannot receive user text through any call we make.
   It is allowlisted explicitly in the build check rather than silently tolerated.
4. **Browser capture requires a real user gesture.** Chrome will not let an extension fake the
   `activeTab` grant, so the capture tests drive everything except the final
   `captureVisibleTab` call, which is unit-tested against a mocked `chrome.tabs`.
