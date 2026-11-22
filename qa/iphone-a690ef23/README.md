# Trusted standalone iPhone smoke intake — expected gate RED

App SHA a073d5761b77f3e01610acebaf5d98f76a920fb5; tree 3cbda6ddde720b614c0ae3c2bccef7948d805e20. All app/dependency/workflow/permission files unchanged. Only this test directory and existing scoresnap/e2e/device-layout/scripts/run-ios-sim.sh differ. The exported app adds only the Home hero remeasurement change and regression over a690; QA checkout carries the same app delta on the existing smoke ancestry.

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


## Exact a073 successor (local staging)

App a073d5761b77f3e01610acebaf5d98f76a920fb5 / tree3cbda6ddde720b614c0ae3c2bccef7948d805e20. Historical directory/ref names remain unchanged to preserve the existing narrow manual route. Source is still exported separately; the QA checkout must match this app outside the existing QA allowlist. The exact app object must be readable before a future shallow runner checkout can fetch it. Planned source ref qa/snapscore-home-font-a073 is LOCAL ONLY; publication/dispatch is not performed here.

Capture sequence: three Home warm-process categories first, then three Home cold-process categories, then per-category four-player checkpoint, deliberate Add Player label reveal/capture and fifth-player action verification. Each cold cycle must successfully terminate the app, set/read actual category, and launch a new positive PID different from the previous process. PIDs stay private. No route injection, app data reset, fake text scale or initialized RN claim. Existing capture files remain named home-* and four-player-*; separate home-cold-* and add-player-* names cannot overwrite them. Every screenshot requires before/after category and scene/visibility checks. Receipt labels are cross-checked against scene/process/category during publication.

Add Player uses exact escaped visible text and explicit 100% visibility with centering. This proves label visibility and subsequent control activation if the run succeeds; complete button paint/footer clearance still requires independent screenshot review. Missing scroll reachability stops the setup phase with typed phase/step; already completed Home captures survive. No geometry/native/full-gate success is inferred. Fifth-player success is recorded only after its actual visible assertion, separately from the preserved four-player screenshot.

Output remains exit78 / aggregate false, including successful supplemental captures. Paywall remains unrun. No provider calls or staged paywall code are added. Existing guard, workflow, permissions and runtime/Xcode policy remain unchanged. Stock category is OS evidence only; runtimeRNScale stays null.

### Local paywall continuation
After the twelve existing captures and fifth-player checks, the same offline
installed build follows Home → New Contest with two synthetic names, the ordinary
multi-day toggle/two rounds, Continue twice, and Start. Default course and stroke
play are valid app defaults. No contest is seeded or saved on the free TD route.
Three additional header captures require actual before/after stock-category
readbacks and the exact paywall header/Close identity; foreign scenes fail closed.
Close and explicit header Back IDs return through both wizard steps and verify both
names and the two-round control. This is a fallback header/draft check: native price,
disabled CTA, live provider, purchase/restore and initialized RN scale remain unproven.
No Buy, Restore, URL, provider or deep-link action is used. Existing trusted intake,
ref and aggregate exit 78 remain unchanged. Failure preserves prior screened pairs.
Portable checks: `python3 -m unittest discover -s qa/iphone-a690ef23 -p 'test_*.py'`;
`paywall-route.test.cjs` additionally exercises exact app handlers with repository
renderer fixtures (not a native navigation result).

### Optional pricing sections on the same offline build
After each top paywall capture, independently scroll from the verified top to:
Free + Current plan; Tournament Director + exact `$79.99/year`; Currently unavailable
+ yearly-renewal copy. Full anchored exact labels and foreign-scene exclusion apply
before and after each screenshot. The disabled section additionally requires an
explicit false enabled attribute on the same accessibility node bearing the exact
unavailable copy; copy alone or a noninteractive ancestor is not disabled proof.
These optional sections may be unavailable on this platform's AX representation.
Only screened sections are retained; their bounded status does not overwrite top
captures or grant acceptance. No tier/price/CTA/Restore controls are tapped.
Each attempt returns to the verified top first. After all attempts, scrolling to the
actual visible Close and checking the same retained draft is mandatory. Up to 24
screened pairs can be retained; live pricing/provider, initialized RN and full gate
credit remain absent. Native execution of this continuation has not occurred here.

### Active five-player draft continuation (local, native unrun)

After the existing Add Player actions, the final five-player setup remains active.
Do not press the top-level Back or reopen from Home. The continuation requires the
fifth player, scrolls UP to Player 2's empty input, fills only QA Guest, observes
literal `2 ready`, enables Multi-Day and rounds-2, then verifies ordinary Continue
transitions to games and round settings before Start opens the free TD paywall.
No host mutation or host-descendant assertion is used to enter the paywall.

Each category still requires actual simctl readback and unchanged screenshot/scene
screening. Paywall failures now carry the last successfully observed approved
category; failed category changes have no stamped category. Optional pricing,
no-purchase/no-restore policy and mandatory actual Close remain unchanged.

After Close, two wizard Back steps, visible `2 ready` and another successful
Continue/back prove functional draft retention. Literal Golfer and QA Guest are
checked separately by visible text; inaccessible names produce namesRetained=false,
never an inferred true. The round control must still be visible. Subsequent
categories reuse that retained setup without typing, toggling or reopening Home.
All receipts remain supplemental/offline fallback, with initialized RN scale and
native acceptance unproven. Actual native selector/scroll behavior is UNRUN here.
