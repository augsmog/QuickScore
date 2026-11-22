# API35 inset provider — private, native execution unrun

Base b599b6e2a0c14c74c303beb9ab2a0132734c5501. Test-only integration;
no product instrumentation, settings, workflow, rule or configuration changes.

The existing guarded foreground read uses WMS default-display focus and the
uniquely resumed Activity. The new provider additionally requires the exact focused
Window token, one matching app WindowState, a stable full-screen current/last frame,
visible/on-screen status, one active non-transitioning ViewRoot and its client
InsetsController. WMS and client InsetsState geometry/visibility must agree.
Raw commands remain bounded read-only dumpsys window windows/displays and activity
top on the already-selected serial. No raw dump is written or emitted.

AOSP android-15.0.0_r1 contracts used (source-derived fixtures, NOT archived runs):
- services/core/java/com/android/server/wm/WindowFrames.java:172–177
  https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/services/core/java/com/android/server/wm/WindowFrames.java
- core/java/android/view/ViewRootImpl.java:8969–9027 and InsetsController.java:1856–1861
  https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/core/java/android/view/ViewRootImpl.java
  https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/core/java/android/view/InsetsController.java
- InsetsState.java:607–618 and InsetsSource.java:266–326,545–557
  https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/core/java/android/view/InsetsState.java
  https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/core/java/android/view/InsetsSource.java

Policy is intentionally a restricted subset: default display, full-screen window,
zero observed cutout/waterfall, visible full-edge status/navigation sources, stable
client/server state. Hidden sources are explicitly observed, not assumed absent.
Missing required status/nav/IME records, duplicate IDs/types, foreign focus,
unreadable records, conflicts, non-edge/floating geometry, nontrivial bounding
rectangles/flags, resize/transition or nonzero cutout fail with a bounded typed code.
No desired category or hardcoded 24dp/zero safe area is substituted. Actual pixels
are divided by the separately measured density; zero sides mean no admitted visible
edge source intersects them. System-gesture/tappable regions are not visual bars.

These are conservative visible system-bar avoidance insets in global screenshot
coordinates, NOT proof of opaque paint, RN safe-area consumption, rendered text
metrics or initialized RN scale. The receipt explicitly marks those style limits.
IME has a separate visible/framePx record; its height is NEVER added to static
safeArea. A visible IME is currently accepted only when full-width/bottom-edge and
the app window remains full-screen. Before/after capture compares the entire
observation, including inset geometry, window/Activity hashes, keyboard and scale;
existing boot, APK, source, hierarchy and PNG checks remain required.

geometry_output.mjs independently checks provider identity, viewport/density,
recomputes the safe-area derivation and verifies separate keyboard provenance.
Missing provider data from historical receipts still produces schema failure.
The unchanged real validator now admits valid inset context in the portable
positive; it STILL rejects missing configured checkpoints. No native acceptance.

Name entry with keyboard up is now wired in KEYBOARD_CHECKPOINT.md. Its actual
native execution remains unrun and resized-window coordinates remain unsupported.
The first actual API35 readback must confirm this source-derived subset matches
the runner; no native success is inferred from portable controls.

Offline controls:
python3 -B -m unittest discover -s scoresnap/e2e/device-layout/scripts/checkpoint -p 'test_*.py'
node --test scoresnap/e2e/device-layout/scripts/checkpoint/geometry_output.test.mjs
node --test scoresnap/e2e/device-layout/lib/*.test.mjs
