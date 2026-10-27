# Performance budgets and measurements (P5-T10 / P5-T11)

Run `npm run perf` after `npm run build`. It drives the *packaged extension* in
Playwright, measures in-page with `performance.now()`, prints the table below, and fails
if a budget is exceeded. A regression therefore breaks CI, not just the docs.

## How each number is taken

| Measurement | Method |
| --- | --- |
| Popup interactive | `goto` with `waitUntil: 'commit'`, then an in-page loop of `requestAnimationFrame` until the first frame after `<main>` exists and has text. Includes navigation, script parse, React mount and first paint. |
| Dashboard list | Same method on `dashboard.html` after seeding 40 drawings (document *and* metadata records) directly into IndexedDB, so the list is genuinely populated. |
| Editor interactive | Same method on `editor.html?id=…` for a 200-element scene imported through the real import path. The stop condition is the engine's `<canvas>`, i.e. the point where the user could start drawing. |
| Frame intervals | A `requestAnimationFrame` sampler runs in the page while the pointer pans a 200-element scene (40 pointer moves), then p95 and the count are reported. p95 is used because a single GC pause says nothing about steady state. |
| Bundles | File sizes in `dist/assets`; popup and editor chunks are summed separately to prove the popup does not pull in the canvas engine. |

## Results — v1.1.2 build, headless Chromium 141, 2 vCPU container, 2 GB RAM

```
Popup: navigation start → interactive                  90.3 ms   (budget 300 ms)   ✓
Popup: DOMContentLoaded                                57.4 ms
Popup: load event                                      58.6 ms
Dashboard: navigation start → 40-item list painted    121.0 ms   (budget 800 ms)   ✓
Editor: 200-element scene → interactive               296.9 ms   (budget 1500 ms)  ✓
Editor: p95 frame interval while panning (200 els)     16.7 ms   (budget 50 ms)     ✓
Editor: frames sampled                                 84
Bundle: popup JS                                        4.9 KB  (budget 300 KB)   ✓
Bundle: editor JS                                    1168.9 KB  (budget 6000 KB)  ✓
Package: fonts (self-hosted)                            0.4 MB  (budget 3 MB)     ✓
Package: dist total (unzipped)                          5.1 MB  (budget 10 MB)    ✓
```

Run-to-run variation on this container is large and worth stating honestly: the *same* build
measured the popup at 90–156 ms and the 200-element editor at 297–341 ms across runs (the
machine is shared, so a co-tenant's load shows up in the numbers). The frame interval is the
stable figure — 16.7 ms, i.e. a locked 60 fps — and a real regression is a jump of a different
order (a doubled bundle, or an editor that takes seconds to become interactive).

Reading the numbers honestly:

- **16.7 ms p95 is a clean 60 fps.** The container is *slower* than a mid-range laptop, so
  these are conservative figures rather than optimistic ones.
- **The package shrank from 6.7 MB to 5.1 MB in 1.1.2.** The engine asset folder used to
  include the engine package's `locales/` folder (1.7 MB, 55 files) — files nothing ever fetched,
  because the engine's locale JSON is statically imported and Rollup emits it as lazy chunks in
  `assets/`. Only the self-hosted **fonts** need to be on disk; they now live in `assets/fonts/`
  alongside the chunks, so the package has a single asset folder (0.4 MB).
- **The popup is 4.9 KB of JavaScript.** It never imports the canvas engine; that is the
  code split P5-T11 asked for, and the budget test asserts it rather than trusting it.
- **The editor chunk is ~1.2 MB** — that is Excalidraw plus our editor code, uncompressed.
  It is loaded once per editor tab and served from disk inside the extension, so there is
  no network component to the number.
- **The package is 5.1 MB unzipped (2.2 MB zipped).** The fonts (0.4 MB) are bundled rather than
  fetched, which is what makes the offline guarantee in scenario 17 true. The package used to be 20 MB because Excalidraw's CJK handwriting face
  (`Xiaolai`) ships as ~200 unicode-range subsets totalling 13 MB; it is excluded for 1.0
  (English-only release) and can be re-enabled with one line in `vite.config.ts` —
  see `SKIPPED_FONT_FAMILIES`.

## Budgets and where they came from

| Budget | Value | Why |
| --- | --- | --- |
| Popup interactive | 300 ms | Plan P5-T10. A toolbar popup that takes longer than a blink feels broken. |
| Editor interactive | 1500 ms | Plan P5-T10, for a *mid* laptop; a 200-element scene at 306 ms here leaves large headroom on real hardware. |
| p95 frame interval | 50 ms | Worse than 20 fps for a fifth of frames would be visible jank while panning. |
| Popup JS | 300 KB | Anything much beyond this means the engine leaked into the popup. |
| Editor JS | 6 MB | Generous cap on the engine chunk; it exists to catch accidental duplication. |
| Package fonts | 3 MB | A ceiling on self-hosted font weight; crossing it usually means a font family was added back by accident. |
| `dist` total | 10 MB | Chrome Web Store review dislikes very large packages and the install is copy-on-load. |

## Not measured here (and why)

- **First install / cold cache**: dominated by Chrome copying the unpacked directory, not by
  our code; it is not something the extension can influence.
- **Real-GPU rasterisation**: headless Chromium here uses SwiftShader. The frame budget is a
  jank *ceiling*, not a GPU benchmark.
- **AI generation latency**: that is the provider's time, reported to the user in the UI
  ("Testing…", "Generating…") and deliberately excluded from our budgets.
