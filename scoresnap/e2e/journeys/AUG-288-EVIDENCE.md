# AUG-288 phase 1 evidence: real-journey runner with tap/reachability budgets

Checked against origin/main 04daec1c852126b9025586ddb895206ec32b6cd3 (2026-11-18, claude-mac lane).

Phase 1 is already on main: `runner.mjs`, `adapter.mjs`, `journeys.json` (activation/scroll/entry-depth budgets,
reachability, glyph-paint proof), `negative-proof.mjs`, `nightly.sh`, CI registration. This note records a fresh
run of the node-only unit suites; no runner code changed in this PR.

From `scoresnap/`, `node --test e2e/journeys/<suite>.test.mjs`:

| suite | tests | pass | fail |
|---|---|---|---|
| metrics | 36 | 36 | 0 |
| reach-report | 3 | 3 | 0 |
| text-fragments | 5 | 5 | 0 |
| settlement-row-contract | 1 | 1 | 0 |
| game-rules | 3 | 3 | 0 |
| offline-containment | 1 | 1 | 0 |
| paywall-recovery | 5 | 5 | 0 |
| probe-target | 3 | 3 | 0 |
| ci-registration | 4 | 4 | 0 |

Not run here: the Chromium-backed `runner.mjs`, `negative-proof.mjs` and `*.browser.test.mjs` (need an offline web
export plus a browser; the box nightly and CI web-smoke own those).

Open items are unchanged: require web-smoke on main (needs Augie); nightly schedule not installed.
The shared checkout has uncommitted journey edits (adapter.mjs, journeys.json, GROWTH.md) from another session; they
were deliberately not included.
