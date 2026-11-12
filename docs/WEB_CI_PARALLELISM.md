# Web smoke: same-attempt matrix parallelism (AUG-347)

## Scope

Keep the established required check `web-smoke`. A producer runs the existing usability gate and full Jest suite, exports the standard offline app, and uploads that build once. Two consumers then run concurrently:

- `browser-flows`: original standard smoke/live share/join/safe-area checks, sharing-on build and smoke/usability/journey/negative controls, separate demo build and scorecard screenshot.
- `browser-matrix`: unchanged complete matrix command and its existing retry setting against the same standard build, in fresh browser contexts as before.

The aggregate uses `always()` and requires **success** from producer and both consumers. Failure, cancelled, skipped, missing or unknown dependency results cannot pass. No existing suite, test budget, negative proof, path filter, main-push check, permission, or concurrency rule is removed. Browser execution still decides whether an export is usable; export exit zero and an app marker are not startup acceptance.

## Artifact boundary

Only the `standard-web-${run_id}-${run_attempt}` artifact from this workflow attempt is used. The upload includes hidden files, fails when absent, and expires after one day. Consumers verify before browser setup/execution:

- run and attempt, checkout commit and full source tree;
- workflow and lockfile hashes, exact Node version and hosted runner image version;
- locked Expo and Playwright versions;
- standard offline/sharing-off/demo-off build flags;
- sorted output inventory, byte lengths and SHA-256 hashes, with no symlinks;
- index, one entry bundle and an actual application marker (reject router-only exports).

The checkout must have no tracked changes. Artifact download is scoped to the current run, with no token, external run ID, or cross-event cache reuse. A changed image/toolchain, missing artifact, or provenance mismatch fails closed. Use **Re-run all jobs** for a retry: rerunning only a failed consumer in a new attempt intentionally cannot consume an old attempt's artifact. No automatic retry or fallback build masks a missing artifact.

Sharing-on and demo outputs remain separate exports with their original compile-time flags. They never consume standard output as a substitute. The existing demo-vs-standard bundle check remains.

## Evidence locations

`web-smoke-screens` and `journey-screens` keep the original flow evidence. Matrix screenshots/results are now `web-smoke-matrix-screens`; inspect both flow and matrix artifacts. This repository has no downstream consumer that requires matrix screenshots inside the old artifact name.

## Verification and rollout

Run `node --test e2e/usability-gate.test.mjs scripts/ci/web-pipeline.test.mjs` from `scoresnap`. Static contract tests preserve commands, flags and the fail-closed gate; fixture tests mutate artifacts and dependency states. Hosted execution must still verify upload/download layout, environment equality, browser results and actual speed on the exact PR head before merge. No local workflow syntax test is a substitute for that hosted run.

Measured baseline on the preceding PR80 head: Web job 935s, of which matrix 348s; queue 3s. Equivalent postmerge Web job 859s, matrix 342s; queue 2s. These are historical measurements, not a benchmark of this change. Parallelism removes the matrix from the serial flow lane, with an upper bound near 348s of overlap before extra checkout/npm/browser setup, transfer and aggregate overhead. Actual savings may be smaller; measure producer/consumer/aggregate durations on the hosted candidate. More jobs can increase runner-minutes even while reducing wall time. This change does not purchase runners or change runner type.

No cross-event evidence reuse, broad workflow rewrite, weakened release check or claim of backend/account/device acceptance is included. Future changes need their own measured benefit and source/environment/permission review.
