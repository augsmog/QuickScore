# Existing gate integration, deliberately incomplete

Main readback remains5190f43261a42f108d54627c793d5be64046c840. Existing
scripts/run-android-compact.sh now calls gate_android.py, not the AUG1376 stub.
Workflow files, paths filters, required names and aggregate remain unchanged.

Recipe adapted from exact5c81 hosted.py: clean task-private npm home and separate
npm config files; npm ci; local Expo CLI prebuild; Release assemble, x86_64,
max-workers2, no parallel/cache, 3GiB heap/1GiB metaspace, 1200s owned-group cap.
Release lint remains enabled. Standard pinned dependency fetches happen only in a
future authorized hosted job, never this local validation. No SDK provisioning,
credentials, EAS or provider calls. SDK36/build-tools36/NDK27.1.12297006/CMake3.22.1,
Node22 and Java17 must already exist; missing capability fails explicitly.

Same-repository GitHub-hosted context only. Actual checkout HEAD must equal
GITHUB_SHA; full tree, clean state and origin are checked. PR head/base are separate
and must match actual merge parents; stale base/head or synthetic same-tree but
unexpected SHA does not pass. Manual events retain actual selected checkout.
No remote ref is fetched or written by this intake; it consumes the existing
supported checkout and makes a local shared clone without submodule initialization.
Tracked source cannot change during prebuild. Build receipt hashes lock, recipe,
APK and actual source/tree. This is unsigned emulator QA, not store parity.

QA runtime overlay: offline true, demo false, simulator-no-MLKit1; no sharing,
Leagues/native-link/store flag override. Product source defaults remain. This differs
from5c81's sharing-on smoke and is explicitly NOT native Join acceptance.

Exactly one already-created emulator, fresh target package, stable boot required.
Owned emulator viewport is set/read at1080x2400/480dpi; original viewport and scale
are read first and restored/read back in finally without resetting app data or
restarting adb. Source/API35 input formats fail closed. Release APK install hash
is checked. Both1.0/1.3 cold ordinary app launches execute guarded Home and wizard
navigation; OS Settings and resumed Activity configuration are checked before/after
capture and recorded. They are not initialized RN measurements. An immediate
unready Home/scene is a hard stop, not a guessed wait/click. Native runtime unrun.

Outputs in workflow upload dir: synthetic PNGs and bounded receipts only. No APK,
raw hierarchy, command logs, device IDs or credentials. Private build/log directory
is outside upload and scoped to the job. All raw tool errors are classified.

Geometry output is now connected to the actual validator; see GEOMETRY_OUTPUT.md.
Missing measured insets and configured scenes yield real validation errors, not
the previous fixed NOT_IMPLEMENTED result. Keyboard, RN scale, independent vision
and online Join remain unproven. Budget remains the existing 30min job.

Offline replay:
python3 -B -m unittest discover -s scoresnap/e2e/device-layout/scripts/checkpoint -p 'test_*.py'
node --test scoresnap/e2e/device-layout/lib/*.test.mjs
The real orchestrator is mocked at external subprocess/device boundaries only;
phase replay verifies two lanes, restoration and required red. Existing bundle
positive/stale checks remain parser fixtures, no longer fake Android successes.
