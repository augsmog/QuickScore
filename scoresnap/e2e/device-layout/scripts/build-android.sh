#!/usr/bin/env bash
# AUG-1376 — build the SnapScore Android APK from the checked-out SHA, for the device-layout gate's
# Android compact leg (ubuntu-latest KVM, reactivecircus/android-emulator-runner).
#
# RELEASE variant, signed with the Expo-generated debug keystore (the prebuild template points the
# release signingConfig at signingConfigs.debug), so the APK is SELF-CONTAINED: the JS bundle is
# embedded (assembleRelease runs bundleReleaseJsAndAssets) and it installs/boots on the emulator
# with no Metro/dev-client server. A debug APK would need a running Metro bundler and never reaches
# onboarding on CI — the root cause of the earlier all-flows-failed Android run. No minify/proguard
# (enableProguardInReleaseBuilds=false by default) so testIDs survive. Same offline feature flags as
# the iOS build so captures match. Built for the emulator ABI only (x86_64) to stay well under the
# 30-min job cap. No EAS.
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
echo "device-layout: building Android release (self-contained, debug-signed) APK at $SOURCE_SHA"

export SENTRY_DISABLE_AUTO_UPLOAD=true
export EXPO_PUBLIC_SIMULATOR_NO_MLKIT=1
export EXPO_PUBLIC_OFFLINE_MODE=true
export EXPO_PUBLIC_DEMO_MODE=false
export EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING="${DEVICE_LAYOUT_JOIN_FLAG:+true}"  # join hidden unless flag on
export EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true
export EXPO_PUBLIC_E2E_COURSE_FIXTURE=true
# Keep the Gradle daemon lean on the hosted runner; enable the build cache for warm reruns.
export GRADLE_OPTS="-Dorg.gradle.daemon=false -Dorg.gradle.jvmargs=-Xmx3g"

cd "$ROOT/scoresnap"
if [ ! -d node_modules ]; then
  npm ci
fi

npx expo prebuild --platform android --clean --no-install

cd android
chmod +x ./gradlew
# assembleRelease = self-contained (JS bundled, debug-keystore signed). Restrict to the emulator ABI
# (x86_64) so we build one architecture instead of four, and turn on the Gradle build cache. Hard
# 20-min cap with progress so a hung build fails fast with a log instead of eating the job timeout.
BUILD_TIMEOUT_S="${DEVICE_LAYOUT_ANDROID_BUILD_TIMEOUT_S:-1200}"
GRADLE_LOG="$OUTROOT/android-gradle.log"
set +e
./gradlew :app:assembleRelease \
  -PreactNativeArchitectures=x86_64 \
  --no-daemon --build-cache --stacktrace > "$GRADLE_LOG" 2>&1 &
GPID=$!
waited=0
while kill -0 "$GPID" 2>/dev/null; do
  sleep 20; waited=$((waited+20))
  echo "device-layout: gradle assembleRelease running ${waited}s … $(tail -1 "$GRADLE_LOG" 2>/dev/null)"
  if [ "$waited" -ge "$BUILD_TIMEOUT_S" ]; then
    echo "::error::gradle assembleRelease exceeded ${BUILD_TIMEOUT_S}s — killing; last 60 log lines:"
    kill -9 "$GPID" 2>/dev/null; wait "$GPID" 2>/dev/null
    tail -60 "$GRADLE_LOG"; exit 1
  fi
done
wait "$GPID"; RC=$?
set -e
if [ "$RC" -ne 0 ]; then echo "::error::gradle assembleRelease failed rc=$RC; last 80 log lines:"; tail -80 "$GRADLE_LOG"; exit 1; fi
echo "device-layout: gradle assembleRelease done in ${waited}s"

APK_PATH="$(find app/build/outputs/apk/release -maxdepth 1 -type f -name '*.apk' -print -quit)"
test -n "$APK_PATH" && test -f "$APK_PATH"
APK_ABS="$(cd "$(dirname "$APK_PATH")" && pwd)/$(basename "$APK_PATH")"
printf '%s\n' "$APK_ABS" > "$OUTROOT/android-apk-path.txt"
( shasum -a 256 "$APK_ABS" 2>/dev/null || sha256sum "$APK_ABS" ) | awk '{print $1}' > "$OUTROOT/android-build-hash.txt"
echo "device-layout: built $APK_ABS (hash $(cat "$OUTROOT/android-build-hash.txt"))"
