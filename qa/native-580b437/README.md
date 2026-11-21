# Android smoke-only QA adapter

App source580b437574997ca25c7e389f416547cb4c2e00be; app tree853e1bba62555a95bc7d1ffc0e2afaf1926215eb. Test-only commit; no application, dependency, release config or workflow changes. All inherited paths except the two native test entrypoints must remain exact. App is exported separately; harness HEAD/diff digest and installed APK digest are recorded independently.

Launch (only after separately authorized workflow/manual execution):

    DEVICE_LAYOUT_OUT=/new/private/output bash scoresnap/e2e/device-layout/scripts/run-android-compact.sh

Default path builds the APK; no unspecified prebuilt artifact required. Existing workflow calls exactly this command. Node22/API35 x86_64 emulator come from existing job configuration. Requires existing Java17, compileSDK36, build-tools36.0.0, NDK27.1.12297006, CMake3.22.1 and exactly one fresh disposable emulator. Precise ANDROID_PREFLIGHT_MISSING stop precedes dependency resolution. No SDK installation fallback. The current Ubuntu24.04 image documentation lists other NDK/CMake versions, so required components must be verified on the actual runner; expect preflight failure if absent. ubuntu-latest image routing is not guaranteed by that documentation. Source: https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md

Build sequence: clean exact app export → unchanged-lockfile npm ci → pinned local Expo prebuild --no-install → Release/x86_64 Gradle build with SDK auto-download disabled → reject tracked source/lock changes → verify APK install → existing offline onboarding → real Home capture at observed1.0/1.3 → restore original emulator scale. Dependencies resolve from standard public npm/Gradle repositories using isolated HOME and no inherited account environment. Build phase caps300/180/1000s kill only the spawned process group. No personal credentials, production writes, purchases, permission grants or host provisioning. Simulator debug test-signing uses the generated native template, not production credentials. Native output is labeled offline layout, not production parity.

Manual Join flag=true, Leagues=false, native links=false in test environment; no source release config changed. No seed round/code or backend connection. Real runtime paywall and ordinary-host two-client native Join/approval/binding/convergent scores/reconnect remain unrun separate acceptance gates.

Smoke uses real Settings plus foreground Activity configuration, never desired/stamped scale or density as scale. It does not claim initialized RN in-process measurement. System dialogs, absent Home IDs, changed APK or missing scale reject. UIAutomator visible-hierarchy nodes may omit visible-to-user; explicit false/zero bounds/wrong scene reject. Screenshots remain unchanged. Current output is not a full geometry/checkpoint bundle.

EXIT78 ALWAYS, including both successful smoke scales. Status aggregatePass:false. Required layouts/Join/paywall/geometry/review are missing; aggregate RED is expected, not release approval. No fake bundle.json. iOS entrypoint fails closed without invoking native/toolchain/observer tooling; no iOS pass. SE3 does not become acceptance proof.

Native workflows have main-only push triggers plus PR/manual events; QA branch push alone does not start them. Manual dispatch compares HEAD~1 and HEAD; qa/**/*.py matches the unchanged filter's unknown-impact branch and sets ui=true/native=true. Existing Android and iOS jobs then run, both remain non-success; aggregate requires native/vision success. A manual dispatch still schedules the existing owner iOS runner even though its entrypoint performs no native work; do not dispatch without appropriate authorization. Workflow uploads DEVICE_LAYOUT_OUT even on failure, retaining logs/smoke receipts through existing artifact behavior; no APK copied there. No trigger/security/permissions change or dispatch included.

Shallow checkout: missing app commit is fetched by exact SHA from fixed public https://github.com/augsmog/QuickScore.git using empty temporary HOME, disabled credential helpers/headers/prompts; timeout60s. No branch rewrite or credential configuration. App source stays outside upload directory and is removed with owned temporary workspace. Prepared-APK config remains optional for controlled manual reuse.

Portable checks: bash qa/native-580b437/check.sh. Native build/install/capture UNRUN locally. These controls prove rejection behavior and source isolation, not native success. No complete layout reader imported or checks weakened.
