# Android smoke-only QA adapter

App sourcea073d5761b77f3e01610acebaf5d98f76a920fb5; app tree3cbda6ddde720b614c0ae3c2bccef7948d805e20. Test-only commit; no application, dependency, release config or workflow changes. All inherited paths except the two native test entrypoints and native-scripts.test.mjs must remain exact. App is exported separately; harness HEAD/diff digest and installed APK digest are recorded independently.

Launch (only after separately authorized workflow/manual execution):

    DEVICE_LAYOUT_OUT=/new/private/output bash scoresnap/e2e/device-layout/scripts/run-android-compact.sh

Default path builds the APK; no unspecified prebuilt artifact required. Existing workflow calls exactly this command. Node22/API35 x86_64 emulator come from existing job configuration. Requires existing Java17, compileSDK36, build-tools36.0.0, NDK27.1.12297006, CMake3.22.1 and exactly one fresh disposable emulator. Precise ANDROID_PREFLIGHT_MISSING stop precedes dependency resolution. The observed prior job used Ubuntu26.04 image20261116.88.1; the exact linked inventory was unavailable, so no Ubuntu24.04 inventory is treated as its installed-tool proof. Provisioning is limited to GITHUB_ACTIONS=true, RUNNER_ENVIRONMENT=github-hosted, Linux/X64, augsmog/QuickScore, ImageOS=ubuntu26, OS26.04 and SDK root/usr/local/lib/android/sdk. It selects existing JAVA_HOME_17_X64 and validates Java17. Existing official cmdline-tools/latest/bin/sdkmanager may install only missing platforms;android-36, build-tools;36.0.0, ndk;27.1.12297006 and cmake;3.22.1. No command-line tools/Java/system-image install, sudo, package upgrade or workflow change. All other contexts fail before provisioning. These environment guards rely on the existing trusted job, not a new security boundary against a malicious host.

Existing android-sdk-license receipt is required; sdkmanager receives stdin DEVNULL, never --licenses or yes input. Its isolated HOME/environment contains no account material. License hashes must remain unchanged; missing acceptance, nonzero exit, timeout or missing post-install file rejects. Provisioning is bounded360s; sdk-provision.json records actual image/version and requested/installed package IDs, sdkmanager.log records outcome. No packages installed by this development task. The existing30min workflow timeout still applies to provisioning/build/capture combined; cold downloads may exhaust it and must remain a failure.

Build sequence: clean exact app export → unchanged-lockfile npm ci → pinned local Expo prebuild --no-install → Release/x86_64 Gradle build with SDK auto-download disabled → reject tracked source/lock changes → verify APK install → existing offline onboarding → real Home capture at observed1.0/1.3 → restore original emulator scale. Dependencies resolve from standard public npm/Gradle repositories using isolated HOME and no inherited account environment. Build phase caps300/180/1000s kill only the spawned process group. No personal credentials, production writes, purchases, permission grants or host provisioning. Simulator debug test-signing uses the generated native template, not production credentials. Native output is labeled offline layout, not production parity.

Manual Join flag=true, Leagues=false, native links=false in test environment; no source release config changed. No seed round/code or backend connection. Real runtime paywall and ordinary-host two-client native Join/approval/binding/convergent scores/reconnect remain unrun separate acceptance gates.

Smoke uses real Settings plus foreground Activity configuration, never desired/stamped scale or density as scale. It does not claim initialized RN in-process measurement. System dialogs, absent Home IDs, changed APK or missing scale reject. UIAutomator visible-hierarchy nodes may omit visible-to-user; explicit false/zero bounds/wrong scene reject. Screenshots remain unchanged. Current output is not a full geometry/checkpoint bundle.

EXIT78 ALWAYS, including both successful smoke scales. Status aggregatePass:false. Required layouts/Join/paywall/geometry/review are missing; aggregate RED is expected, not release approval. No fake bundle.json. iOS entrypoint fails closed without invoking native/toolchain/observer tooling; no iOS pass. SE3 does not become acceptance proof.

Native workflows have main-only push triggers plus PR/manual events; QA branch push alone does not start them. Manual dispatch compares HEAD~1 and HEAD; qa/**/*.py matches the unchanged filter's unknown-impact branch and sets ui=true/native=true. Existing Android and iOS jobs then run, both remain non-success; aggregate requires native/vision success. A manual dispatch still schedules the existing owner iOS runner even though its entrypoint performs no native work; do not dispatch without appropriate authorization. Workflow uploads DEVICE_LAYOUT_OUT even on failure, retaining logs/smoke receipts through existing artifact behavior; no APK copied there. No trigger/security/permissions change or dispatch included.

Shallow checkout: missing app commit is fetched by exact SHA from fixed public https://github.com/augsmog/QuickScore.git using empty temporary HOME, disabled credential helpers/headers/prompts; timeout60s. No branch rewrite or credential configuration. App source stays outside upload directory and is removed with owned temporary workspace. Prepared-APK config remains optional for controlled manual reuse.

Portable checks: bash qa/native-a690ef23/check.sh. Native build/install/capture UNRUN locally. These controls prove rejection behavior and source isolation, not native success. No complete layout reader imported or checks weakened.

Manual route requires GITHUB_ACTIONS=true, GITHUB_EVENT_NAME=workflow_dispatch, GITHUB_REPOSITORY=augsmog/QuickScore, GITHUB_WORKFLOW=device-layout-gate and GITHUB_REF=refs/heads/qa/snapscore-a690ef23-android-smoke. The adapter independently rejects any mismatch before side effects. check-source validates exact app tree, clean harness, actual checkout root and approved origin before build.


## Exact a073 successor (local staging)

Export/build/install identity now binds a073d5761b77f3e01610acebaf5d98f76a920fb5 / tree3cbda6ddde720b614c0ae3c2bccef7948d805e20. Existing historical QA directory/ref and all manual guards stay unchanged. The Home app patch is carried separately in QA ancestry; source validation requires the full app checkout to equal this exact product outside the existing test allowlist. Planned source ref qa/snapscore-home-font-a073 is local only and must become authorized/readable before shallow runner fetch can work. No a690 APK/capture may satisfy these new hashes.

Foreground Activity mCurrentConfig parser remains the separately tested 631f930 implementation: unique focused/resumed Activity block, typed missing/duplicate/stale/format reasons, matching Settings and OS configuration, same Activity identity before/after. Raw dumpsys/XML, device serial, paths and runtime fingerprint are not written to screenshot receipts. No initialized JS/RN scale claim. Native execution, geometry and complete Join/paywall remain unproved. No workflow/trust or app runtime flags changed.

### Local a073 focus diagnostics
After exact source/build/installed-APK verification, Home readiness is sampled up
to six times using read-only pidof, window focus and UI hierarchy queries, with two
seconds between attempts and existing per-command timeouts. Receipts contain only
bounded reason/count/presence values; no package/component names, PID, serial,
window tokens, hierarchy text or raw dumps are exported by this diagnostic.
Null/unrecognized, foreign and ambiguous focus remain failures. No dialogs are
acted on and no permissions are granted. Capture then independently rechecks scene,
Activity configuration/identity and scale before and after; those failures are not
retried. A readiness success is not a screenshot or native gate pass.
`scale-<value>-diagnostic.json` records readiness and capture phase even on failure.
`apk-transport.json` uses existing build-tools aapt read-only against the exact APK;
unknown/custom policy remains unknown, and no network/runtime acceptance is inferred.
Build, lint, settings restoration and trusted intake/aggregate exit 78 are unchanged.

### API35 display-scoped focus successor
Use read-only `dumpsys window displays` at readiness and both capture observations.
Exactly one `Display: mDisplayId=0` block is required; reject all multiple/secondary
or missing displays, outside-block focus, null/duplicate/foreign/system focus.
The target still must match the uniquely resumed Activity client block, visible
Home and requested Settings/Activity scale before/after; PID alone never passes.
The optional AAPT policy parser derives application indentation/parentage from the
manifest tree, accounting for namespace depth, and reads only direct application
attributes. Typed boolean/raw contradictions, malformed nesting, duplicate apps,
custom security policies and unsupported output retain unknown effective policy.
An independently read target SDK can survive an unrecognized XML-tree format.
Source references and synthetic structural fixtures live in android/fixtures;
these do not represent an actual runner dump or device/network acceptance.
Global default-display binding additionally brackets each display-content query with
two WMS `windows` reads of the unique mTopFocusedDisplayId. Both must be 0. The
observed ID selects the sole matching block; no first-block/PID/suffix fallback.
Every before/after capture observation repeats this binding. Nonzero/ambiguous or
missing global IDs fail closed; multiple display blocks remain unsupported.
