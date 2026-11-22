# Private offline SDK/APK successor — not dispatchable

Parent 840c35aa6f5c4524293e424a183ec1d48c959eea. No app/flag/workflow edit.
SDK provisioner derived from exact historical blob
2a9a7a08799c7a66abf4a3281b19bc70ad55ae83. Only absent NDK27.1.12297006 and
CMake3.22.1 may be installed; preinstalled SDK36/build-tools36 are mandatory.
Exact GitHub-hosted Ubuntu26 x64, standard SDK root, ordinary user and existing
Java17/sdkmanager required. Closed stdin, no sudo/yes/--licenses; unchanged
license digest map required on success/failure. No command was run here.

After Expo prebuild, only task-generated src/release/AndroidManifest.xml is
created with tools:node=remove for INTERNET and uses-permission-sdk-23 INTERNET.
Existing release overlay causes stop. Final aapt dump permissions must parse,
identify the exact package, and contain no INTERNET request before installation.
Unknown declarations/output fail closed; actual vendor output is not tested here.
Recipe records overlay hash and denial plus final APK digest. Tracked product
source remains intact. This deliberately changes binary capabilities, so it is
OFFLINE supplemental capture only. Sentry remains configured exactly as product;
its own network sockets cannot work without INTERNET. No assertion is made about
external app delegation or online/provider behavior; this journey must not invoke
external activities, purchases, Restore, authentication or links. Any resulting
startup/UI malfunction remains a real blocked observation, never hidden.

Sources:
https://developer.android.com/reference/android/Manifest.permission#INTERNET
https://developer.android.com/build/manage-manifests

STOP: unchanged outer reactivecircus/android-emulator-runner@v2 currently runs
`yes | sdkmanager --licenses` unconditionally and exposes no skip input:
https://raw.githubusercontent.com/ReactiveCircus/android-emulator-runner/v2/src/sdk-installer.ts
https://raw.githubusercontent.com/ReactiveCircus/android-emulator-runner/v2/action.yml
This task authorizes no new acceptance. No workaround/fork/new launcher is staged.
Its current rolling source also names build-tools37; it is not the historical
artifact's immutable action revision. Exact safe launcher review is required.
The existing workflow's single-parent/workflow-only guard intentionally rejects
this successor. Do not rebind or dispatch until the outer action boundary is
resolved. No new KVM, runner, credential, global network or security setting.

Portable tests: 94 Python; 88 Node. These are mocked/static controls, no SDK install,
Gradle build, merged manifest, APK or native runtime proof. Full gate stays open.
