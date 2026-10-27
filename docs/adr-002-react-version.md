# ADR-002 — React 18.3 for the first release

**Status:** Accepted · **Date:** 2026-10-27

## Context

`@excalidraw/excalidraw@0.18.x` declares React `^17 || ^18 || ^19`, but its
dependency tree includes `@radix-ui/react-tabs@1.0.2`, whose peer range stops at 18.
Installing with React 19 produces `ERESOLVE` peer warnings and, in practice, a
nested duplicate Radix tree.

## Decision

Pin React and React DOM to `18.3.1`, and keep `npm install` behaviour strict rather
than papering over resolution with `overrides`.

## Consequences

- No peer warnings from the engine's transitive dependencies.
- We do not get React 19 features (actions, `use()`, the compiler). Nothing in this
  product needs them; the app is a single-page editor with a small state surface.
- Upgrading later is a scoped task: bump React, add a scoped Radix override, and
  re-run the full suite — the engine's own release notes track the fix upstream.
