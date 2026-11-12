#!/usr/bin/env bash
# Inode plan phase C pilot (AUG-227): shared-store pnpm install in a DISPOSABLE copy.
# Usage: AOS_PNPM_STORE=/abs/store AOS_PILOT_OUTPUT=/abs/new-dir run.sh [js|native]
#   js      install + hardlink/native-module probes + Jest + iOS JS export (Linux or macOS)
#   native  js, then expo prebuild + pod install + xcodebuild simulator build (macOS only)
# Never touches the source checkout: no packageManager pin, no lockfile written there,
# no existing node_modules removed. The pnpm lockfile is derived from package-lock.json
# inside the copy, so npm stays the single source of truth for versions.
set -euo pipefail
MODE="${1:-js}"
case "$MODE" in js|native) ;; *) echo "mode must be js or native" >&2; exit 64;; esac
: "${AOS_PNPM_STORE:?Set an absolute same-filesystem shared store path}"
: "${AOS_PILOT_OUTPUT:?Set an absolute path for disposable output for this run}"
case "$AOS_PNPM_STORE" in /*) ;; *) echo "AOS_PNPM_STORE must be absolute" >&2; exit 64;; esac
case "$AOS_PILOT_OUTPUT" in /*) ;; *) echo "AOS_PILOT_OUTPUT must be absolute" >&2; exit 64;; esac
if [ "$MODE" = native ] && [ "$(uname -s)" != Darwin ]; then
  echo "native mode needs macOS with Xcode and CocoaPods" >&2; exit 64
fi
PNPM_VERSION=10.34.6
INODE_CAP="${AOS_PILOT_INODE_CAP:-0.78}"
read -r -a PNPM <<<"${AOS_PNPM_CMD:-pnpm}"
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RUN="$AOS_PILOT_OUTPUT/checkout"
if [ -e "$RUN" ]; then echo "refusing to reuse $RUN; give each run its own output path" >&2; exit 65; fi

inode_guard() {
  python3 - "$1" "$INODE_CAP" <<'PY'
import os, sys
s = os.statvfs(sys.argv[1]); cap = float(sys.argv[2])
used = 1 - s.f_ffree / s.f_files if s.f_files else 0.0
if used >= cap:
    sys.exit(f"inode use {used:.4f} >= cap {cap}; refusing")
PY
}

mkdir -p "$AOS_PNPM_STORE" "$AOS_PILOT_OUTPUT"
inode_guard "$AOS_PILOT_OUTPUT"
python3 - "$AOS_PNPM_STORE" "$AOS_PILOT_OUTPUT" <<'PY'
import os, sys
a, b = (os.stat(p).st_dev for p in sys.argv[1:3])
if a != b:
    sys.exit("hardlinks require the store and the output on one filesystem")
PY
[ "$("${PNPM[@]}" --version)" = "$PNPM_VERSION" ] || { echo "pnpm $PNPM_VERSION required" >&2; exit 65; }

REPO_DIR="$(git -C "$APP_DIR" rev-parse --show-toplevel)"
APP_REL="${APP_DIR#"$REPO_DIR"/}"
SOURCE_SHA="$(git -C "$REPO_DIR" rev-parse HEAD)"

# Disposable copy of tracked files only (working-tree content, no node_modules, no .git).
mkdir "$RUN"
(cd "$REPO_DIR" && git ls-files -z | tar --null -T - -cf -) | tar -xf - -C "$RUN"
cd "$RUN/$APP_REL"
test ! -e node_modules && test ! -e pnpm-lock.yaml

PNPM_CFG=(--config.node-linker=hoisted --config.package-import-method=hardlink)
"${PNPM[@]}" import >"$AOS_PILOT_OUTPUT/pnpm-import.log" 2>&1
"${PNPM[@]}" install --frozen-lockfile --store-dir="$AOS_PNPM_STORE" "${PNPM_CFG[@]}" \
  >"$AOS_PILOT_OUTPUT/pnpm-install.log" 2>&1

AOS_PILOT_MODE="$MODE" AOS_SOURCE_SHA="$SOURCE_SHA" node - <<'JS'
const fs = require('node:fs');
const path = require('node:path');
let files = 0, linked = 0, dirs = 0;
(function scan(dir) {
  dirs++;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) scan(p);
    else if (item.isFile()) { files++; if (fs.statSync(p).nlink > 1) linked++; }
  }
})('node_modules');
if (!linked) throw new Error('No imported hardlinks found');
const resolver = require('unrs-resolver');
if (typeof resolver.ResolverFactory !== 'function') throw new Error('Native resolver missing');
require('esbuild').transformSync('const nativeProbe = 1');
fs.writeFileSync(path.join(process.env.AOS_PILOT_OUTPUT, 'install-receipt.json'), JSON.stringify({
  schema: 'inode-pnpm-pilot/1', mode: process.env.AOS_PILOT_MODE, sourceSha: process.env.AOS_SOURCE_SHA,
  platform: process.platform, nodeModules: { files, dirs, hardlinkedFiles: linked,
  uniqueInodesIfStoreShared: dirs + (files - linked) }, nativeResolver: true, esbuild: true,
}, null, 2) + '\n');
JS

AOS_PILOT_COPY=1 JEST_CACHE_DIR="$AOS_PILOT_OUTPUT/jest-cache" "${PNPM[@]}" exec jest --runInBand \
  >"$AOS_PILOT_OUTPUT/jest.log" 2>&1 || {
    grep -E '^(FAIL|Tests:)' "$AOS_PILOT_OUTPUT/jest.log" | sort -u >&2
    # Host-only failures (for example macOS bash 3.2) may be waived explicitly; never by default.
    [ "${AOS_PILOT_ALLOW_JEST_FAIL:-0}" = 1 ] || exit 1
    echo "PILOT_JEST_FAILURES_WAIVED" >&2
  }
inode_guard "$AOS_PILOT_OUTPUT"
"${PNPM[@]}" exec expo export --platform ios --no-bytecode --output-dir="$AOS_PILOT_OUTPUT/ios-js" \
  >"$AOS_PILOT_OUTPUT/expo-export.log" 2>&1 || { tail -40 "$AOS_PILOT_OUTPUT/expo-export.log" >&2; exit 1; }
echo "PILOT_JS_OK $(grep -E '^Tests:' "$AOS_PILOT_OUTPUT/jest.log" | tail -1)"

if [ "$MODE" = native ]; then
  # Same steps as .github/workflows/e2e-ios-sim.yml "Build simulator app from source".
  export CI=1 SENTRY_DISABLE_AUTO_UPLOAD=true EXPO_PUBLIC_SIMULATOR_NO_MLKIT=1 EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true
  "${PNPM[@]}" exec expo prebuild --platform ios --clean --no-install >"$AOS_PILOT_OUTPUT/prebuild.log" 2>&1 \
    || { tail -40 "$AOS_PILOT_OUTPUT/prebuild.log" >&2; exit 1; }
  cd ios
  pod install >"$AOS_PILOT_OUTPUT/pod-install.log" 2>&1 || { tail -40 "$AOS_PILOT_OUTPUT/pod-install.log" >&2; exit 1; }
  inode_guard "$AOS_PILOT_OUTPUT"
  xcodebuild -workspace SnapScore.xcworkspace -scheme SnapScore -configuration Release \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath "$AOS_PILOT_OUTPUT/DerivedData" \
    CODE_SIGNING_ALLOWED=NO build >"$AOS_PILOT_OUTPUT/xcodebuild.log" 2>&1 \
    || { grep -E "error:|BUILD FAILED" "$AOS_PILOT_OUTPUT/xcodebuild.log" | tail -40 >&2; exit 1; }
  grep -q '\*\* BUILD SUCCEEDED \*\*' "$AOS_PILOT_OUTPUT/xcodebuild.log"
  APP_PATH="$(find "$AOS_PILOT_OUTPUT/DerivedData/Build/Products/Release-iphonesimulator" -maxdepth 2 -type d -name 'SnapScore.app' -print -quit)"
  test -n "$APP_PATH" && test -f "$APP_PATH/SnapScore" && test -f "$APP_PATH/main.jsbundle"
  { xcodebuild -version | tr '\n' ' '; echo; pod --version; echo "app=$APP_PATH"; echo "source=$SOURCE_SHA"; } \
    >"$AOS_PILOT_OUTPUT/native-receipt.txt"
  echo "PILOT_NATIVE_OK $(xcodebuild -version | head -1) SnapScore.app built from pnpm hoisted hardlink install"
fi
