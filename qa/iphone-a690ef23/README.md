# Trusted standalone iPhone smoke intake — expected gate RED

App SHA a690ef23e67a255408028d81e57d40e09778c3eb; tree ba833845c2f2cfbacdecc3ee847e74c4fcfd90b7. All app/dependency/workflow/permission files unchanged. Only this test directory and existing scoresnap/e2e/device-layout/scripts/run-ios-sim.sh differ. Parent app contains only the separately verified local-invite copy/test correction over580b.

The existing device-layout-gate manual workflow invokes the same entrypoint:

    DEVICE_LAYOUT_OUT=/existing/runner/private-output bash scoresnap/e2e/device-layout/scripts/run-ios-sim.sh

Native intake requires GITHUB_ACTIONS=true, RUNNER_ENVIRONMENT=self-hosted, RUNNER_OS=macOS, GITHUB_REPOSITORY=augsmog/QuickScore, GITHUB_EVENT_NAME=workflow_dispatch, GITHUB_WORKFLOW=device-layout-gate, GITHUB_REF=refs/heads/qa/snapscore-a690ef23-iphone-smoke. Outside that existing trusted context it exits78 before native calls. Environment guards supplement existing workflow trust; they are not authentication against an adversarial host. No PR/fork path, permissions or trigger changes.

## Executor prerequisites and isolation

Existing Xcode26.4.1 with available installed iOS26.4 runtime, iPhone16Pro device type, Python3, Node/npm, CocoaPods and previously installed working Maestro/iOS driver + Java. No brew/install of QA toolchain, runtime download, security grants, keychain/account reads, entitlement/signing changes, Apple services or personal devices. The wrapper creates one uniquely named SnapScore-QA-a690ef23-<random> simulator and uses only its returned UUID, boots it, then shuts down/deletes only that UUID in cleanup. Existing devices are never selected/reset. If creation/query/boot/tool prerequisites fail, output remains red.

Before changing category or building, query simctl's actual content_size token. Missing/unrecognized query result blocks, no guessed scale. Category changes affect only this new disposable simulator; original category restored in finally before cleanup. Host/macOS accessibility settings unchanged. The runner creates private temp source/build/log directories outside DEVICE_LAYOUT_OUT and removes them on completion.

Shallow harness checkout can retrieve the already-public exact app commit via a no-tags/depth1 fetch from fixed https://github.com/augsmog/QuickScore.git with empty temporary HOME and disabled credential helpers/headers/prompts. It exports exact app into a second clean checkout and verifies full commit/tree. No source from a divergent harness branch is built. Dirty harness or changed inherited non-test paths block. Binary content SHA256 and installed app hash must match; no cache re-stamping.

Ordinary trusted build dependencies only: unchanged-lockfile npm ci, local pinned Expo prebuild --no-install, pod install, Release simulator xcodebuild CODE_SIGNING_ALLOWED=NO. Isolated HOME/CP_HOME_DIR; no inherited account environment. Reject tracked app/lock changes. Offline=true/demo=false/simulator-no-MLKit=true/manual Join=true/Leagues=false/native-links=false test flags; product release config untouched. Build phase limits300/180/300/1200s, Maestro120s, screenshots20s; aggregate existing45min job cap still applies. Cold dependency/cache issues can cause a truthful failure.

## Supplemental captures and publication allowlist

Home (after existing product's automatic offline onboarding) and four-player New Contest at actual simulator category Large, XXL, XXXL. Maestro visible controls asserted before AND after each screenshot; hierarchy identities corroborate the scene. Wrong Home-as-wizard, absent player4/footer, dialogs or category mismatch stop. No grants/clearState/forced pass/cropped screenshot/geometry waiver. No manually completed onboarding proof is claimed.

Upload directory contains only six specifically named PNG/JSON pairs plus status.json under iphone-smoke-supplemental. Receipts allowlist source SHA/tree, build digest, scene, observed category, stock reference multiplier, PNG digest and nonacceptance flags. Raw hierarchy, environment, source paths, simulator UUIDs, build artifacts and phase logs never enter upload directory. Raw build/native logs are private temporary and removed. Unscreened/pending/rejected images never exported. Synthetic offline app only, no account or backend data. Existing workflow upload action remains unchanged; it receives only these scrubbed outputs from this wrapper.

Stock reference1.000/1.235/1.353 is explicitly NOT measured initialized RN scale: runtimeRNScale:null and nativeAcceptance:false. No iOS1.300 claim. Initialized RN/dSYM observation, real runtime paywall/offering, required geometry/review, and ordinary-host two-device native Join/approval/player binding/scores/reconnect remain open. Paywall unrun; SE3 unrun/report-only. Both complete and partial smoke return78, so aggregate red is mandatory. No full-checkpoint bundle.json emitted. Android sibling entrypoint remains original stub.

## Path/trigger behavior

Manual dispatch diff HEAD~1..HEAD includes qa/iphone-a690ef23/*.py, classified native=true by the unchanged unknown-impact path rule. Existing iOS entrypoint invokes intake.py; existing workflow also schedules its other required jobs, including review machinery, so this patch alone does NOT authorize dispatch. All repository push workflows filter main; pushing this QA branch does not start device/deployment jobs. No PR/dispatch/reviewer/build upload requested by publication.

## Provenance and local checks

Initial standalone input manifest6cb9fc74ac47021cbd66ba13decfc8a6d367cc0889b225ddcabde8cab086dcdd. Selected inspected legacy595dae3d06fe0b3b9dd768976349ec84a749b8cc build/screenshot/testID patterns only; no wholesale script/app/normalizer import. run.py change from standalone permits only the exact newly generated simulator name supplied internally. Added intake/redaction controls. Run:

    PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s qa/iphone-a690ef23 -p 'test_*.py' -v

13 local controls pass. Native build, simulator capture, category readback and cleanup are unrun here; no hardware/native pass. No secrets/personal identities added; service Git metadata only. Source and original Android QA branches remain untouched.
