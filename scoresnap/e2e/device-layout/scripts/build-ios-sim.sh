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

# --- App-build cache (AUG-1376 round 3) ---------------------------------------------------------
# The ~15-min cold build (expo prebuild --clean + pod install + xcodebuild Release) only needs to
# run when the APP source or the build recipe changes. Fingerprint every tracked file under
# scoresnap EXCEPT e2e/device-layout (the gate's own code) and node_modules, plus the recipe env
# that alters the binary. A device-layout-only PR (like this one) leaves the app bytes identical, so
# the cached .app is valid candidate evidence and we skip the rebuild. Fail-safe: ANY miss, empty
# hash, or missing cached bundle falls through to a full build (today's behavior), so the cache can
# only speed the build up, never produce a stale or broken one.
RECIPE="xdev=${DEVICE_LAYOUT_JOIN_FLAG:-};course=1;e2efixture=1;offline=1;nomlkit=1"
app_source_fingerprint() {
  ( cd "$ROOT" && git ls-files -s -- scoresnap \
      ':(exclude)scoresnap/e2e/device-layout' \
      ':(exclude)scoresnap/node_modules' 2>/dev/null ) | git hash-object --stdin 2>/dev/null
}
APP_HASH="$( { printf '%s\n' "$RECIPE"; app_source_fingerprint; } | git hash-object --stdin 2>/dev/null || true )"
APP_CACHE_DIR="$CACHE/app-build/$APP_HASH"
CACHED_APP="$APP_CACHE_DIR/SnapScore.app"
emit_app_provenance() {  # $1 = .app path → rebind provenance to the CURRENT candidate SHA
  local app="$1"
  printf '%s\n' "$SOURCE_SHA" > "$app/SourceCommit.txt"
  printf '%s\n' "$app" > "$OUTROOT/ios-app-path.txt"
  ( cd "$(dirname "$app")" && find "$(basename "$app")" -type f -exec shasum -a 256 {} + | shasum -a 256 | awk '{print $1}' ) > "$OUTROOT/ios-build-hash.txt"
}
if [ -n "$APP_HASH" ] && [ -d "$CACHED_APP" ] && [ -x "$CACHED_APP/SnapScore" ]; then
  echo "device-layout: reusing cached iOS app build (app-hash ${APP_HASH:0:12}; app source + recipe unchanged — skipping prebuild/pod/xcodebuild)"
  emit_app_provenance "$CACHED_APP"
  echo "device-layout: cached $CACHED_APP (hash $(cat "$OUTROOT/ios-build-hash.txt"))"
  exit 0
fi
echo "device-layout: no cached build for app-hash ${APP_HASH:-<none>} — cold build"
# -----------------------------------------------------------------------------------------------

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
# xcodebuild can sit silent for many minutes on a cold Release build; stream it to a log we upload
# and print a heartbeat every 30s, under a hard 20-min cap so a wedged build fails fast with a tail
# instead of silently burning the 45-min job. (The earlier run printed nothing for ~25 min.)
BUILD_LOG="$OUTROOT/ios-xcodebuild.log"
BUILD_TIMEOUT_S="${DEVICE_LAYOUT_IOS_BUILD_TIMEOUT_S:-1200}"
echo "device-layout: xcodebuild Release (simulator) → $BUILD_LOG (cap ${BUILD_TIMEOUT_S}s)"
set +e
xcodebuild -workspace SnapScore.xcworkspace -scheme SnapScore -configuration Release \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO build > "$BUILD_LOG" 2>&1 &
XPID=$!
waited=0
while kill -0 "$XPID" 2>/dev/null; do
  sleep 30; waited=$((waited+30))
  echo "device-layout: xcodebuild running ${waited}s … $(tail -1 "$BUILD_LOG" 2>/dev/null)"
  if [ "$waited" -ge "$BUILD_TIMEOUT_S" ]; then
    echo "::error::xcodebuild exceeded ${BUILD_TIMEOUT_S}s — killing; last 60 log lines:"
    kill -9 "$XPID" 2>/dev/null; wait "$XPID" 2>/dev/null
    tail -60 "$BUILD_LOG"; exit 1
  fi
done
wait "$XPID"; RC=$?
set -e
if [ "$RC" -ne 0 ]; then echo "::error::xcodebuild failed rc=$RC; last 80 log lines:"; tail -80 "$BUILD_LOG"; exit 1; fi
echo "device-layout: xcodebuild done in ${waited}s"

APP_PATH="$(find "$DERIVED/Build/Products/Release-iphonesimulator" -maxdepth 2 -type d -name 'SnapScore.app' -print -quit)"
test -n "$APP_PATH" && test -d "$APP_PATH"
emit_app_provenance "$APP_PATH"
echo "device-layout: built $APP_PATH (hash $(cat "$OUTROOT/ios-build-hash.txt"))"

# Populate the app-build cache for the next run (this PR re-pushes / the next device-layout PR reuses
# it). Keep only the two most recent entries so the persistent runner's inode/byte use stays bounded.
if [ -n "$APP_HASH" ]; then
  mkdir -p "$APP_CACHE_DIR"
  rm -rf "$APP_CACHE_DIR/SnapScore.app.tmp"
  if cp -R "$APP_PATH" "$APP_CACHE_DIR/SnapScore.app.tmp" 2>/dev/null; then
    rm -rf "$CACHED_APP"; mv "$APP_CACHE_DIR/SnapScore.app.tmp" "$CACHED_APP"
    echo "device-layout: cached app build under $APP_CACHE_DIR"
    ls -1dt "$CACHE/app-build"/*/ 2>/dev/null | tail -n +3 | xargs -r rm -rf
  else
    rm -rf "$APP_CACHE_DIR/SnapScore.app.tmp"
    echo "::warning::could not populate app-build cache (continuing)"
  fi
fi
