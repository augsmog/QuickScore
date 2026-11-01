# Fix round 1 evidence — 2026-10-31 PT

PR #84, branch `testprog/snapscore-journeys-20261031`. This evidence supersedes the initial phase 1 local results. Application: `bce5673993b90720657af6a400a385c27cdf574c`, sharing-on offline web, Chromium 390×844, fresh contexts, external requests blocked and service workers disabled. App code, package files, lockfile, GS-13/GS-16 and native gates are unchanged. The four pre-existing `scoresnap/e2e/_*.mjs` scratch files remain untracked.

Retained logs, reports, screenshots and probe sources: `/workspace/aos-state/reports/test-program-20261031/fix-r1-evidence/`. Original verifier report: `/workspace/aos-state/reports/test-program-20261031/verify-r1.md`.

## Required checks

Commands run from `scoresnap/`:

```text
node --test e2e/journeys/metrics.test.mjs
ℹ tests 34
ℹ pass 34
ℹ fail 0
ℹ skipped 0

node --test e2e/usability-gate.test.mjs
ℹ tests 9
ℹ pass 9
ℹ fail 0
ℹ skipped 0

BASE_URL=http://127.0.0.1:8192 OUT_DIR=/tmp/tp-fix-r1/runner node e2e/journeys/runner.mjs
PASSED J-home-create-cancel: activations=2, screens=2, taskMs=406
PASSED J-home-join-code-error: activations=3, screens=2, taskMs=537
PASSED J-round-score-settle-reload: activations=5, screens=3, taskMs=828
PASSED J-invite-from-round: activations=1, screens=1, taskMs=154
EXPECTED_FAILURE J-finalize-settle: activations=1, screens=1, taskMs=1611
Journey gate PASSED: 5/5; elapsed 8930 ms; coverage gaps 13

BASE_URL=http://127.0.0.1:8192 OUT_DIR=/tmp/tp-fix-r1/negative node e2e/journeys/negative-proof.mjs
PASS hide: runner RED (exit 1, control-hidden)
PASS rename: runner RED (exit 1, accessible-name-mismatch)
PASS disable: runner RED (exit 1, control-disabled)
PASS hide-label: runner RED (exit 1, visible-text-missing)
PASS transparent-label: runner RED (exit 1, visible-text-missing)

bash -n e2e/journeys/nightly.sh
(exit 0, no output)

RUN_ROOT=/tmp/tp-nightly2 bash e2e/journeys/nightly.sh
Nightly exit 0; summary: /tmp/tp-nightly2/2026-10-31/summary.md
```

The server on 8192 was already available. Twenty successful required captures were produced, all 390×844. Each executable journey declares an independent `requiredSteps` inventory, checked against captures completed during that attempt. Deferred journeys declare an empty inventory until implemented. The three new unit tests cover missing captures despite passing outcome assertions, absent capture records and invalid inventories, and required captures during a strict expected failure. Diagnostic captures cannot substitute for required success-path captures.

## Verifier reproductions

Both supplied scripts were rerun unchanged:

```text
python3 /workspace/aos-state/reports/test-program-20261031/verify-r1-evidence/probes.py
python3 /workspace/aos-state/reports/test-program-20261031/verify-r1-evidence/extra-probes.py
(exit 0 for both probe drivers; individual runner exits below)
```

All 14 probes returned the expected exits. In particular, both previously-green visibility mutations are now red with the required visibility signature. The missing-capture follow-up is also red.

| Probe | Runner exit | Evidence |
| --- | --- | --- |
| invisible-core-text | 1 | `visible-text-missing`; nested opacity-zero label wrapper |
| transparent-core-text | 1 | `visible-text-missing`; original transparent-text mutation |
| missing-step-screenshots | 1 | missing step capture: create, edit, cancel-home |
| budget-minus-one | 1 | activation budget exceeded |
| known-signature-mismatch | 1 | unknown xfail assertion / signature mismatch |
| feature-signature-mismatch | 1 | reachability signature mismatch |
| missing-journey | 1 | adapter/manifest inventory mismatch |
| skipped-journey | 1 | non-executable journey status |
| missing-assertion | 1 | missing assertion: outcome |
| stale-known-issue | 1 | explicit renewal required |
| nine-time-samples | 0 | timing remains record-only |
| ten-time-samples | 1 | time baseline regression >50% |
| unrelated-xfail-error | 1 | xfail signature mismatch: unclassified |
| unexpected-xfail-pass | 1 | unexpected pass: remove marker |

`verifier-probe-results.json` and `verifier-probes/` retain JSON, logs and screenshots for these reruns. The supplied extra-probes script loads `/tmp/tp-review-evidence/probes.py`; that file was confirmed byte-identical to the supplied original before executing either script.

Additional targeted probes (`visibility-boundaries.py`, `.log`, and `visibility-boundaries/`) confirm combined label/control opacity 0.5×0.2 = 0.1 is red, while 0.5×0.22 = 0.11 passes; text alpha 0.1 is red while 0.11 passes; text matching its own or an inherited ancestor background is red. Each probe explicitly verifies that the original visible, enabled button still has the exact accessible name `New Contest`. All six results match their expected exits, and every red result has `visible-text-missing`.

## Nightly and CI budget

Nightly artifacts: `/tmp/tp-nightly2/2026-10-31/022611-292400/`, also retained under `fix-r1-evidence/nightly/`. Main SHA: `bce5673993b90720657af6a400a385c27cdf574c`. The harness is the worktree fix snapshot based on `f7703b32525add46067b958c08e225a0d90c9765` (the summary records that base HEAD); its copied manifest and every `.mjs` file were compared byte-for-byte with the tested worktree.

Nightly accepted 5/5 journeys (four passed, one strict expected failure), reported no red journeys, and proved all five mutations red. Runner elapsed: 8329 ms. The run directory is **2026-10-31 in America/Los_Angeles**, even though the UTC timestamp is Nov 1. `nightly.sh` now uses `TZ=America/Los_Angeles date +%F`. The cleanup trap closed port 8193 and released the fixed nightly flock.

Workflow YAML parses successfully. Structural checks confirm the journey step has `timeout-minutes: 2`, immediately followed by a dedicated `actions/upload-artifact@v4` step with `if: always()`, `timeout-minutes: 1`, and `retention-days: 7`. Its path is `scoresnap/e2e/journey-screens`; the shared artifact step only uploads `scoresnap/e2e/screens`. Journey checks plus their artifact upload allocate at most 180 seconds. No job, schedule or retry was added. Actual upload duration on the eventual pushed GitHub run is not claimed by these local measurements.

## Rollout gaps

**needs Augie: require web-smoke on main**

Verifier defect 2 (branch protection) is explicitly outside this fix round's scope. Repository settings require Augie's explicit yes; no settings changes were made. This round addresses the test harness and budget defects without claiming required merge-check enforcement or an overall phase 1 verifier pass. PR #84 remains draft; no PR comments were posted.

Existing coverage gaps remain explicit: AUG-289 finalize confirmation is a strict expected failure; five AUG-306 feature exceptions retain geometry, action and outcome gates. Eight journeys remain deferred (full-18 scoring, deletion, paywall recovery, multiday creation, successful code join, guest joining, process-crash recovery, and rules discovery). Timing baselines have one sample per executable journey and remain record-only; activation baselines are unchanged.

## Fix round 2 — core label visibility

Verifier round 2 identified text-node clipping and transparent `-webkit-text-fill-color` bypasses. The runner now clips each matched text Range rect through every ancestor from the text node to the root, requires at least half the original text area and a 4×4 px visible fragment, checks effective text fill against the composed background, and captures the intersected label rect for a luminance texture proof. PNG decoding and pixel analysis run in the test process without a browser round trip. Existing display, visibility and opacity-chain checks remain active. This pixel check runs only for core labels.

The copied verifier scripts and all outputs are retained in `/workspace/aos-state/reports/test-program-20261031/fix-r2-evidence/`; verifier evidence was not overwritten. The verifier's three r2 visibility probes all exited 1 with `visible-text-missing`: `label-overflow-clipped`, `label-clip-path`, `text-fill-transparent`. The copied r1 probe scripts also returned their expected results, including the nine-sample timing pass, ten-sample timing failure, and red missing-step/visibility proofs.

Required checks from `scoresnap/`:

```text
node --test e2e/journeys/metrics.test.mjs
ℹ tests 36
ℹ pass 36
ℹ fail 0

node --test e2e/usability-gate.test.mjs
ℹ tests 9
ℹ pass 9
ℹ fail 0

BASE_URL=http://127.0.0.1:8192 OUT_DIR=/tmp/tp-r2-runner node e2e/journeys/runner.mjs
PASSED J-home-create-cancel: activations=2, screens=2, taskMs=433
PASSED J-home-join-code-error: activations=3, screens=2, taskMs=513
PASSED J-round-score-settle-reload: activations=5, screens=3, taskMs=1051
PASSED J-invite-from-round: activations=1, screens=1, taskMs=179
EXPECTED_FAILURE J-finalize-settle: activations=1, screens=1, taskMs=1596
Journey gate PASSED: 5/5; elapsed 8816 ms

BASE_URL=http://127.0.0.1:8192 OUT_DIR=/tmp/tp-r2-negative node e2e/journeys/negative-proof.mjs
PASS hide, rename, disable, hide-label, transparent-label,
     label-overflow-clipped, label-clip-path, text-fill-transparent
All eight expected runner failures had exit 1 and their declared signatures.

RUN_ROOT=/tmp/tp-nightly-r2-nodepng bash e2e/journeys/nightly.sh
Nightly exit 0; summary: /tmp/tp-nightly-r2-nodepng/2026-10-31/summary.md
Main SHA: bce5673993b90720657af6a400a385c27cdf574c; harness source included the final fix-round-2 working tree.
```

The copied verifier r2 script at `fix-r2-evidence/visibility-probes.py` produced three `visible-text-missing` results (all runner exits 1). Copied verifier r1 probes were run from the same evidence directory; all 14 primary and follow-up probes matched the expected behavior. The first probe attempt caught and corrected a `page` binding error before final runs. `fix-r2-evidence/` is outside the repository at `/workspace/aos-state/reports/test-program-20261031/fix-r2-evidence/`.
