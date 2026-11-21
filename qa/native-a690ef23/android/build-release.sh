#!/usr/bin/env bash
# Execute ONLY on authorized disposable prepared checkout; no provisioning or installs.
set -euo pipefail
recipe_path="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
src=${1:?exact isolated checkout}; gradle=${2:?absolute cached trusted Gradle executable}; out=${3:?new absolute output dir}
[ "$(git -C "$src" rev-parse HEAD)" = a690ef23e67a255408028d81e57d40e09778c3eb ]
[ -z "$(git -C "$src" status --porcelain)" ]
[ -x "$gradle" ] && [ -d "$src/scoresnap/android" ] && [ -d "$src/scoresnap/node_modules" ]
command -v timeout >/dev/null
[ ! -e "$out" ]; mkdir -p "$out"
# Requires independently source-bound generated Android project and fully cached SDK/deps.
# Use an existing local Gradle binary: wrapper could download even with --offline.
export SENTRY_DISABLE_AUTO_UPLOAD=true EXPO_OFFLINE=1
export EXPO_PUBLIC_SIMULATOR_NO_MLKIT=1 EXPO_PUBLIC_OFFLINE_MODE=true EXPO_PUBLIC_DEMO_MODE=false
export EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING=true
cd "$src/scoresnap/android"
timeout --kill-after=10s 1200s "$gradle" --offline --no-daemon --no-build-cache :app:assembleRelease -PreactNativeArchitectures=x86_64 > "$out/build.log" 2>&1
[ -z "$(git -C "$src" status --porcelain)" ]
python3 - "$src" "$out" "$recipe_path" <<'PY'
import pathlib,sys,hashlib,json
src,out,recipe=map(pathlib.Path,sys.argv[1:]);apks=list((src/'scoresnap/android/app/build/outputs/apk/release').glob('*.apk'))
assert len(apks)==1,'exactly one Release APK required'
b=apks[0].read_bytes();(out/'candidate.apk').write_bytes(b)
(out/'build.json').write_text(json.dumps({'sourceSha':'a690ef23e67a255408028d81e57d40e09778c3eb','sourceTree':'ba833845c2f2cfbacdecc3ee847e74c4fcfd90b7','apkSha256':hashlib.sha256(b).hexdigest(),'recipeSha256':hashlib.sha256(recipe.read_bytes()).hexdigest(),'variant':'release','offline':True,'nativeAcceptance':False},indent=2)+'\n')
PY
