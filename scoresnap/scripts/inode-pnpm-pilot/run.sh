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
INODE_CAP="${AOS_PILOT_INODE_CAP:-0.76}"
read -r -a PNPM <<<"${AOS_PNPM_CMD:-pnpm}"
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
REPO_DIR="$(git -C "$APP_DIR" rev-parse --show-toplevel)"
APP_REL="${APP_DIR#"$REPO_DIR"/}"
SOURCE_SHA="$(git -C "$REPO_DIR" rev-parse HEAD)"
# HEAD provenance is valid only for a clean tracked source; untracked files are not copied.
RUN="$AOS_PILOT_OUTPUT/checkout"

inode_guard() {
  python3 - "$1" "$INODE_CAP" <<'PYGUARD'
import math, os, sys
from pathlib import Path
cap = float(sys.argv[2])
if not math.isfinite(cap) or not 0 < cap <= .76:
    sys.exit("inode cap must be finite and 0 < cap <= 0.76")
p = Path(sys.argv[1])
while not p.exists(): p = p.parent
s = os.statvfs(p)
if s.f_files <= 0 or not 0 <= s.f_ffree <= s.f_files:
    sys.exit("invalid inode counters; refusing")
used = 1 - s.f_ffree / s.f_files
if used >= cap:
    sys.exit(f"inode use {used:.4f} >= cap {cap}; refusing")
PYGUARD
}

# Validate before mkdir, clone or package commands. Canonicalize every ancestor too.
python3 - "$REPO_DIR" "$AOS_PNPM_STORE" "$AOS_PILOT_OUTPUT" <<'PYPATH'
import os, sys
from pathlib import Path
source, store, output = map(Path, sys.argv[1:])
if os.path.lexists(output):
    sys.exit("refusing to reuse output path")
for p in (store, output):
    if any(q.is_symlink() for q in (p, *p.parents)):
        sys.exit("symlink destination or ancestor; refusing")
paths = [p.resolve() for p in (source, store, output)]
for i, a in enumerate(paths):
    for b in paths[i + 1:]:
        if a == b or a in b.parents or b in a.parents:
            sys.exit("source, store and output must not overlap")
if store.exists() and not store.is_dir():
    sys.exit("store must be a directory")
PYPATH
inode_guard "$AOS_PILOT_OUTPUT"
inode_guard "$AOS_PNPM_STORE"
mkdir -p "$AOS_PNPM_STORE" "$(dirname "$AOS_PILOT_OUTPUT")"
mkdir "$AOS_PILOT_OUTPUT"
python3 - "$AOS_PNPM_STORE" "$AOS_PILOT_OUTPUT" <<'PYDEV'
import os, sys
if os.stat(sys.argv[1]).st_dev != os.stat(sys.argv[2]).st_dev:
    sys.exit("hardlinks require the store and the output on one filesystem")
PYDEV
[ "$("${PNPM[@]}" --version)" = "$PNPM_VERSION" ] || { echo "pnpm $PNPM_VERSION required" >&2; exit 65; }
git -C "$REPO_DIR" diff --quiet HEAD -- || { echo "tracked source must be clean" >&2; exit 65; }
inode_guard "$AOS_PILOT_OUTPUT"
# Preserve history for SHA-dependent tests without sharing source object files.
git clone --quiet --no-hardlinks --no-checkout "$REPO_DIR" "$RUN"
git -C "$RUN" reset --mixed --quiet "$SOURCE_SHA"
(cd "$REPO_DIR" && git ls-files -z | tar --null -T - -cf -) | tar -xf - -C "$RUN"
git -C "$RUN" diff --quiet HEAD -- || { echo "copy differs from source SHA" >&2; exit 65; }
cd "$RUN/$APP_REL"
test ! -e node_modules && test ! -e pnpm-lock.yaml
inode_guard "$AOS_PILOT_OUTPUT"

PNPM_CFG=(--config.node-linker=hoisted --config.package-import-method=hardlink)
"${PNPM[@]}" import >"$AOS_PILOT_OUTPUT/pnpm-import.log" 2>&1
inode_guard "$AOS_PILOT_OUTPUT"
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
    grep -E '^(FAIL|Tests:)' "$AOS_PILOT_OUTPUT/jest.log" | sort -u >&2 || true
    exit 1
  }
inode_guard "$AOS_PILOT_OUTPUT"
"${PNPM[@]}" exec expo export --platform ios --no-bytecode --output-dir="$AOS_PILOT_OUTPUT/ios-js" \
  >"$AOS_PILOT_OUTPUT/expo-export.log" 2>&1 || { tail -40 "$AOS_PILOT_OUTPUT/expo-export.log" >&2; exit 1; }
echo "PILOT_JS_OK $(grep -E '^Tests:' "$AOS_PILOT_OUTPUT/jest.log" | tail -1)"

if [ "$MODE" = native ]; then
  # Same steps as .github/workflows/e2e-ios-sim.yml "Build simulator app from source".
  export CI=1 SENTRY_DISABLE_AUTO_UPLOAD=true EXPO_PUBLIC_SIMULATOR_NO_MLKIT=1 EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true
  inode_guard "$AOS_PILOT_OUTPUT"
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
