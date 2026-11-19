#!/usr/bin/env bash
# AUG-1376 — device-layout gate Android compact leg. Runs inside reactivecircus/android-emulator-runner
# (ubuntu-latest KVM) with a booted emulator. Builds the debug APK, installs it, drives the discrete
# device-layout capture sub-flows, dumps `maestro hierarchy` + a screenshot at every checkpoint,
# assembles a capture manifest (with the emulator's MEASURED density + size so geometry is in real
# dp), and scores it with the deterministic geometry runner (rules 1-8). When under the wall-time
# budget it also runs a 1.3 font-scale large-text pass.
#
# Fails (exit 1) on any kept geometry finding or an empty capture — a required check never goes
# green on an empty native leg.
set -euo pipefail
cd "$(dirname "$0")/.."            # scoresnap/e2e/device-layout
DL_DIR="$(pwd)"
ROOT="$(cd ../../.. && pwd)"
FLOWS_ROOT="$ROOT/.maestro/flows/device-layout"
OUTROOT="${DEVICE_LAYOUT_OUT:-$ROOT/device-layout-out}"
export DEVICE_LAYOUT_OUT="$OUTROOT"
PROFILE="${DEVICE_LAYOUT_ANDROID_PROFILE:-android-compact}"
AX_TIME_BUDGET_S="${DEVICE_LAYOUT_AX_BUDGET_S:-900}"
START_TS="$(date +%s)"
mkdir -p "$OUTROOT"

export JAVA_HOME="${JAVA_HOME:-$JAVA_HOME_17_X64}"
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
export PATH="$HOME/.maestro/bin:$PATH"
command -v maestro >/dev/null || { curl -fsSL "https://get.maestro.mobile.dev" | bash; export PATH="$HOME/.maestro/bin:$PATH"; }

adb wait-for-device
SERIAL="$(adb devices | awk '/emulator|device$/{print $1; exit}')"
[ -n "$SERIAL" ] || { echo "::error::no adb device"; exit 1; }
echo "device-layout android: profile $PROFILE on $SERIAL ($(adb -s "$SERIAL" shell getprop ro.build.version.release | tr -d '\r') / API $(adb -s "$SERIAL" shell getprop ro.build.version.sdk | tr -d '\r'))"

# Compact ~360dp geometry: force a 360x800dp window at 480dpi so the gate always tests the worst
# crowding regardless of the base AVD.
adb -s "$SERIAL" shell wm density 480 >/dev/null 2>&1 || true
adb -s "$SERIAL" shell wm size 1080x2400 >/dev/null 2>&1 || true

# Measure what the emulator actually reports (robust to the AVD not honouring the override).
DPI="$(adb -s "$SERIAL" shell wm density | grep -oE '[0-9]+' | tail -1 | tr -d '\r')"; DPI="${DPI:-480}"
SIZE="$(adb -s "$SERIAL" shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1 | tr -d '\r')"; SIZE="${SIZE:-1080x2400}"
PXW="${SIZE%x*}"; PXH="${SIZE#*x}"
DENSITY="$(awk -v d="$DPI" 'BEGIN{printf "%.6f", d/160}')"
VPW="$(awk -v p="$PXW" -v d="$DENSITY" 'BEGIN{printf "%d", p/d}')"
VPH="$(awk -v p="$PXH" -v d="$DENSITY" 'BEGIN{printf "%d", p/d}')"
echo "device-layout android: measured dpi=$DPI size=${PXW}x${PXH} density=$DENSITY viewport=${VPW}x${VPH}dp"

# Build + install the APK for the exact SHA.
bash "$DL_DIR/scripts/build-android.sh"
APK="$(cat "$OUTROOT/android-apk-path.txt")"
BUILD_HASH="$(cat "$OUTROOT/android-build-hash.txt" 2>/dev/null || echo '')"
SOURCE_SHA="$(git -C "$ROOT" rev-parse HEAD)"
adb -s "$SERIAL" install -r -t "$APK"

capture_flows() {
  local capdir="$1" order=0 flowdir flow sub base slug
  mkdir -p "$capdir"
  for flowdir in "$FLOWS_ROOT"/*/; do
    flow="$(basename "$flowdir")"
    for sub in "$flowdir"*.yaml; do
      [ -e "$sub" ] || continue
      base="$(printf '%02d-%s-%s' "$order" "$flow" "$(basename "$sub" .yaml | sed 's/^[0-9]*-//')")"
      slug="$(basename "$sub" .yaml | sed 's/^[0-9]*-//; s/-/ /g')"
      echo "  checkpoint $base"
      if ! maestro --device "$SERIAL" test "$sub" > "$capdir/$base.maestro.log" 2>&1; then
        echo "::warning::maestro sub-flow failed: $sub"
        tail -20 "$capdir/$base.maestro.log" || true
      fi
      maestro --device "$SERIAL" hierarchy > "$capdir/$base.hierarchy.json" 2>/dev/null || echo '{"attributes":{},"children":[]}' > "$capdir/$base.hierarchy.json"
      adb -s "$SERIAL" exec-out screencap -p > "$capdir/$base.png" 2>/dev/null || true
      printf '{"flow":"%s","checkpoint":"%s","screen":"%s","state":"default"}\n' "$flow" "$slug" "$flow" > "$capdir/$base.ctx.json"
      order=$((order+1))
    done
  done
}

FAIL=0
CAP="$OUTROOT/$PROFILE"
capture_flows "$CAP"
node "$DL_DIR/scripts/make-capture-manifest.mjs" "$CAP" --profile "$PROFILE" --platform android \
  --source-sha "$SOURCE_SHA" --build-hash "$BUILD_HASH" --density "$DENSITY" --viewport-w "$VPW" --viewport-h "$VPH"
node "$DL_DIR/scripts/bundle-from-maestro.mjs" "$CAP" --platform android --profile "$PROFILE" --out "$CAP/bundle.json"
if ! node "$DL_DIR/run-geometry.mjs" "$CAP/bundle.json" --waivers "$DL_DIR/waivers.json" --out "$CAP/findings.json"; then
  echo "::error::device-layout geometry findings on $PROFILE"
  FAIL=1
fi

ELAPSED=$(( $(date +%s) - START_TS ))
if [ "$ELAPSED" -lt "$AX_TIME_BUDGET_S" ]; then
  echo "--- $PROFILE large-text pass (font_scale 1.3, elapsed ${ELAPSED}s) ---"
  adb -s "$SERIAL" shell settings put system font_scale 1.3 >/dev/null 2>&1 || true
  CAPAX="$OUTROOT/$PROFILE-large-text"
  capture_flows "$CAPAX"
  node "$DL_DIR/scripts/make-capture-manifest.mjs" "$CAPAX" --profile "$PROFILE" --platform android \
    --source-sha "$SOURCE_SHA" --build-hash "$BUILD_HASH" --density "$DENSITY" --viewport-w "$VPW" --viewport-h "$VPH" --font-scale 1.3
  node "$DL_DIR/scripts/bundle-from-maestro.mjs" "$CAPAX" --platform android --profile "$PROFILE" --out "$CAPAX/bundle.json"
  if ! node "$DL_DIR/run-geometry.mjs" "$CAPAX/bundle.json" --waivers "$DL_DIR/waivers.json" --out "$CAPAX/findings.json"; then
    echo "::error::device-layout large-text geometry findings on $PROFILE"
    FAIL=1
  fi
  adb -s "$SERIAL" shell settings put system font_scale 1.0 >/dev/null 2>&1 || true
fi

[ "$FAIL" -eq 0 ] && echo "device-layout android: PASS" || echo "device-layout android: FAIL"
exit "$FAIL"
