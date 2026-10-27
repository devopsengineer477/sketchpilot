# ADR-003 — AI diagrams: a graph from the model, geometry from us

Status: accepted (Milestone 3, v0.3.0)
Supersedes nothing. Related: ADR-001 (offline assets), ADR-002 (React 18.3 pin).

## Context

Two things had to be decided before a single line of AI code was written:

1. **How does the extension talk to a provider without asking for new permissions?**
2. **What exactly does the model produce, and who is allowed to decide where shapes go?**

Both answers shape the security posture of an extension that already claims "storage
only, no host permissions, no telemetry".

## Decision 1 — no host permissions; providers are called directly from the page

MV3 host permissions are broad, scary at install time, and hard to scope. Instead we
verified that the provider endpoints we target answer CORS preflights for an
extension origin:

```bash
curl -X OPTIONS https://api.openai.com/v1/chat/completions -H 'Origin: chrome-extension://x'
curl -X OPTIONS https://openrouter.ai/api/v1/chat/completions -H 'Origin: chrome-extension://x'
# → access-control-allow-origin: *
```

So the extension **stays on `["storage"]`**. The only network request SketchPilot ever
makes is the one the user explicitly triggers from the AI panel, straight to the
base URL they configured, with their key, in the tab they pressed the button in.

Consequences:

- `check-build.mjs` fails the build if `manifest.json` grows a host permission.
- The service worker never proxies model traffic — there is no background network
  surface, no request interception, nothing to audit outside the one adapter file.
- A provider that refuses CORS simply does not work, and the user gets an explicit
  message saying so rather than a silent hang. Nothing needs "fixing" in the manifest.

## Decision 2 — the model emits a graph; the extension owns every coordinate

The model returns **nodes, edges, labels and emphasis** — never x/y, never width, never
arrow points. `src/ai/layout.ts` turns that graph into geometry deterministically:

- `computeLayers` does a DFS to find back edges (a "retry" arrow must not push the
  diagram 20 columns right), then longest-path layering over the remaining DAG.
- `layeredLayout` (flowcharts, pipelines, architecture, org charts) and `radialLayout`
  (mind maps) place boxes on a fixed grid; `nodeWidthFor` sizes boxes from label length
  with a generous, deliberately pessimistic metric.
- `boundsOf`/`recentreSpec` fit and centre the result in the visible canvas.

Why this is non-negotiable:

- **Same answer, same picture.** Coordinates from a sampling model are not reproducible;
  a layout function is. A test asserts identical input → identical geometry.
- **No overlapping, off-grid, or inverted boxes.** Models cannot be trusted with pixel
  arithmetic, and we cannot debug a picture that only existed inside one completion.
- **Cheap repair.** If the graph is fixable (duplicate id, dangling edge), geometry is
  still computed from valid data — we never patch a half-drawn canvas.

`DiagramPlan` deliberately reuses the same `TemplateSpec` shape as the built-in
templates, so AI output flows through the *existing* `instantiate` path: real Excalidraw
elements, bound labels, edge-to-edge arrows, fully editable, and undoable as one step.

## Decision 3 — validate in layers, repair narrowly, preview before committing

```
raw model text
  → extractJson        (bare JSON / fenced / embedded; rejects __proto__ etc. via Object.hasOwn)
  → zod shape          (schemaVersion, types, string limits, node/edge caps)
  → repair             (sanitise ids + remap, dedupe, drop self-loops/dangling, truncate, cap)
  → meaning            (duplicate ids, dangling refs, isolated nodes, unreachable nodes)
  → layout             (layers, geometry, extents)
  → bounds check
```

Every stage returns `Result<_, AppError>` with a `message` **and** a `hint`, and none of
them throws — an adversarial corpus of hostile model replies asserts `not.toThrow`.

Repair is deliberately unimaginative: it drops, clamps, dedupes or renames, and reports
each change as a `RepairAction` shown to the user ("3 automatic fixes applied"). It never
invents a node, never guesses an edge, never rewrites a label.

Then the approval gate: a validated plan is rendered into a **preview state**, never
straight onto the canvas. `Insert` appends, `Replace canvas` asks for confirmation and
says how many elements will be deleted, `Discard` throws it away. A failed generation
leaves the saved document byte-identical — asserted in the e2e suite.

## Decision 4 — one provider adapter, honest credentials

`src/ai/providers/openaiCompatible.ts` serves OpenAI, OpenRouter and any local
OpenAI-compatible server; OpenRouter just gets its extra attribution headers. 90 s
timeout, 2 retries on 429/5xx only (never on 401 — a bad key is not a transient error),
abort support for the Cancel button, and keys redacted from every error path.

The key lives in `chrome.storage.local` under `sketchpilot.ai`, is shown masked, can be
removed in one click, and is sent **only** to the endpoint the user chose. The usage log
records kind/model/tokens/duration — never prompt or diagram content. The settings UI
says all of this in plain words instead of hiding it in a README.

## Alternatives rejected

- **Proxy the request through a background service worker.** Needs host permissions and
  invents a network surface the user cannot see. Rejected.
- **Let the model return Excalidraw elements or coordinates.** Unverifiable geometry,
  non-reproducible, and a prompt-injection path straight to the canvas. Rejected.
- **Auto-insert generated diagrams.** Fast, and wrong: it makes a plausible-looking
  mistake expensive. The preview gate is one extra click. Rejected.
- **A vendor SDK per provider.** Three implementations, three key-handling paths, none
  auditable. One adapter plus a configurable base URL covers the same ground. Rejected.
