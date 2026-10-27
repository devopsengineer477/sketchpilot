# Chrome Web Store submission checklist

Status of `release/sketchpilot-1.1.2.zip` against what the Web Store actually checks, and the
short list of things only the account owner can do.

---

## 1. Package — verified ✅

Checked against the built artefact, not the source tree.

| Requirement | Status |
| --- | --- |
| Valid MV3 manifest | ✅ `manifest_version: 3`, module service worker |
| `manifest.json` at the **root** of the ZIP | ✅ (confirmed by extracting the ZIP and loading it unpacked) |
| No dev files in the package | ✅ no source maps, no `.ts`, no `node_modules`, no tests, no lockfile, no `.env` |
| Size | ✅ 2.7 MB (limit is 2 GB) |
| Icons | ✅ 16/32/48/128 PNG, declared for both `action` and extension |
| Name length ≤ 45 chars | ✅ "SketchPilot AI" (14) |
| Short description ≤ 132 chars | ✅ 129 (there is a test for this) |
| Version format | ✅ 1.1.0, and `package.json` / manifest / in-app `APP_VERSION` are synced |
| Loads from the ZIP | ✅ extracted to a clean folder, loaded unpacked, service worker registered, popup rendered, `chrome.runtime.getManifest()` → 1.1.0 |

## 2. Policy-sensitive items — verified ✅ (with one thing to disclose)

| Item | Status |
| --- | --- |
| **No remote code** | ✅ all code packaged; no CDN, no eval of remote content |
| **CSP** | ✅ `script-src 'self'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'self'; base-uri 'self'` |
| **Permissions minimal** | ✅ `storage`, `activeTab`, `scripting`, `contextMenus`, `clipboardWrite` — no host permissions, no content scripts, no `tabs`, no `debugger` |
| **Permission justifications written** | ✅ `docs/security-review.md` §3 (paste into the console; also summarised in `docs/store-listing.md`) |
| **Zero network on cold start** | ✅ automated test: 0 external requests on every surface |
| **No unreachable features offered** | ✅ the engine's Mermaid importer / text-to-diagram tab / palette commands are removed at the source, not merely hidden |
| **No third-party branding / affiliation** | ✅ no other product's name or links in the UI; non-affiliation stated in Settings → About, the listing and the privacy policy |
| **Licences honoured** | ✅ `THIRD-PARTY-NOTICES.txt` (252 packages) + `LICENSE.txt` ship in the package |
| **Privacy policy** | ✅ written (`PRIVACY.md`) — **still needs a public URL, see §4** |
| **Data-use disclosures** | ✅ answers prepared in `docs/store-listing.md` |
| **Screenshots** | ✅ 5 × 1280×800 + 440×280 promo tile, generated from the real build |

### Console hygiene

The extension's own console output has been audited message by message. As of **1.1.2** the PNG
export and the library-thumbnail renderer send no `quality` value, so the engine's
`"quality" will be ignored for "image/png" mimeType` warning no longer appears; end-to-end test
*8d* in `tests/e2e/extension.spec.ts` fails if it ever comes back. The only line a reviewer may
still see is the CSP-blocked `new Function` font-subset chunk, which is disclosed above.

### The one thing to disclose to reviewers

The bundled canvas engine includes an Emscripten-built **font subsetting** chunk
(`assets/subset-shared.chunk-*.js`, 1.8 MB) that contains `new Function(...)` — standard
Emscripten glue code, **packaged locally, never fetched**. Two facts make this a non-issue, and
one of them is worth telling the reviewer:

1. It is **not remote code**: the function bodies are strings already inside the package.
2. Our CSP has **no `unsafe-eval`**, so any such call is refused by Chrome. Probed on the
   packaged build: drawing, text editing and CJK/Cyrillic/emoji text all render correctly with
   **zero CSP violations** — the font subsetter simply falls back to system fonts.

Add one line to the reviewer notes (already drafted in `docs/store-listing.md`):

> The canvas engine ships an Emscripten-generated font-subsetting chunk that contains
> `new Function`. It is bundled locally (no remote code), is not reachable from the popup,
> dashboard or settings pages, and the extension's CSP (`script-src 'self'`, no `unsafe-eval`)
> prevents it from executing; text rendering falls back to system fonts where it would be needed.

If you would rather remove the question entirely, the chunk can be excluded from the build and
the font-subset path disabled. It costs nothing user-visible in an English-only release — say the
word and I will do it as a follow-up release.

## 3. Review-risk assessment (honest)

| Risk | Likelihood | Why / mitigation |
| --- | --- | --- |
| **"Multiple purposes"** flag | Medium | Drawing + page capture + AI can read as three products. The listing's single-purpose statement frames it as one: *"a local-first canvas for sketching and diagramming, with optional capture of the page you are on and optional AI assistance that feeds the canvas."* Emphasise that capture and AI are **inputs to the canvas**, not separate features. |
| Additional scrutiny of the **AI** feature | Medium | Explain in reviewer notes: off by default, user's own key, exact payload shown before sending, no analytics, no server of ours. |
| **Name similar to an existing item / trademark** | Low–Medium | No Chrome Web Store item called "SketchPilot" was found in a search, but **you must confirm yourself** (store search + a trademark search in your jurisdiction). Names are the cheapest rejection reason to avoid. |
| Branding complaint from another project | Low | We removed every third-party name, link and offer from the UI, ship the required notices, and state non-affiliation in-app. Do **not** use another product's name in the listing text ("…alternative", "…for X") — that is the one place it would reappear. |
| Permission questions | Low | Five permissions, each with a written justification; `activeTab`-only capture is the story reviewers want to hear. |

## 4. What only you can do

These cannot be prepared from inside the repository.

1. **Developer account** — pay the one-time **US$5** registration fee at the Chrome Web Store
   developer console, and complete identity verification (can take a few days).
2. **2-Step Verification** must be enabled on the Google account you publish with (policy
   requirement for new items).
3. **Host the privacy policy at a public URL** — `PRIVACY.md` is ready; put it on GitHub Pages,
   your site, or a gist, and paste the URL into the listing. An extension with a privacy-relevant
   feature and no reachable policy URL gets rejected.
4. **Confirm the name** is free in the store and not trademarked.
5. **Listing details** — category (Productivity), language, support/contact email, and the
   data-use questionnaire (answers are pre-written in `docs/store-listing.md`).
6. **Upload** `release/sketchpilot-1.1.2.zip` in *Package → Upload new package*, fill the listing,
   paste the reviewer notes, submit.
7. Expect **a few days** for a first review (longer if they ask about the AI/capture surface);
   updates are usually faster.

## 5. After publishing

- Keep `release/` as the source of truth for what is live; bump the version three ways
  (`package.json`, `public/manifest.json`, `src/storage/schemas.ts`) or the build fails.
- Re-run `npm run verify && npx playwright test` before every upload — the suite drives the
  packaged build, so a red suite means a bad upload.
- Every release regenerates the notices (`npm run notices` runs inside `npm run build`); if a
  dependency changes and you skip the build, `check-build.mjs` fails.

## 6. One-line answer

**Yes — the package itself is ready.** What remains is the storefront work: a developer account,
a hosted privacy-policy URL, a name check, and the listing text — all of which now exists as
copy-paste material in `docs/store-listing.md`.
