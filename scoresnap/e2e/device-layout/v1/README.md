# `device-layout/v1`

Reusable, repo-agnostic contract for the cross-device usability + visual layout gate
(AUG-1373 / AUG-1381). This package holds the **shared schema + checker contract**; each
product provides a thin **adapter** that normalizes its native view hierarchy into the
common element tree. Source of record:
`/workspace/aos-state/reports/2026-11-19-device-gate-t1547u/RECONCILED-PLAN.md` §B/§E/§F
(owner t1547u).

Pure JS, zero dependencies, runnable with `node --test` — it is deliberately free of any
repo/browser import so it can be promoted to a shared home and consumed by SnapScore
(RN/Expo) and Locker Room Defense (Godot) without divergence.

## What's here

| File | Role |
|------|------|
| `schema.mjs` | `device-layout/v1` config, receipt, waiver, and normalized element-tree schemas + a dependency-free structural `validate()` |
| `geometry.mjs` | Deterministic layer: rect helpers (mirroring `e2e/journeys/metrics.mjs`), overlap / tap-target / reachability checks → findings. Tolerances are the reconciled §B thresholds |
| `policy.mjs` | Cross-company reviewer rule, waiver validity, aggregate fail threshold, negative-fixture rubric-drift self-check |
| `adapters/rn-maestro.mjs` | Maestro `captureHierarchy` JSON → normalized element tree (SnapScore; parents' game AUG-1024 if RN) |
| `adapters/godot-control.mjs` | Godot `Control`-tree snapshot JSON → normalized element tree (LRD). Pure transform; **no** Godot execution |
| `example.config.json` | A validating SnapScore config as a worked reference |
| `device-layout-v1.test.mjs` | `node --test` coverage for all of the above |

## The normalized element tree

Every adapter emits nodes shaped `{id, role, text, bbox, hitRegion, scrollState, clip,
children}`. `bbox`/`hitRegion`/`clip` are logical-unit rects `{x,y,width,height}` in
**absolute** coordinates. `hitRegion` is `null` for non-interactive elements; the
geometry layer treats only nodes with a `hitRegion` as independent controls. The checker
and the vision step both consume this tree, so geometry rules are identical across RN and
Godot.

## The two enforcement layers

1. **Deterministic geometry** (`geometry.mjs`): overlap (rule 1, hit-region, >1pt),
   clipping/reachability (rule 2), tap targets + ≥8pt gaps (rule 5). Output is the same
   `{rule, severity, bbox, reason}` finding shape the vision step uses.
2. **Vision rubric** (`policy.mjs` consumes its receipts): cross-company Codex Astra/high
   for Claude-built products; never Grok. Each receipt carries `sourceSha`/`buildHash`/
   `artifactHash`/`reviewer`.

`evaluateGate()` aggregates both: it FAILS on any deterministic violation, any
critical/major visual finding, a missing checkpoint, an invalid/unavailable review, or a
`verdict:fail` receipt. Minor findings become non-blocking annotations. A structurally
valid, unexpired, independently-approved waiver (`waiverErrors()` clean) suppresses a
single matching finding; **missing-platform evidence can never be waived.**

Negative fixtures (`multi-day.png`, `team-mode.png`) run through the vision step first and
must each return ≥1 major finding (`rubricDriftErrors()`), or the gate fails itself.

## Adapter status

- **rn-maestro** — implemented; maps Maestro `bounds`/`resource-id`/`text`/`scrollable`.
- **godot-control** — implemented as a pure data transform; accumulates relative Control
  rects to absolute and honors `mouse_filter`/`visible`. **Acceptance** for LRD requires
  real rendered mobile-export touch journeys (§F); Xvfb/lavapipe desktop rendering is
  supplemental only. Launching Godot exports is the `lrd` lane's job, not this package's.
- **parents' game (AUG-1024)** — adapter deferred until the stack is inspected; do not
  assume RN. If RN it reuses `rn-maestro`; otherwise a new adapter emits the same tree.

## Follow-up slices (remaining AUG-1381 work)

This PR lands the shared schema + checker + both adapter normalizers + tests. Still open:
wiring the RN adapter into the live SnapScore Maestro capture, the Godot autoload that
produces the `Control`-tree snapshot (LRD lane), real mobile-export touch-journey
acceptance, and the AUG-1024 adapter after stack inspection.
