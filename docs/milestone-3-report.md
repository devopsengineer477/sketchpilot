# Milestone 3 delivery report — v0.3.0

Date: 2026-10-27 · Scope: spec §5 (AI), §6 (prompting), §7 (refine), §9 (provider settings),
§10 (validation), §14 (tests 9–11), §15 (docs).

## What shipped

AI that drafts, and *never* commits on its own.

| Area | Result |
| --- | --- |
| Generate | Prompt + type + detail → validated plan → preview → Insert / Replace (confirmed) / Discard |
| Refine | 7 diagram intents on the whole drawing or the selection; 3 read-only text intents (explain, document, Mermaid) |
| Providers | OpenAI, OpenRouter, any OpenAI-compatible base URL (local models included) through one adapter |
| Validation | Layered pipeline: extract → zod → repair → meaning → layout → bounds; every stage returns `message` + `hint`, never throws |
| Layout | Deterministic graph→geometry (`layered` + `radial`), cycle-safe layering, fit-and-centre into the visible canvas |
| Credentials | Key in `chrome.storage.local`, masked, removable in one click, disclosed in the UI, content-free usage log |
| Safety gate | Nothing touches the canvas before the user approves; a failed reply leaves the saved document byte-identical |
| Entry points | Editor top bar **AI** button, and the popup's "Generate diagram with AI" (opens a drawing with the panel ready) |

Permissions are unchanged: `["storage"]`. No host permissions, no background network,
no telemetry.

See `docs/adr-003-ai-provider-and-layout.md` for the four decisions behind this
(graph-not-coordinates, direct provider calls over CORS, layered validation, one adapter).

## Commands run (all green)

```
npx tsc --noEmit                     → clean
npx vitest run                       → 103 passed / 8 files
npx vite build                       → ✓ built
npm run check:build                  → all checks passed
npx playwright test                  → 30 passed (29 specs + the docs screenshot capture)
```

Milestone 2 baseline was 21 e2e specs; M3 adds 8 (7 AI workflow specs + the popup entry),
plus a docs screenshot capture spec that is deliberately part of the run so the images in
`docs/screenshots/` cannot drift from the shipped build.

## Test coverage added this milestone

**Unit (49 new tests, 54 → 103)**

| File | Tests | Covers |
| --- | --- | --- |
| `src/tests/ai-validate.test.ts` | 33 | JSON extraction (bare/fenced/embedded), prototype-pollution rejection, zod limits, repair actions, cycle-safe layering, determinism, layout bounds, and an adversarial corpus: injection strings treated as data, RTL/emoji/zero-width labels, cut-off JSON, 150-element truncation, 10 000-element rejection, `not.toThrow` |
| `src/tests/ai-provider.test.ts` | 16 | Bearer header/URL, no key leakage in errors, 401 does not retry, 429 does, abort/cancel, empty completion rejected, end-to-end plan/refine/text-intent paths, credential masking, `isConfigured`, `toProviderConfig` |

**End-to-end (7 new specs)** — all run against a Playwright-routed provider endpoint, so
the real HTTP → validation → layout → canvas path is exercised with no network and no key:

1. AI settings configured, tested and removed; key never echoed back in full; `chrome.storage.local` inspected directly.
2. Valid reply → preview → insert → shapes/labels/arrows land in the saved document → **one undo restores** the previous state.
3. Prose reply (no JSON) → visible error + "Your drawing was not changed", and the saved document is **byte-identical** before and after.
4. Structurally broken payload (duplicate ids, dangling edge) → rejected cleanly, zero elements written.
5. "Explain this diagram" → text result shown, canvas untouched.
6. Unconfigured panel → "AI is not configured" + working "Open AI settings", while drawing still works.
7. "Replace canvas" → confirmation dialog naming the element count; cancel changes nothing, confirm swaps the canvas.
8. Popup AI entry → opens a drawing with the assistant open and gated.

## Bugs found and fixed during M3

| Bug | Cause | Fix |
| --- | --- | --- |
| Every valid model reply was rejected as "prototype pollution" | `'__proto__' in obj` is `true` for **any** object | Guard with `Object.hasOwn` instead of `in` |
| A 7-node diagram laid out to 23 columns | Longest-path relaxation diverged on a cycle ("retry" edge) | DFS back-edge detection first, then longest-path over the DAG remainder; back edges still drawn |
| Canvas collapsed to 5 px tall when the AI panel opened | Panel mounted as a sibling of the canvas inside a column flex container | Canvas + panel now share a row container with `min-w-0`/`min-h-0` |
| Inserted diagram landed off-screen / half outside the viewport | Centring used `window.innerWidth` instead of the canvas itself | Centre and fit against the canvas host rect; zoom only ever reduces, never magnifies past 100% |
| Labels spilled out of their boxes | Text measured before the hand-drawn webfont loads, so metrics were too narrow | Deliberately pessimistic per-character estimate + padding, with height derived from the line count |

## Known limitations

- Sequence and org-chart diagram types are listed but disabled ("coming soon"); the
  layered layout handles flowcharts, pipelines, architecture and mind maps.
- The model chooses the graph, SketchPilot chooses the geometry: correctness is
  guaranteed, prettiness is not. Dense fan-out diagrams are plain but never broken.
- Complex diagrams are inserted fitted to the viewport, so they may appear at < 100 %
  zoom; zoom is one gesture away.
- Refine actions restructure content, not styling (colours, fonts, themes).
- **Refine is whole-plan, not a per-item diff.** The tracker's P3-T18 planned per-hunk
  approval; what shipped is a full-plan preview you accept or discard. It is safe (no
  change lands without approval) but coarser, so it is marked *In progress* in the
  tracker rather than Done.
- **No provider model picker.** P3-T8's model-list fetch is not implemented: model is a
  free-text field, and OpenRouter works through the same adapter with its attribution
  headers. Also marked *In progress*.
- No conversation memory: each refine is a fresh request carrying a summary of the
  current diagram, not a chat transcript.
- A provider that refuses CORS cannot be used; the error says exactly that.

## Next: Milestone 4

Per spec §16 the next phase is capture (web page / selected text → drawing) built on this
same pipeline: validated input → plan → preview → approval.
