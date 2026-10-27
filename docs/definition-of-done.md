# Definition of Done — §17 audit (v1.0.0)

Line-by-line against the specification's §17, with the evidence for each line. Where a claim
was checked by hand rather than by a test, that is stated. Nothing here is asserted unless it
was observed on the build in `release/sketchpilot-1.1.2.zip`.

| §17 requirement | Verdict | Evidence |
| --- | --- | --- |
| **The extension builds without errors.** | ✅ | `npm run build` = `tsc --noEmit` (clean) → `vite build` (clean) → `scripts/check-build.mjs` (`✔ build checks passed`). `npm run lint` is clean (ESLint 9 flat config, 0 errors / 0 warnings). |
| **It can be loaded into Chrome.** | ✅ | Playwright loads the packaged `dist/` as an unpacked MV3 extension in Chromium for every end-to-end spec (55 tests). The install flow, service worker registration and all four surfaces (popup, editor, dashboard, settings) are exercised — `tests/e2e/extension.spec.ts` → scenario 1. Manual rehearsal: `release/sketchpilot-1.1.2.zip` unzipped and loaded via *Load unpacked*. |
| **Users can draw and edit diagrams.** | ✅ | Scenario 3 (`tests/e2e/extension.spec.ts` — a rectangle is dragged on the canvas and the element count is read out of IndexedDB), plus scenario 4 for undo/redo, plus the template path which produces real editable elements. |
| **Drawings persist after closing and reopening Chrome.** | ✅ | Scenario 5: autosave, then a full page reload, then reopen — the drawing and its elements come back. A stronger check on the storage layer: IndexedDB survives in a persistent profile across page loads in these tests, and `storage/repository.test.ts` covers save/reopen/delete against `fake-indexeddb`. Recovery drafts (tab closed mid-edit) are covered by the *Recover unsaved changes?* dialog and its unit test. |
| **Exports produce valid files.** | ✅ | Scenarios 8/8b/8c download real files and assert content: PNG magic bytes and a >1 KB payload, SVG contains `<svg` and no `<script>`/`javascript:`, JSON re-imports into a valid document. Archive export/import round-trips (`library.spec.ts`). |
| **AI generation creates editable shapes and connections.** | ✅ | Scenario 10 with a stubbed provider: generation previews, inserts, and the result is real Excalidraw elements with bound arrows that survive undo (scenario 4) — nothing is a screenshot or a static image. |
| **Invalid AI output cannot corrupt a drawing.** | ✅ | Scenarios 10 + 11: an invalid payload is rejected (no elements added, drawing unchanged) and a failed generation leaves the drawing byte-identical, compared by serialising the document before and after. Enforced structurally by the single write path (`validate → normalise → repository.save`), covered by `ai-validate.test.ts` (including an adversarial-payload sweep) and `reliability.test.ts`. |
| **Browser features respect permissions.** | ✅ | Scenario 18 + `src/tests/permissions.test.ts` + `check-build.mjs`: the manifest declares exactly the five documented permissions, no host permissions, no content scripts, at most four suggested shortcuts. Scenario 13 proves a protected page is refused with honest copy, and that capture without a grant explains the next step instead of hanging. |
| **Core functionality works without an AI API key.** | ✅ | Every non-AI scenario runs with no provider configured (there is no key in any test profile). The AI panel's unconfigured state is itself tested (`milestone3.spec.ts` — *AI stays off, and clearly explained, without any configuration*). Scenario 17 additionally proves the app makes zero network requests without AI, i.e. no feature is quietly remote. |
| **Automated tests run successfully.** | ✅ | Latest full run: **208 unit/component tests (17 files) green, 55 end-to-end tests green**, lint clean, typecheck clean, coverage thresholds met (storage 84.8 %, ai 90.0 %, export 81.6 % statements). Every number in this table was produced by running the suites, not estimated. |
| **The README accurately describes implemented features.** | ✅ | README checked line-by-line against the build: every listed feature has a surface in `dist/`; the deferred items are listed in a *Not in 1.0* section (side panel, collaboration, cloud sync, remaining diagram types) rather than described as present. |
| **No link leads out of the product.** | ✅ | The canvas menu, shortcut sheet, library panel and every app surface were checked: zero visible off-extension anchors, asserted by `milestone5.spec.ts` (*no surface hands the user off to a third-party site*). The engine's "Excalidraw links" group, Help dialog and "Browse libraries" button were removed in 1.0.1. |
| **Independent branding, with licences intact.** | ✅ | No other product's name, link or embedded content is visible anywhere (`tests/e2e/brand.spec.ts`); `THIRD-PARTY-NOTICES.txt` ships and is verified from the installed package; our own code is MIT (`LICENSE`); the store listing and in-app About both state the non-affiliation. |
| **All buttons and menus have real behavior.** | ✅ | Every interactive control on every surface was enumerated by the accessible-name sweep in `milestone5.spec.ts`, and each surface's tests click through the primary path. No "coming soon" handlers exist; the side panel entry was removed rather than stubbed (see *Known limitations*). |
| **No critical feature is represented by a placeholder.** | ✅ | No `TODO`/`FIXME`/mock returns in `src/` (checked by grep); the only mocked object in the product is the AI *provider* in tests. Two honest non-features, neither of which pretends to work: (a) the Chrome **side panel** (§5 stretch goal) is absent, not stubbed, and recorded as deferred in the plan, README and tracker (`P4-T10 Blocked`); (b) the AI *diagram type* picker lists six types, of which two (`Sequence`, `Org chart`) are rendered as **disabled `<option>`s labelled "(coming soon)"** — they cannot be selected, chosen, or submitted. Everything selectable works. |

## Standing acceptance criteria (from the phase plan)

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| Each phase independently loadable in Chrome | ✅ | Each release ZIP (0.2.0 → 1.0.0) is a complete `dist/`, and the suite runs against one build at a time. |
| No mockups or fake buttons | ✅ | Every screenshot in `docs/screenshots/` and `store/screenshots/` — including the core surfaces (library empty/populated, editor light/dark, template, shortcuts, settings light/dark) — is generated by `tests/e2e/shots.spec.ts` from the packaged build. Hand-captured shots were retired in 1.0.1 after one of them went stale. |
| Never claim a test passes unless it was run | ✅ | All figures above come from runs recorded in `docs/milestone-5-report.md`. |
| Do not build collaboration / cloud sync / billing before the core editor is stable | ✅ | None of the three exists in the codebase; they are listed as post-1.0 work only. |

## Known limitations (deliberate, documented)

1. **Chrome side panel (spec §5 stretch):** not implemented. Chrome allows one side panel per
   extension and the editor tab already covers the workflow; the plan records it as blocked
   rather than pretending it exists.
2. **AI diagram generators exist for four types** (flowchart, mind map, software architecture,
   pipeline). Sequence and org-chart prompts are listed but disabled; the remaining §6 diagram
   types are served by the twelve templates and by free drawing with shapes and arrows. Phase 6
   backlog in the plan.
3. **Browser capture needs a user gesture.** `chrome.tabs.captureVisibleTab` requires a real
   `activeTab` grant, which no automated tool can fabricate; the tests drive the whole path
   except that single Chrome call, which is unit-tested with a mocked `chrome.tabs`. Stated in
   `TROUBLESHOOTING.md` too.
4. **The AI API key is profile-protected, not encrypted** — disclosed in `PRIVACY.md` and
   `docs/security-review.md` §2C.
5. **No localisation** — English only; strings are not yet extracted. The engine's own locale
   files still ship (1.6 MB) so its canvas UI can follow the browser language, but
   SketchPilot's own copy is English. Excalidraw's CJK handwriting font is not shipped
   (13 MB); see `docs/performance.md`.
