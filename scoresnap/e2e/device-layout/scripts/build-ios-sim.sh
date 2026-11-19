#!/usr/bin/env bash
# AUG-1376 — build the SnapScore iOS *simulator* app (Release) from the checked-out SHA, for the
# device-layout gate's iOS legs on the self-hosted Mac mini (labels self-hosted, ios-sim).
#
# Mirrors the proven offline source-build path in .github/workflows/e2e-ios-sim.yml so there is one
# build recipe. No EAS build, no submission, no App Store Connect. Caches pods + DerivedData under
# a persistent cache dir so repeated PR runs stay fast.
#
# Writes the built .app path to $OUTROOT/ios-app-path.txt for the orchestrator (run-ios-sim.sh).
set -euo pipefail
cd "$(dirname "$0")/.."            # scoresnap/e2e/device-layout
ROOT="$(cd ../../.. && pwd)"
OUTROOT="${DEVICE_LAYOUT_OUT:-$ROOT/device-layout-out}"
CACHE="${DEVICE_LAYOUT_CACHE:-$HOME/.cache/device-layout}"
mkdir -p "$OUTROOT" "$CACHE"

# Self-hosted Mac mini: do not assume the login shell. openjdk@17 is only needed by Maestro
# downstream, but keep PATH consistent across build + run.
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"

SOURCE_SHA="$(git -C "$ROOT" rev-parse HEAD)"
if [ -n "${GITHUB_SHA:-}" ] && [ "$SOURCE_SHA" != "$GITHUB_SHA" ]; then
  echo "::error::worktree SHA $SOURCE_SHA != GITHUB_SHA $GITHUB_SHA — refusing to build a stale tree"
  exit 1
fi
echo "device-layout: building iOS simulator app at $SOURCE_SHA"

# Offline device-layout profile — same flags the offline E2E build uses, so captures match prod UI.
export SENTRY_DISABLE_AUTO_UPLOAD=true
export EXPO_PUBLIC_SIMULATOR_NO_MLKIT=1
export EXPO_PUBLIC_OFFLINE_MODE=true
export EXPO_PUBLIC_DEMO_MODE=false
export EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING="${DEVICE_LAYOUT_JOIN_FLAG:+true}"  # join hidden unless flag on
export EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true
export EXPO_PUBLIC_E2E_COURSE_FIXTURE=true

cd "$ROOT/scoresnap"
if [ ! -d node_modules ]; then
  npm ci
fi

npx expo prebuild --platform ios --clean --no-install

cd ios
# Reuse a persistent CocoaPods cache to keep pod install fast across PR runs.
export CP_HOME_DIR="$CACHE/cocoapods"
pod install

xcodebuild -version
DERIVED="$CACHE/DerivedData"
xcodebuild -workspace SnapScore.xcworkspace -scheme SnapScore -configuration Release \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO build

APP_PATH="$(find "$DERIVED/Build/Products/Release-iphonesimulator" -maxdepth 2 -type d -name 'SnapScore.app' -print -quit)"
test -n "$APP_PATH" && test -d "$APP_PATH"
printf '%s\n' "$SOURCE_SHA" > "$APP_PATH/SourceCommit.txt"
printf '%s\n' "$APP_PATH" > "$OUTROOT/ios-app-path.txt"
# A build hash over the app bundle, recorded in the capture manifest for provenance.
( cd "$(dirname "$APP_PATH")" && find "$(basename "$APP_PATH")" -type f -exec shasum -a 256 {} + | shasum -a 256 | awk '{print $1}' ) > "$OUTROOT/ios-build-hash.txt"
echo "device-layout: built $APP_PATH (hash $(cat "$OUTROOT/ios-build-hash.txt"))"
