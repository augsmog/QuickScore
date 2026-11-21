# Disposable invite journeys (Refs AUG-1275, AUG-1276)

The browser job `invite-join-ui` in `xdevice-stack.yml` runs the real app join UI on two isolated local stacks: anonymous Auth enabled and disabled. It generates an empty synthetic two-group contest through production enrollment code. A fresh guest must use Home → Join with code, enter the code, request a slot, await host UI approval, retain the intended player binding, save a score, and retain both group scores after reconnect/reload. The disabled case asserts the unavailable error and no request, membership or score writes. The existing four-identities service run is retained as separate partial evidence; this suite does not replace it.

Focused validation (no devices or backend writes):

```sh
cd scoresnap
node --test e2e/invite-journey/*.test.mjs
```

Runtime receipts and screenshots contain only synthetic identifiers and observations. The fixture contains disposable credentials: store it in runner temporary storage with mode 0600; never upload it, Auth responses, Maestro debug directories or server startup logs. The workflow removes its private inputs on exit. This harness rejects APIs other than exact `http://127.0.0.1:54321` and forbids the production invite. It never links a project or changes live config.

## Native capture handoff

Owner: cross-product E2E system `/workspace/aos-state/e2e/`. Code closure is separate from AUG-408/AUG-397/AUG-404 evidence closure. The native journey is opt-in and is not registered in the single-device runner: that runner reinstalls between phases and would invalidate the required session continuity.

Use an **existing** compatible simulator `.app` containing PR87 (merge `6017bec355cae206fa7bb3da583859736c7ad57e`). A production online/offline artifact is incompatible. SourceCommit.txt must identify the app's source commit; the runner checks the PR87 ancestry in this repository. The app artifact must already carry `InviteJourneyBuild.json`, a build-time provenance record:

```json
{"schema":"invite-journey-app/1","source_sha":"<40 hex>","api":"http://127.0.0.1:54321","cross_device_sharing":true,"offline":false,"native_links":false,"leagues":false,"executable_sha256":"<64 hex>"}
```

The E2E system must establish this metadata from the original build configuration; do not manufacture metadata to bless an incompatible app. The runner verifies source and executable hash and fails before installation when prerequisites are missing. Missing compatible artifact/provenance is an artifact dependency, not permission to build, spend or change credentials. No native capture is claimed by static validation or browser runtime.

On a macOS E2E host with its existing approved disposable Supabase stack (anonymous Auth enabled, normal migrations plus existing account-handoff, owner-discovery, game-settings and owner-invite proposals applied in the order shown in xdevice-stack), dependencies, Maestro and two fresh booted dedicated simulators named `e2e-invite-*`:

```sh
cd scoresnap
# Status and private fixture stay outside the evidence directory.
supabase status -o json > "$RUNNER_TEMP/invite-status.json"
export INVITE_STATUS="$RUNNER_TEMP/invite-status.json"
export INVITE_FIXTURE="$RUNNER_TEMP/invite-private.json"
node --import tsx e2e/invite-journey/seed.mts
export INVITE_APP=/path/to/existing/SnapScore.app
export INVITE_HOST_UDID=<fresh-host-udid>
export INVITE_GUEST_UDID=<fresh-guest-udid>
export OUT_DIR=/path/to/evidence/native-invite
node e2e/invite-journey/native.mjs
rm -f "$INVITE_FIXTURE" "$INVITE_STATUS"
```

Both simulator installations persist across phases. The host cold-opens the server contest with no seeded local contest/scores. The restored invite must equal the actual iOS Copy share payload. The guest enters through Home → Join with code (no join deep link) and uses the real anonymous join UI; host approval must bind that exact anonymous identity to the intended server player ID. Guest and host score in different groups. Cold process reconnects must retain rendered scores, authorized server scores keyed by contest/round/group/player/hole, and binding; untouched hole 2 stays clear. The runner writes `receipt.json` only after all checks pass and captures final screenshots. Do not run it from box engineering lanes.

The baseline snapshot omits canonical invite codes. The disposable matrix applies the existing game-settings predecessor and owner-invite extension; no proposal is deployed to a live project. Owner snapshots must contain the canonical code; guest snapshots must omit that owner-only field while retaining keyed score proof.
