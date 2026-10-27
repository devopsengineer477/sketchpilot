# Milestone 5 — Production readiness (v1.0.0)

**Status:** complete. **Release artefact:** `release/sketchpilot-1.1.0.zip` (2.7 MB, 188 files).
**Date:** 27 October 2026.

Phase 5 was not about adding features — 0.4.0 already did what the specification asks for. It
was about making every claim checkable: the §14 matrix made into data, accessibility made
observable, performance budgets given numbers, security written down against a threat model,
and the whole thing packaged for the Web Store with documentation that matches the build.

## What was verified, and how

| Area | Result |
| --- | --- |
| Lint (ESLint 9, new flat config) | clean — 0 errors, 0 warnings |
| Type check (`tsc --noEmit`, strict) | clean |
| Unit + component tests | **204 passed / 16 files** |
| Coverage (`src/storage`, `src/ai`, `src/export`) | **84.8 % / 90.0 % / 81.2 %** statements (thresholds 80 % enforced) |
| Production build + release guard | `✔ build checks passed` |
| End-to-end (packaged `dist/` in real Chromium) | **53 passed**, ~3.8 min |
| Performance budgets | all met — see `docs/performance.md` |
| Release ZIP re-loaded unpacked | popup renders, manifest reports 1.0.0, **0 external requests** |

Nothing in this report is an estimate. The end-to-end figure comes from a full
`npx playwright test` run against the build that produced the ZIP.

## Work delivered

### Test depth (P5-T1…T5)

- **The §14 matrix is now data.** `src/tests/scenario-map.ts` names the exact test for each of
  the eighteen scenarios — no "covered by manual QA" anywhere. `npm run docs:matrix` renders
  `docs/test-matrix.md` from it, and `src/tests/test-matrix.test.ts` fails if a referenced test
  is renamed or deleted, or if the committed doc drifts from the map. Two rows had no honest
  home before this phase (15, 17); both now point at real tests written for them.
- **Reliability suite** (`reliability.test.ts`, 8 tests): ten debounce cycles without losing or
  duplicating a write, a burst that must force a write past `maxWait`, overlapping slow writes,
  a 400-step undo/redo fuzz over the save path, failed-save recovery reported exactly once, a
  200-element round-trip, and a 60 000-element file that must be *rejected* rather than
  truncated.
- **Coverage with teeth.** Thresholds live in `vitest.config.ts`. `export/` started at 62 %
  because `render.ts` (the rasteriser wrapper) was never unit-tested; new `export-render.test.ts`
  took it to 100 %, which is how the PNG bug below was found.
- **CI**: `.github/workflows/ci.yml` runs install → lint → typecheck → coverage → matrix sync →
  build → Playwright, then uploads the `dist/` it tested as the release artefact.
- **Flake policy** in `TROUBLESHOOTING.md`: profiles out of `/tmp`, `waitForSurface()` instead of
  racing `waitForEvent('page')`, `exact: true` where a name collides, fake timers for every
  debounce test.

### Accessibility (P5-T6…T9)

- **Contrast**: audited both themes numerically. Exactly one pair failed AA — the muted text
  colour on the light panel (4.41:1). `ink-500` darkened to `#616e84` → 4.81:1. All 19 real
  foreground/background pairs are now asserted in `a11y-contrast.test.ts`, including a check of
  the ratio maths itself, so a future palette edit cannot silently regress.
- **Focus trap**: `Dialog` now keeps Tab and Shift+Tab inside the panel, moves focus in on open,
  returns it to the opening control on close, and stops Escape from reaching the canvas. Two
  end-to-end tests press Tab twenty times and Shift+Tab eight times and assert focus never
  leaves; a third asserts focus is restored to the delete button that opened the dialog.
- **Live regions**: the save badge is `role="status" aria-live="polite"` in all four states, and
  the AI panel announces *generating / preview ready / generation failed* through an `sr-only`
  status region.
- **Reduced motion** honoured on every surface and verified by computed style, not by eye.
- **Accessible names**: a sweep of every visible control on popup, dashboard and editor finds
  zero unnamed controls (the engine's own chrome is excluded and stated as such).
- **Copy audit**: every error still goes through `appError(code, message, hint)` — what happened,
  what it means, what to do next.

### Performance & security (P5-T10…T14)

- **`npm run perf`** measures the packaged extension and fails on regression:
  popup interactive **118 ms** (budget 300), dashboard with 40 drawings **87 ms** (budget 800),
  200-element editor **331 ms** (budget 1500), p95 frame interval while panning **16.7 ms**
  (budget 50), popup JS **4.9 KB**, editor chunk **1.17 MB**, package **6.6 MB** (budget 10).
  Numbers and method in `docs/performance.md`.
- **Code splitting verified, not assumed** — the bundle test asserts the popup and dashboard
  entries carry no engine code, and `check-build.mjs` independently fails the build if they grow
  past 250 kB or mention the engine.
- **Security review** (`docs/security-review.md`): 13-point checklist with evidence per line, an
  explicit CSP in the manifest (`script-src 'self'; object-src 'none'`), and a threat model
  written from three attacker positions — a malicious drawing file, a compromised provider, and
  someone else at your machine — each with the structural defence and the residual risk.
- **Permission parity** is enforced from both sides: `check-build.mjs` parses
  `PERMISSIONS.md` and fails on drift; `permissions.test.ts` and `test-matrix.test.ts` assert the
  same from the source side. Store-facing justification text is written word-for-word.

### Docs & release (P5-T15…T19)

- `PRIVACY.md` (what is stored, what can leave, and the honest limits of profile-protected key
  storage), `CHANGELOG.md` (1.0.0 plus the three earlier releases), `docs/store-listing.md`
  (description, data-use answers, reviewer notes, screenshot list),
  `store/screenshots/*.png` (5 × 1280×800 from the real build) and
  `store/promo-tile-440x280.png`.
- README rewritten against the build: verified install steps (`npm ci --legacy-peer-deps` is
  now stated, with the reason), the real script list, a documentation map, and a *known
  limitations* section that says what is missing instead of implying it exists.
- `TROUBLESHOOTING.md` gained a tests/CI/release section covering the failures we actually hit
  (ERESOLVE, `/tmp` exhaustion, tab races, dialog scroll, coverage thresholds).
- `docs/definition-of-done.md` audits §17 line by line with evidence and lists five deliberate
  limitations.
- **Release rehearsal**: clean install → lint → typecheck → 199 unit tests → build + guard → 48
  Playwright specs → ZIP → ZIP unzipped into a fresh directory, loaded unpacked in Chromium,
  popup rendered, `chrome.runtime.getManifest()` reports 1.0.0, zero external requests.

## Bugs found and fixed during Phase 5

1. **PNG export could exceed its own 40-megapixel budget.** The scale floor (`Math.max(1, …)`)
   clamped the safety factor back up, so a 20 000 px-wide scene would have exported at 400 MP —
   precisely the "200 MB PNG" the guard exists to prevent. The budget now wins, and dimensions
   are floored so rounding cannot slip past it. Found by writing the missing `render.ts` tests.
2. **`ink-500` was 4.41:1 on the light panel background** — below WCAG AA, invisible to anyone
   not measuring. Fixed by darkening one token; now guarded by 19 assertions.
3. **Tab escaped dialogs into the canvas.** The canvas owns keyboard input, so a keyboard user
   could tab out of a modal into the drawing behind it. Fixed with a real focus trap.
4. **The AI "Replace canvas" confirmation read scene elements during render**, a React
   anti-pattern (and a lint error once the rule set existed). The count is now captured when the
   dialog opens.
5. **A non-hook named `useTemplate`**, two dead assignments in the capture path: found by the new
   lint pass, fixed rather than suppressed (one suppression is documented in place).
6. **The package was 20 MB, 13 MB of it one unused CJK handwriting font.** Trimmed to 6.6 MB
   (2.7 MB zipped); re-enabling it is one line in `vite.config.ts`.
7. **A fresh `npm install` failed with `ERESOLVE`** (reported from a real Windows clone): the
   lint toolchain I added pinned `@eslint/js@10`, whose peer is `eslint@10`, next to
   `eslint@9`. Both are now on 9.x, the repo ships `.npmrc` with `legacy-peer-deps=true` so a
   plain `npm install` / `npm ci` works with no flags on any OS, and
   `src/tests/toolchain.test.ts` asserts the majors stay aligned (plus the coverage provider
   and the React pin).

8. **The extension shipped links to somebody else's product.** The engine's default menu ended
   with a group titled "Excalidraw links" (GitHub, X, Discord, excalidraw.com), its Help dialog
   was four links to excalidraw.com's docs/blog/GitHub/YouTube, and the library panel opened
   libraries.excalidraw.com with a referrer token containing our extension ID. All three are
   removed — the menu is now SketchPilot's own (canvas background, clear canvas, Keyboard
   shortcuts → our sheet) — and a new end-to-end test fails if any of it comes back.

## What was deliberately not done

- Chrome **side panel**: still absent, not stubbed (`P4-T10 Blocked`).
- **Sequence / org-chart AI generators**: listed as disabled options in the type picker, labelled
  "(coming soon)". Everything selectable works.
- **Spanish/German/… UI**, cloud sync, collaboration, billing: out of scope until after 1.0
  (§16), and none of it is referenced in the UI.

## Exit gate

- [x] All 18 §14 scenarios automated and green; CI configured from a clean clone
      (verified: `rm -rf node_modules && npm ci` then 204 unit tests + 53 e2e green).
- [x] Accessibility and keyboard pass complete with fixes applied.
- [x] Performance budgets met with numbers recorded.
- [x] Security checklist signed off; permissions minimal and documented.
- [x] Store-ready package + listing assets + privacy policy.
- [x] README/DoD statements verifiably match the build.
