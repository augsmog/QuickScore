#!/usr/bin/env bash
# Android compact-AVD native leg of the device-layout gate (AUG-1380 workflow hook; AUG-1376 harness).
#
# Runs inside reactivecircus/android-emulator-runner (ubuntu-latest KVM) once an emulator is booted.
# Builds the candidate debug APK, installs it, forces a compact ~360dp window, drives the Maestro
# device-layout capture flows (one checkpoint per sub-flow, `maestro hierarchy` + screenshot after
# each), turns the capture into a candidate-bound bundle, and scores it with the deterministic
# geometry runner (rules 1–8). The baseline always verifies 1.0 font scale. When
# DEVICE_LAYOUT_LARGE_TEXT is enabled, verified 1.3 evidence is mandatory, even on budget expiry.
#
# Paths resolve from the module dir ($DL) and repo root ($ROOT); DEVICE_LAYOUT_ROOT /
# DEVICE_LAYOUT_OUT override them (lib/native-scripts.test.mjs proves the real script against a
# stub repo). Output: $DEVICE_LAYOUT_OUT/<profile>/bundle.json (+ screenshots alongside),
# candidate-bound to the checked-out SHA; uploaded by the workflow and reviewed by vision-candidate.
# Until the harness is present this fails loudly so a required check can never go green on an empty leg.
set -euo pipefail
DL="$(cd "$(dirname "$0")/.." && pwd)"   # scoresnap/e2e/device-layout
ROOT="${DEVICE_LAYOUT_ROOT:-$(cd "$DL/../../.." && pwd)}"
cd "$DL"
PROFILE="${DEVICE_LAYOUT_ANDROID_PROFILE:-android-compact}"
SHA="$(git -C "$ROOT" rev-parse HEAD)"
OUTROOT="${DEVICE_LAYOUT_OUT:-$(mktemp -d)}"
export DEVICE_LAYOUT_OUT="$OUTROOT"
FLOWS="$ROOT/.maestro/flows/device-layout"
AX_BUDGET_S="${DEVICE_LAYOUT_AX_BUDGET_S:-900}"   # latest allowed start for the required 1.3 pass
START_TS="$(date +%s)"
mkdir -p "$OUTROOT"

case "${DEVICE_LAYOUT_LARGE_TEXT:-}" in
  true|1) LARGE_TEXT=1 ;;
  false|0|"") LARGE_TEXT=0 ;;
  *) echo "::error::invalid DEVICE_LAYOUT_LARGE_TEXT; expected true, false, 1 or 0"; exit 1 ;;
esac

case "${DEVICE_LAYOUT_ANDROID_AX_ONLY_QA:-0}" in
  0) AX_ONLY=0 ;;
  1) AX_ONLY=1 ;;
  *) echo "::error::invalid standalone 1.3 Android QA mode"; exit 1 ;;
esac
if [ "$AX_ONLY" -eq 1 ]; then
  if [ "$LARGE_TEXT" -ne 1 ] ||
      [ "${GITHUB_REPOSITORY:-}" != augsmog/QuickScore ] ||
      [ "${GITHUB_EVENT_NAME:-}" != workflow_dispatch ] ||
      [ "${GITHUB_REF:-}" != refs/heads/qa/snapscore-android-ax-only ] ||
      [ "${GITHUB_JOB:-}" != android-compact ]; then
    echo "::error::standalone 1.3 Android QA requires dedicated workflow scope and DEVICE_LAYOUT_LARGE_TEXT"
    exit 1
  fi
fi

if [ ! -d "$FLOWS" ] || [ ! -f "$DL/scripts/build-android.sh" ] || [ ! -f "$DL/scripts/bundle-from-maestro.mjs" ]; then
  echo "::error::device-layout Android native harness not present yet (AUG-1376). No device capture produced."
  echo "PENDING-NATIVE-HARNESS AUG-1376"
  exit 1
fi

# Java 17 for Maestro; ensure maestro is on PATH (installs if the runner has not cached it).
export JAVA_HOME="${JAVA_HOME:-${JAVA_HOME_17_X64:-}}"
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
export PATH="$HOME/.maestro/bin:$PATH"
command -v maestro >/dev/null || { curl -fsSL "https://get.maestro.mobile.dev" | bash; export PATH="$HOME/.maestro/bin:$PATH"; }

# Portable per-flow hard cap: a hung Maestro flow fails fast (with its log) instead of eating the
# 30-min job timeout. 120s is comfortably above a healthy flow (~20s) and the onboarding sub-flow's
# own 45s+30s waits, so it only trips on a true hang.
FLOW_TIMEOUT_S="${DEVICE_LAYOUT_FLOW_TIMEOUT_S:-120}"
if command -v timeout >/dev/null 2>&1; then TIMEOUT_BIN=timeout
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN=gtimeout
else TIMEOUT_BIN=""; fi
flow_test() { local log="$1"; shift
  if [ -n "$TIMEOUT_BIN" ]; then "$TIMEOUT_BIN" "${FLOW_TIMEOUT_S}s" "$@" > "$log" 2>&1
  else "$@" > "$log" 2>&1; fi; }

adb wait-for-device
SERIAL="$(adb devices | awk '/emulator|device$/{print $1; exit}')"
[ -n "$SERIAL" ] || { echo "::error::no adb device"; exit 1; }
echo "device-layout: $PROFILE leg @ $SHA on $(adb devices | tr '\n' ' ')"

# Compact ~360dp geometry: force a 360x800dp window at 480dpi so the gate always tests the worst
# crowding regardless of the base AVD, then MEASURE what the emulator actually reports so the
# bundle carries real dp (robust to the AVD not honouring the override).
adb -s "$SERIAL" shell wm density 480 >/dev/null 2>&1 || true
adb -s "$SERIAL" shell wm size 1080x2400 >/dev/null 2>&1 || true
DPI="$(adb -s "$SERIAL" shell wm density | grep -oE '[0-9]+' | tail -1 | tr -d '\r' || true)"; DPI="${DPI:-480}"
SIZE="$(adb -s "$SERIAL" shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1 | tr -d '\r' || true)"; SIZE="${SIZE:-1080x2400}"
PXW="${SIZE%x*}"; PXH="${SIZE#*x}"
DENSITY="$(awk -v d="$DPI" 'BEGIN{printf "%.6f", d/160}')"
VPW="$(awk -v p="$PXW" -v d="$DENSITY" 'BEGIN{printf "%d", p/d}')"
VPH="$(awk -v p="$PXH" -v d="$DENSITY" 'BEGIN{printf "%d", p/d}')"
echo "device-layout: measured dpi=$DPI size=${PXW}x${PXH} density=$DENSITY viewport=${VPW}x${VPH}dp"

# A stale build receipt must not stand in for a newly built candidate. The build script emits
# the absolute APK path and the lowercase SHA-256 of its bytes; check both before any capture.
HASH_FILE="$OUTROOT/android-build-hash.txt"
APK_FILE="$OUTROOT/android-apk-path.txt"
for receipt in "$HASH_FILE" "$APK_FILE"; do
  if [ -e "$receipt" ] || [ -L "$receipt" ]; then
    echo "::error::refusing to reuse Android build receipt $receipt; choose a fresh DEVICE_LAYOUT_OUT"
    exit 1
  fi
done
bash "$DL/scripts/build-android.sh"
if [ ! -s "$APK_FILE" ] || [ ! -f "$APK_FILE" ] || [ -L "$APK_FILE" ]; then
  echo "::error::missing fresh Android APK path receipt"
  exit 1
fi
APK="$(cat "$APK_FILE")"
if [[ "$APK" != /*.apk ]] || [[ "$APK" == *$'\n'* ]] || [[ "$APK" == *$'\r'* ]] ||
    [ ! -f "$APK" ] || [ ! -s "$APK" ] || [ -L "$APK" ]; then
  echo "::error::Android APK path must name an absolute, nonempty regular .apk file"
  exit 1
fi
if [ ! -s "$HASH_FILE" ] || [ ! -f "$HASH_FILE" ] || [ -L "$HASH_FILE" ]; then
  echo "::error::missing fresh Android APK hash receipt"
  exit 1
fi
BUILD_HASH="$(cat "$HASH_FILE")"
if [[ ! "$BUILD_HASH" =~ ^[a-f0-9]{64}$ ]]; then
  echo "::error::Android APK build hash must be a lowercase SHA-256 digest"
  exit 1
fi
actual_hash="$(node -e '
  const fs = require("node:fs"), crypto = require("node:crypto");
  const fd = fs.openSync(process.argv[1], "r");
  const header = Buffer.alloc(4);
  const read = fs.readSync(fd, header, 0, header.length, 0);
  if (read !== header.length || header.toString("hex") !== "504b0304") {
    fs.closeSync(fd);
    throw new Error("Android APK has no ZIP local file header");
  }
  const hash = crypto.createHash("sha256");
  const input = fs.createReadStream(process.argv[1], { fd, start: 0 });
  input.on("data", chunk => hash.update(chunk));
  input.on("end", () => console.log(hash.digest("hex")));
' "$APK")"
if [ "$actual_hash" != "$BUILD_HASH" ]; then
  echo "::error::Android APK SHA-256 does not match the candidate build receipt"
  exit 1
fi
if ! install_result="$(adb -s "$SERIAL" install -r -t "$APK" 2>&1)" ||
    ! printf '%s\n' "$install_result" | tr -d '\r' | grep -qx 'Success'; then
  printf '::error::candidate Android APK install failed\n%s\n' "$install_result"
  exit 1
fi

# A capture label records the verified device-wide setting, not the app's rendered text size.
# Compare numerically (e.g. 1.30 is 1.3) after stripping adb's trailing CR/LF.
verify_font_scale() {
  local expected="$1" actual
  if ! actual="$(adb -s "$SERIAL" shell settings get system font_scale)"; then
    echo "::error::device-layout could not read Android font_scale (expected $expected)"
    return 1
  fi
  if ! LC_ALL=C awk -v actual="$actual" -v expected="$expected" 'BEGIN {
    gsub(/[[:space:]]+$/, "", actual)
    if (actual !~ /^[0-9]+([.][0-9]+)?$/ || (actual+0)!=(expected+0)) exit 1
  }'; then
    echo "::error::device-layout Android font_scale readback mismatch (expected $expected)"
    return 1
  fi
}
set_font_scale() {
  local expected="$1"
  if ! adb -s "$SERIAL" shell settings put system font_scale "$expected" >/dev/null; then
    echo "::error::device-layout could not set Android font_scale to $expected"
    return 1
  fi
  verify_font_scale "$expected"
}
restore_baseline() {
  local status=$?
  if ! set_font_scale 1.0; then status=1; fi
  exit "$status"
}

# Drive every checkpoint of every flow dir into $1, dumping hierarchy + screenshot per checkpoint.
# $2 is the required, verified fontScale stamped into each checkpoint context.
capture_flows() {
  local capdir="$1" fontscale="$2" order=0 flowdir flow sub base slug
  if [ -e "$capdir" ] || [ -L "$capdir" ]; then
    echo "::error::refusing to reuse Android capture directory $capdir; choose a fresh DEVICE_LAYOUT_OUT"
    return 1
  fi
  mkdir -p "$capdir"
  for flowdir in "$FLOWS"/*/; do
    [ -d "$flowdir" ] || continue
    flow="$(basename "$flowdir")"
    for sub in "$flowdir"*.yaml; do
      [ -e "$sub" ] || continue
      base="$(printf '%02d-%s-%s' "$order" "$flow" "$(basename "$sub" .yaml | sed 's/^[0-9]*-//')")"
      slug="$(basename "$sub" .yaml | sed 's/^[0-9]*-//; s/-/ /g')"
      echo "  checkpoint $base"
      if ! flow_test "$capdir/$base.maestro.log" maestro --device "$SERIAL" test "$sub"; then
        echo "::error::maestro sub-flow failed or timed out (>${FLOW_TIMEOUT_S}s): $sub"
        tail -20 "$capdir/$base.maestro.log" || true
        return 1
      fi
      verify_font_scale "$fontscale" || return 1
      if ! maestro --device "$SERIAL" hierarchy > "$capdir/$base.hierarchy.json" 2>/dev/null ||
          [ ! -s "$capdir/$base.hierarchy.json" ] ||
          ! adb -s "$SERIAL" exec-out screencap -p > "$capdir/$base.png" 2>/dev/null ||
          [ ! -s "$capdir/$base.png" ]; then
        echo "::error::missing Android hierarchy or screenshot for $base at font_scale $fontscale"
        return 1
      fi
      printf '{"flow":"%s","checkpoint":"%s","screen":"%s","state":"default","fontScale":%s}\n' "$flow" "$slug" "$flow" "$fontscale" > "$capdir/$base.ctx.json"
      order=$((order+1))
    done
  done
  if [ "$order" -eq 0 ]; then
    echo "::error::missing Android checkpoints at font_scale $fontscale"
    return 1
  fi
  verify_font_scale "$fontscale"
}

# Capture dir → manifest → candidate-bound bundle → geometry gate.
#   $1 capture dir, $2 bundle filename (bundle.json = vision-reviewed; other = geometry-only), rest → manifest flags.
FAIL=0
gate_capture() {
  local capdir="$1" bundle="$2"; shift 2
  node "$DL/scripts/make-capture-manifest.mjs" "$capdir" --profile "$PROFILE" --platform android \
    --source-sha "$SHA" --build-hash "$BUILD_HASH" --density "$DENSITY" --viewport-w "$VPW" --viewport-h "$VPH" "$@"
  node "$DL/scripts/bundle-from-maestro.mjs" "$capdir" --platform android --profile "$PROFILE" \
    --source-sha "$SHA" --out "$capdir/$bundle"
  if ! node "$DL/run-geometry.mjs" "$capdir/$bundle" --waivers "$DL/waivers.json" \
      --expect-sha "$SHA" --profile "$PROFILE" --expect-build "$BUILD_HASH" --out "$capdir/geometry-${bundle%.json}.json"; then
    echo "::error::device-layout geometry findings on $PROFILE (${bundle})"
    FAIL=1
  fi
  # Fail-safe: an entry point that silently does not run (e.g. macOS symlinked tmp paths) must never pass.
  [ -s "$capdir/geometry-${bundle%.json}.json" ] || { echo "::error::geometry produced no result file for ${bundle} (silent exit)"; FAIL=1; }
}

OUTDIR="$OUTROOT/$PROFILE"
# Standalone evidence only: the outer QA job caps build plus capture time.
# Do not start the combined gate's latest-start clock before a cold APK build.
if [ "$AX_ONLY" -eq 1 ]; then
  printf '{"scope":"android-offline-layout-1p3-only","releaseVerdict":false,"baselineEvaluated":false,"sourceSha":"%s","apkSha256":"%s"}\n' \
    "$SHA" "$BUILD_HASH" > "$OUTROOT/android-qa-scope.json"
  trap restore_baseline EXIT
  set_font_scale 1.3
  CAPAX="$OUTROOT/$PROFILE-large-text"
  capture_flows "$CAPAX" 1.3
  gate_capture "$CAPAX" bundle.large-text.json --font-scale 1.3
  set_font_scale 1.0
  trap - EXIT
  if [ "$FAIL" -eq 0 ]; then
    echo "device-layout Android 1.3-only QA: complete; baseline not evaluated"
  fi
  exit "$FAIL"
fi

set_font_scale 1.0
capture_flows "$OUTDIR" 1.0
gate_capture "$OUTDIR" bundle.json --font-scale 1.0

if [ "$LARGE_TEXT" -eq 1 ]; then
  ELAPSED=$(( $(date +%s) - START_TS ))
  if [ "$ELAPSED" -ge "$AX_BUDGET_S" ]; then
    echo "::error::required Android font_scale 1.3 capture not attempted: elapsed ${ELAPSED}s >= ${AX_BUDGET_S}s budget"
    exit 1
  fi
  echo "--- $PROFILE required large-text pass (font_scale 1.3, elapsed ${ELAPSED}s < ${AX_BUDGET_S}s) ---"
  # Always restore the emulator if setting, capture or geometry fails during the large-text leg.
  trap restore_baseline EXIT
  set_font_scale 1.3
  CAPAX="$OUTROOT/$PROFILE-large-text"
  capture_flows "$CAPAX" 1.3
  gate_capture "$CAPAX" bundle.large-text.json --font-scale 1.3
  set_font_scale 1.0
  trap - EXIT
else
  echo "device-layout: baseline only (Android 1.3 capture not requested)"
fi

[ "$FAIL" -eq 0 ] && echo "device-layout android: PASS" || echo "device-layout android: FAIL"
exit "$FAIL"
