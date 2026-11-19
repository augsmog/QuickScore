#!/usr/bin/env bash
# AUG-1376 — build the SnapScore Android debug APK from the checked-out SHA, for the device-layout
# gate's Android compact leg (ubuntu-latest KVM, reactivecircus/android-emulator-runner).
#
# Debug APK (not release) so it installs on the emulator with no signing config and assembles well
# under the 25-min job budget. Same offline feature flags as the iOS build so captures match. No EAS.
#
# Writes the APK path to $OUTROOT/android-apk-path.txt for the orchestrator (run-android-compact.sh).
set -euo pipefail
cd "$(dirname "$0")/.."            # scoresnap/e2e/device-layout
ROOT="$(cd ../../.. && pwd)"
OUTROOT="${DEVICE_LAYOUT_OUT:-$ROOT/device-layout-out}"
mkdir -p "$OUTROOT"

SOURCE_SHA="$(git -C "$ROOT" rev-parse HEAD)"
if [ -n "${GITHUB_SHA:-}" ] && [ "$SOURCE_SHA" != "$GITHUB_SHA" ]; then
  echo "::error::worktree SHA $SOURCE_SHA != GITHUB_SHA $GITHUB_SHA — refusing to build a stale tree"
  exit 1
fi
echo "device-layout: building Android debug APK at $SOURCE_SHA"

export SENTRY_DISABLE_AUTO_UPLOAD=true
export EXPO_PUBLIC_SIMULATOR_NO_MLKIT=1
export EXPO_PUBLIC_OFFLINE_MODE=true
export EXPO_PUBLIC_DEMO_MODE=false
export EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING="${DEVICE_LAYOUT_JOIN_FLAG:+true}"  # join hidden unless flag on
export EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true
export EXPO_PUBLIC_E2E_COURSE_FIXTURE=true
# Keep the Gradle daemon lean on the hosted runner.
export GRADLE_OPTS="-Dorg.gradle.daemon=false -Dorg.gradle.jvmargs=-Xmx3g"

cd "$ROOT/scoresnap"
if [ ! -d node_modules ]; then
  npm ci
fi

npx expo prebuild --platform android --clean --no-install

cd android
chmod +x ./gradlew
./gradlew :app:assembleDebug --no-daemon --stacktrace

APK_PATH="$(find app/build/outputs/apk/debug -maxdepth 1 -type f -name '*.apk' -print -quit)"
test -n "$APK_PATH" && test -f "$APK_PATH"
APK_ABS="$(cd "$(dirname "$APK_PATH")" && pwd)/$(basename "$APK_PATH")"
printf '%s\n' "$APK_ABS" > "$OUTROOT/android-apk-path.txt"
( shasum -a 256 "$APK_ABS" 2>/dev/null || sha256sum "$APK_ABS" ) | awk '{print $1}' > "$OUTROOT/android-build-hash.txt"
echo "device-layout: built $APK_ABS (hash $(cat "$OUTROOT/android-build-hash.txt"))"
