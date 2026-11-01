# SnapScore journeys

From `scoresnap/`, reuse a **sharing-on, offline** export served on localhost:

```sh
node --test e2e/journeys/metrics.test.mjs
BASE_URL=http://127.0.0.1:8092 OUT_DIR=e2e/journey-screens node e2e/journeys/runner.mjs
BASE_URL=http://127.0.0.1:8092 OUT_DIR=/tmp/journey-negative node e2e/journeys/negative-proof.mjs
RUN_ROOT=/tmp/tp-nightly bash e2e/journeys/nightly.sh
```

No install is needed. `JOURNEYS=J-home-create-cancel` selects executable IDs; unknown, deferred, or empty selections fail. `BASELINE_FILE=/path/baselines.json` optionally supplies a map from journey ID to baseline objects. `CHROMIUM_PATH` can select an already installed browser. Results include the main SHA (`GIT_SHA` override), flags, fixture version, inventory, one attempt per journey, metrics, assertion evidence, coverage gaps, and 390×844 screenshots at each step. Every missing result/assertion/required step capture, driver error, page error, unexpected pass, or skipped required journey is red. No retries.

Only localhost HTTP is accepted; service workers are blocked and requests outside the served origin are aborted. These tests prove local offline behavior. Successful cross-device join, process-crash recovery, native accessibility, and StoreKit remain separate coverage. GS-13, GS-16, device boot and cold-launch checks remain required independently.

`act.activate`, `act.type`, and `act.scroll` instrument the measured path. Activations are never reduced by text edits. Text editing records focus separately; browser reload counts one activation. Setup (including Home initialization and opening the fixture round) and screenshot capture are excluded from task time. Total runner wall time is recorded separately. Absolute journey timeouts include capture. Screens and modals use adapter-declared IDs, with distinct IDs and transitions recorded separately. Geometry checks never scroll: full target bounds must fit the viewport and clipping ancestors, and center/inset corners must hit the target or its descendants. Real clicks use checked coordinates to prevent implicit scroll.

Feature entry depth counts navigation activations from the declared Home/Round start. Scoring an already exposed player control counts as an activation in the journey budget, and is task input rather than navigation to subsequent features. Disclosure IDs in `adapter.mjs` are explicit; opening one makes a subsequent core entry red. Core controls allow zero scrolls and at most two entry activations; secondary controls allow one scroll and at most three. Each feature declares its exact role/name and visible text. Layout/text/enabled/hit-test checks remain mandatory even when semantic reachability has a strict expected failure.

Visible labels require display/visibility along the entire text-to-root chain, including the actionable container, with an effective opacity product >0.1. Text color must have alpha >0.1 and differ from the background color composited through its ancestors. Negative proofs cover hidden controls, renamed controls, disabled controls, an opacity-zero label wrapper (`hide-label`), and transparent text (`transparent-label`); each must fail with its specific signature while label mutations preserve the button and accessible name.

AUG-306 marks missing roles/names on the current round controls. For those features only, check the exact expected `no-accessible-name` failure, then activate the test ID and keep outcome assertions gated. The adapter gives existing unnamed tab/invite Pressables test-only IDs without adding semantics or changing app code. A label fix is red with “remove marker”; any different failure stays red. The same 14-day expiry/explicit `renewedUntil` renewal rule applies to journey and feature exceptions. AUG-289 asserts the actual missing finalize confirmation; unrelated failures cannot satisfy it.

Baselines are versioned in the manifest after a successful measured run, with source SHA/platform/flags/fixture metadata. The runner never writes or resets them. Activation regression fails on either >20% growth or >2 extra activations, as well as the absolute budget. Timing is record-only until ten comparable baseline samples establish a median; then +50% is red. Baseline reviews must preserve comparability and explain changes.

Add a journey by extending `journeys.json` and `adapter.mjs` together: declare persona, goal, start/fixture, exact feature semantics, budgets, assertion inventory and `requiredSteps` capture names; assert entry, activation, destination and persisted outcome; use the action wrapper and capture each step. Every executable journey requires a nonempty, unique capture inventory; deferred journeys declare an empty inventory until implemented. A capture counts only after its screenshot succeeds in that attempt. Expected failures still require all declared captures (finalize requires `entry`, `finalize-requested`, and the diagnostic `failed` capture). Fixtures must not pre-complete the goal. Mark incomplete coverage `deferred` with a concrete reason. Implemented defects use a dated strict `known_issue` with Linear ID and one specific failure signature. Add negative unit evidence when extending gate policy.

Growth rule: every accepted defect, QA finding, App Review issue, or correction adds or strengthens an executable assertion in the fix PR, or a strict expected failure while awaiting the fix. Append a row to `GROWTH.md` naming behavior, origin, executable assertion, owner and issue. Review distinct coverage and unresolved findings weekly; zero additions triggers a review, not filler. Deferred rows explicitly identify absent assertions.

The box nightly takes the fixed flock, snapshots the invoking harness, fetches/checks out recorded `origin/main`, symlinks existing dependencies, exports offline/sharing-on with Expo offline/telemetry settings, serves a free local port, and runs journeys plus all five negative proofs. It has a 20-minute timeout, traps server cleanup, preserves each invocation under the America/Los_Angeles run date, retains 14 dated directories, and reports a prior summary older than 36 hours as STALE/red. `RUN_ROOT`, `REPO_DIR`, `NODE_MODULES_SRC`, and preferred `PORT` are overridable. Logs and the latest dated `summary.md` include harness and main SHAs; the harness snapshot permits testing main before this PR merges. No schedule is installed. Scheduler owner: SnapScore maintainers, pending separately authorized external scheduling.

CI reuses the existing web-smoke job and port 8092. Journey checks have a two-minute step timeout; the dedicated screenshot upload immediately following them runs with `if: always()`, a one-minute timeout and seven-day retention. These steps allocate 180 seconds total to journey work including artifacts. The shared smoke screenshot upload excludes journey artifacts. No job, schedule or retry is added.

## Rollout gaps

- needs Augie: require web-smoke on main

As checked 2026-10-31, GitHub reported no main branch protection and no repository rulesets. Defect 2 is outside this fix round's scope: repository settings require Augie's explicit yes. No settings changes are made here.
