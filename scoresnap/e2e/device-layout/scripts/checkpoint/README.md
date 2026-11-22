# Strict Android checkpoint — private restoration slice

This executable reader is not wired into the required native entrypoint. That gate
remains mandatory and incomplete. It neither builds nor installs an app, changes
scale/settings, clears state, grants permissions, nor accepts a caller's clipboard.
Use only a dedicated disposable synthetic emulator, already ordinarily navigated
to Home or setup. No production/account data is allowed in this capture lane.

Run after the independent exact-source builder produces the APK and binding:

    python3 -B android_capture.py --repo CLEAN_SOURCE --apk EXACT_APK \
      --binding BUILD_BINDING.json --serial emulator-5554 --scene home \
      --output NEW_PRIVATE_DIRECTORY

Binding has exactly source_sha, source_tree, apk_sha256, pixel_size [width,height].
The source checkout must match and be clean, local APK bytes and installed base.apk
hash must match. Split APKs are explicitly unsupported. This verifies identities,
not the honesty of an arbitrary build receipt: the trusted builder's provenance
integration remains a dependency. Component is fixed to com.scoresnap.app/.MainActivity.

Only default display0 with uniquely matching current focus and resumed Activity is
accepted. Unique enabled positive-sized Home/setup IDs must be visible in viewport,
with no foreign package/mixed scene. Hierarchy is compared before/after screenshot;
boot, installed APK and local source are rechecked. Strict equality deliberately
rejects animation; there is no sleep/retry/fallback or arbitrary PNG selection.
Command errors stop immediately. PNG signature/chunks/CRC/decoded byte count and
viewport are checked. Raw hierarchy, process/device identifiers and tools output
are not saved. Screenshot and bounded receipt are supplemental only.

Portable mocked tests: python3 -B -m unittest discover -s . -p 'test_*.py' -v
They prove orchestration/control behavior, not native evidence. Native runtime
formats, build integration and actual scene capture are unrun. Hierarchy-to-Maestro
geometry conversion, navigation flows, mandatory observed scale matrix and genuine
independent reviewer admission are next dependencies, not satisfied here. Existing
workflow, run-android-compact.sh, app and flags are unchanged.
