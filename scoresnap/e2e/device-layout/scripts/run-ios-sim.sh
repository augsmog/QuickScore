#!/usr/bin/env bash
# iOS simulator legs of the device-layout gate on the self-hosted Mac mini runner (labels
# self-hosted, ios-sim). Builds the simulator app once, then for each per-PR profile
# (DEVICE_LAYOUT_IOS_PROFILES, default iphone-16-pro,iphone-se-3) boots the matching simulator,
# drives the Maestro device-layout capture flows (one checkpoint per sub-flow, `maestro hierarchy`
# + screenshot after each), turns the capture into a candidate-bound bundle, and scores it with
# the deterministic geometry runner (rules 1–8). When total wall time stays under 15 min it also
# runs an AX3 large-text geometry pass (DEVICE_LAYOUT_LARGE_TEXT); otherwise AX3 runs nightly.
#
# Paths resolve from the module dir ($DL) and repo root ($ROOT); DEVICE_LAYOUT_ROOT /
# DEVICE_LAYOUT_OUT override them (lib/native-scripts.test.mjs proves the real script against a
# stub repo — simulator ops are xcrun-guarded so the stub run on Linux still reaches a verdict).
# Output: $DEVICE_LAYOUT_OUT/<profile>/bundle.json (+ screenshots alongside), candidate-bound to
# the checked-out SHA; reviewed by the vision-candidate job. Until the harness is present this
# fails loudly so a required check can never go green on an empty leg.
set -euo pipefail
DL="$(cd "$(dirname "$0")/.." && pwd)"   # scoresnap/e2e/device-layout
ROOT="${DEVICE_LAYOUT_ROOT:-$(cd "$DL/../../.." && pwd)}"
cd "$DL"
PROFILES="${DEVICE_LAYOUT_IOS_PROFILES:-iphone-16-pro,iphone-se-3}"
SHA="$(git -C "$ROOT" rev-parse HEAD)"
OUTROOT="${DEVICE_LAYOUT_OUT:-$(mktemp -d)}"
export DEVICE_LAYOUT_OUT="$OUTROOT"
FLOWS="$ROOT/.maestro/flows/device-layout"
IOS_RUNTIME="${DEVICE_LAYOUT_IOS_RUNTIME:-com.apple.CoreSimulator.SimRuntime.iOS-26-4}"
AX_BUDGET_S="${DEVICE_LAYOUT_AX_BUDGET_S:-900}"   # < 15 min total → also run the AX3 large-text pass
START_TS="$(date +%s)"
mkdir -p "$OUTROOT"

if [ ! -d "$FLOWS" ] || [ ! -f "$DL/scripts/build-ios-sim.sh" ] || [ ! -f "$DL/scripts/bundle-from-maestro.mjs" ]; then
  echo "::error::device-layout iOS native harness not present yet (AUG-1376). No device capture produced."
  echo "PENDING-NATIVE-HARNESS AUG-1376"
  exit 1
fi

# openjdk@17 for Maestro; keep PATH consistent with the build step.
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"
command -v maestro >/dev/null || { echo "::error::maestro not on PATH (expected ~/.maestro/bin)"; exit 1; }
echo "device-layout: iOS legs [$PROFILES] @ $SHA on macOS $(sw_vers -productVersion 2>/dev/null || echo '?') / $(xcodebuild -version 2>/dev/null | head -1 || echo 'no xcode') / maestro $(maestro --version 2>/dev/null | tail -1)"

# Portable per-flow + boot hard caps so a hung flow/boot fails fast (with its log) instead of eating
# the 45-min job timeout. macOS ships no `timeout`; prefer coreutils `gtimeout` if brew-installed.
FLOW_TIMEOUT_S="${DEVICE_LAYOUT_FLOW_TIMEOUT_S:-150}"
BOOT_TIMEOUT_S="${DEVICE_LAYOUT_BOOT_TIMEOUT_S:-180}"
if command -v timeout >/dev/null 2>&1; then TIMEOUT_BIN=timeout
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN=gtimeout
else TIMEOUT_BIN=""; fi
with_timeout() { local secs="$1"; shift
  if [ -n "$TIMEOUT_BIN" ]; then "$TIMEOUT_BIN" "${secs}s" "$@"
  else "$@"; fi; }
flow_test() { local log="$1"; shift; with_timeout "$FLOW_TIMEOUT_S" "$@" > "$log" 2>&1; }

# Profile id → simulator device type (available on the Mac mini per owner card t1550s9640).
simdevice() {
  case "$1" in
    iphone-16-pro)      echo "iPhone 16 Pro" ;;
    iphone-se-3)        echo "iPhone SE (3rd generation)" ;;
    iphone-16)          echo "iPhone 16" ;;
    iphone-16-pro-max)  echo "iPhone 16 Pro Max" ;;
    *) echo "" ;;
  esac
}

# Build the simulator app once (guarded read of the built app path so the stub harness, which does
# not emit one, does not abort).
bash "$DL/scripts/build-ios-sim.sh"
APP_PATH="$(cat "$OUTROOT/ios-app-path.txt" 2>/dev/null || true)"
BUILD_HASH="$(cat "$OUTROOT/ios-build-hash.txt" 2>/dev/null || echo '')"

# Drive every checkpoint of every flow dir into $1 against simulator $2 (udid; empty => default/
# pre-booted). $3 (optional) stamps a fontScale into each checkpoint context (AX3 pass).
capture_flows() {
  local capdir="$1" udid="$2" fontscale="${3:-}" order=0 flowdir flow sub base slug devarg=""
  [ -n "$udid" ] && devarg="--device $udid"
  mkdir -p "$capdir"
  for flowdir in "$FLOWS"/*/; do
    [ -d "$flowdir" ] || continue
    flow="$(basename "$flowdir")"
    for sub in "$flowdir"*.yaml; do
      [ -e "$sub" ] || continue
      base="$(printf '%02d-%s-%s' "$order" "$flow" "$(basename "$sub" .yaml | sed 's/^[0-9]*-//')")"
      slug="$(basename "$sub" .yaml | sed 's/^[0-9]*-//; s/-/ /g')"
      echo "  checkpoint $base"
      if ! flow_test "$capdir/$base.maestro.log" maestro $devarg test "$sub"; then
        echo "::warning::maestro sub-flow failed or timed out (>${FLOW_TIMEOUT_S}s): $sub (see $base.maestro.log)"
        tail -20 "$capdir/$base.maestro.log" || true
      fi
      maestro $devarg hierarchy > "$capdir/$base.hierarchy.json" 2>/dev/null || echo '{"attributes":{},"children":[]}' > "$capdir/$base.hierarchy.json"
      if command -v xcrun >/dev/null 2>&1; then
        xcrun simctl io "${udid:-booted}" screenshot "$capdir/$base.png" >/dev/null 2>&1 || true
      fi
      if [ -n "$fontscale" ]; then
        printf '{"flow":"%s","checkpoint":"%s","screen":"%s","state":"default","fontScale":%s}\n' "$flow" "$slug" "$flow" "$fontscale" > "$capdir/$base.ctx.json"
      else
        printf '{"flow":"%s","checkpoint":"%s","screen":"%s","state":"default"}\n' "$flow" "$slug" "$flow" > "$capdir/$base.ctx.json"
      fi
      order=$((order+1))
    done
  done
}

# Capture dir → manifest → candidate-bound bundle → geometry gate.
#   $1 capture dir, $2 bundle filename (bundle.json = vision-reviewed; other = geometry-only),
#   $3 profile id, rest → manifest flags.
FAIL=0
gate_capture() {
  local capdir="$1" bundle="$2" prof="$3"; shift 3
  node "$DL/scripts/make-capture-manifest.mjs" "$capdir" --profile "$prof" --platform ios \
    --source-sha "$SHA" --build-hash "$BUILD_HASH" "$@"
  node "$DL/scripts/bundle-from-maestro.mjs" "$capdir" --platform ios --profile "$prof" \
    --source-sha "$SHA" --out "$capdir/$bundle"
  if ! node "$DL/run-geometry.mjs" "$capdir/$bundle" --waivers "$DL/waivers.json" \
      --expect-sha "$SHA" --profile "$prof" --expect-build "$BUILD_HASH" --out "$capdir/geometry-${bundle%.json}.json"; then
    echo "::error::device-layout geometry findings on $prof (${bundle})"
    FAIL=1
  fi
  # Fail-safe: an entry point that silently does not run (e.g. macOS symlinked tmp paths) must never pass.
  [ -s "$capdir/geometry-${bundle%.json}.json" ] || { echo "::error::geometry produced no result file for ${bundle} (silent exit)"; FAIL=1; }
}

IFS=',' read -ra PLIST <<< "$PROFILES"
for prof in "${PLIST[@]}"; do
  dev="$(simdevice "$prof")"
  [ -n "$dev" ] || { echo "::error::no simulator device mapping for profile $prof"; FAIL=1; continue; }
  UDID=""
  if command -v xcrun >/dev/null 2>&1; then
    echo "=== profile $prof ($dev, $IOS_RUNTIME) ==="
    UDID="$(xcrun simctl create "dl-$prof" "$dev" "$IOS_RUNTIME" 2>/dev/null || true)"
    if [ -n "$UDID" ]; then
      # Bounded boot wait: bootstatus -b blocks until booted; cap it so a wedged simulator fails
      # fast instead of hanging the job (the silent-hang mode the executor observed).
      with_timeout "$BOOT_TIMEOUT_S" xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 \
        || xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
      [ -n "$APP_PATH" ] && xcrun simctl install "$UDID" "$APP_PATH" >/dev/null 2>&1 || true
    fi
  else
    echo "=== profile $prof ($dev) [no xcrun — capture via pre-booted/stub maestro] ==="
  fi

  OUTDIR="$OUTROOT/$prof"
  capture_flows "$OUTDIR" "$UDID"
  gate_capture "$OUTDIR" bundle.json "$prof"

  ELAPSED=$(( $(date +%s) - START_TS ))
  if [ -n "${DEVICE_LAYOUT_LARGE_TEXT:-}" ] && [ "$ELAPSED" -lt "$AX_BUDGET_S" ]; then
    echo "--- $prof AX3 large-text pass (elapsed ${ELAPSED}s < ${AX_BUDGET_S}s) ---"
    if [ -n "$UDID" ] && command -v xcrun >/dev/null 2>&1; then
      xcrun simctl ui "$UDID" content_size accessibility-extra-extra-extra-large >/dev/null 2>&1 || true
    fi
    CAPAX="$OUTROOT/$prof-ax3"
    capture_flows "$CAPAX" "$UDID" 2.0
    gate_capture "$CAPAX" bundle.ax3.json "$prof" --font-scale 2.0
  elif [ -n "${DEVICE_LAYOUT_LARGE_TEXT:-}" ]; then
    echo "::notice::skipping AX3 pass for $prof (elapsed ${ELAPSED}s >= ${AX_BUDGET_S}s) — nightly covers AX3"
  fi

  if [ -n "$UDID" ] && command -v xcrun >/dev/null 2>&1; then
    xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
    xcrun simctl delete "$UDID" >/dev/null 2>&1 || true
  fi
done

[ "$FAIL" -eq 0 ] && echo "device-layout iOS: PASS" || echo "device-layout iOS: FAIL"
exit "$FAIL"
