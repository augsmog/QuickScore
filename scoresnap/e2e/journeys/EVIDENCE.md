# Phase 1 local evidence — 2026-10-31 PT

Application: `bce5673993b90720657af6a400a385c27cdf574c`, sharing-on offline web, Chromium 390×844, fresh contexts, external requests blocked and service workers disabled. App files, dependencies/lockfile, GS-13/GS-16 and native gates are unchanged.

Commands run from `scoresnap/`:

```text
node --test e2e/journeys/metrics.test.mjs
ℹ tests 31
ℹ pass 31
ℹ fail 0
ℹ skipped 0

node --test e2e/usability-gate.test.mjs
ℹ tests 9
ℹ pass 9
ℹ fail 0
ℹ skipped 0

BASE_URL=http://127.0.0.1:8192 OUT_DIR=/tmp/jr node e2e/journeys/runner.mjs
PASSED J-home-create-cancel: activations=2, screens=2, taskMs=348
PASSED J-home-join-code-error: activations=3, screens=2, taskMs=439
PASSED J-round-score-settle-reload: activations=5, screens=3, taskMs=841
PASSED J-invite-from-round: activations=1, screens=1, taskMs=146
EXPECTED_FAILURE J-finalize-settle: activations=1, screens=1, taskMs=1597
Journey gate PASSED: 5/5; elapsed 8701 ms; coverage gaps 13

BASE_URL=http://127.0.0.1:8192 OUT_DIR=/tmp/jr-negative-final node e2e/journeys/negative-proof.mjs
PASS hide: runner RED (exit 1, control-hidden)
PASS rename: runner RED (exit 1, accessible-name-mismatch)
PASS disable: runner RED (exit 1, control-disabled)

bash -n e2e/journeys/nightly.sh
(exit 0, no output)

RUN_ROOT=/tmp/tp-nightly bash e2e/journeys/nightly.sh
Nightly exit 0; summary: /tmp/tp-nightly/2026-11-01/summary.md
```

Final nightly artifacts: `/tmp/tp-nightly/2026-11-01/021131-128073/`. Main SHA: `bce5673993b90720657af6a400a385c27cdf574c`. Five of five executable journeys accepted (four passed, one strict expected failure); all three mutations proved red. Nightly runner wall time: 8420 ms. UTC run date is Nov 1; local verification date is Oct 31 PT. Server exited through the cleanup trap.

The PR runner wall time is below the 180-second limit. Local output occupies under 1 MiB including earlier failed screenshots; CI shares the existing artifact upload. Actual GitHub artifact upload duration is not yet measured. No retries are configured.

A failed development nightly at `/tmp/tp-nightly/2026-11-01/020949-106416/` is preserved: it exposed an immediate URL assertion racing navigation. The adapter now waits for the destination URL; the final run uses that change. An intervening harness snapshot run at `021043-113330` had runner success and a negative-proof signature mismatch while the rename signature was being tightened; the final snapshot has matching signatures and passes both checks. These development failures are not hidden by retry-to-green logic; the runner has one attempt per journey.

Coverage: 13 manifest journeys, five executable and eight deferred. AUG-289 is a strict missing-confirmation expected failure. Five feature-level AUG-306 missing-semantics exceptions retain full geometry/action/outcome gates, including the AUG-290 invite finding. Full-18 input (AUG-291), deletion (AUG-292), double-paywall recovery (AUG-293), multiday creation, successful code join, guest joining, true crash recovery and rules discovery remain explicit gaps. Timing has one baseline sample per executable journey and is record-only; activation baselines are frozen with source metadata.

Merge enforcement audit: `gh api repos/augsmog/QuickScore/branches/main/protection` returned HTTP 404, "Branch not protected"; `gh api repos/augsmog/QuickScore/rulesets` returned `[]`. The added web-smoke step fails on any red, but repository settings currently do not require its check for merging. That is an outstanding AUG-288 rollout gap, not a claimed verifier pass. No settings were changed, no schedule installed, and no live backend writes occurred.
