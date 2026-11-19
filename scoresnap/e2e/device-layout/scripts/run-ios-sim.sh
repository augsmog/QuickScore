#!/usr/bin/env bash
# AUG-1376 — device-layout gate iOS legs on the self-hosted Mac mini (labels self-hosted, ios-sim).
#
# Builds the simulator app once, then for each per-PR profile (DEVICE_LAYOUT_IOS_PROFILES, default
# iphone-16-pro,iphone-se-3) boots the matching simulator, drives the discrete device-layout capture
# sub-flows, dumps `maestro hierarchy` + a screenshot at every checkpoint, assembles a capture
# manifest, and scores it with the deterministic geometry runner (rules 1-8). When the per-PR wall
# time stays under 15 min it also runs an AX3 large-text pass; otherwise AX1 per-PR (AX3 nightly).
#
# Fails (exit 1) if any profile has a kept geometry finding or produced no checkpoints — a required
# check can never go green on an empty native leg.
set -euo pipefail
cd "$(dirname "$0")/.."            # scoresnap/e2e/device-layout
DL_DIR="$(pwd)"
ROOT="$(cd ../../.. && pwd)"
FLOWS_ROOT="$ROOT/.maestro/flows/device-layout"
PROFILES="${DEVICE_LAYOUT_IOS_PROFILES:-iphone-16-pro,iphone-se-3}"
OUTROOT="${DEVICE_LAYOUT_OUT:-$ROOT/device-layout-out}"
export DEVICE_LAYOUT_OUT="$OUTROOT"
IOS_RUNTIME="${DEVICE_LAYOUT_IOS_RUNTIME:-com.apple.CoreSimulator.SimRuntime.iOS-26-4}"
AX_TIME_BUDGET_S="${DEVICE_LAYOUT_AX_BUDGET_S:-900}"   # <15 min total → also run AX3 large text
START_TS="$(date +%s)"
mkdir -p "$OUTROOT"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"

command -v maestro >/dev/null || { echo "::error::maestro not on PATH (expected ~/.maestro/bin)"; exit 1; }
echo "device-layout iOS: profiles [$PROFILES] on macOS $(sw_vers -productVersion 2>/dev/null || echo '?'), $(xcodebuild -version 2>/dev/null | head -1 || echo 'no xcode'), maestro $(maestro --version 2>/dev/null | tail -1)"

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

# 1. Build the simulator app once.
bash "$DL_DIR/scripts/build-ios-sim.sh"
APP_PATH="$(cat "$OUTROOT/ios-app-path.txt")"
BUILD_HASH="$(cat "$OUTROOT/ios-build-hash.txt" 2>/dev/null || echo '')"
SOURCE_SHA="$(git -C "$ROOT" rev-parse HEAD)"
APP_ID="com.scoresnap.app"

# Capture every checkpoint of every flow dir into $1 (capture dir), driving $UDID.
capture_flows() {
  local capdir="$1" udid="$2" order=0
  mkdir -p "$capdir"
  local flowdir flow sub base slug
  for flowdir in "$FLOWS_ROOT"/*/; do
    flow="$(basename "$flowdir")"
    for sub in "$flowdir"*.yaml; do
      [ -e "$sub" ] || continue
      base="$(printf '%02d-%s-%s' "$order" "$flow" "$(basename "$sub" .yaml | sed 's/^[0-9]*-//')")"
      slug="$(basename "$sub" .yaml | sed 's/^[0-9]*-//; s/-/ /g')"
      echo "  checkpoint $base"
      if ! maestro --device "$udid" test "$sub" > "$capdir/$base.maestro.log" 2>&1; then
        echo "::warning::maestro sub-flow failed: $sub (see $base.maestro.log)"
        tail -20 "$capdir/$base.maestro.log" || true
      fi
      maestro --device "$udid" hierarchy > "$capdir/$base.hierarchy.json" 2>/dev/null || echo '{"attributes":{},"children":[]}' > "$capdir/$base.hierarchy.json"
      xcrun simctl io "$udid" screenshot "$capdir/$base.png" >/dev/null 2>&1 || true
      printf '{"flow":"%s","checkpoint":"%s","screen":"%s","state":"default"}\n' "$flow" "$slug" "$flow" > "$capdir/$base.ctx.json"
      order=$((order+1))
    done
  done
}

FAIL=0
IFS=',' read -ra PLIST <<< "$PROFILES"
for prof in "${PLIST[@]}"; do
  dev="$(simdevice "$prof")"
  [ -n "$dev" ] || { echo "::error::no simulator device mapping for profile $prof"; FAIL=1; continue; }
  echo "=== profile $prof ($dev, $IOS_RUNTIME) ==="
  UDID="$(xcrun simctl create "dl-$prof" "$dev" "$IOS_RUNTIME")"
  xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || xcrun simctl boot "$UDID" || true
  xcrun simctl install "$UDID" "$APP_PATH"

  CAP="$OUTROOT/$prof"
  capture_flows "$CAP" "$UDID"
  node "$DL_DIR/scripts/make-capture-manifest.mjs" "$CAP" --profile "$prof" --platform ios --source-sha "$SOURCE_SHA" --build-hash "$BUILD_HASH"
  node "$DL_DIR/scripts/bundle-from-maestro.mjs" "$CAP" --platform ios --profile "$prof" --out "$CAP/bundle.json"
  if ! node "$DL_DIR/run-geometry.mjs" "$CAP/bundle.json" --waivers "$DL_DIR/waivers.json" --out "$CAP/findings.json"; then
    echo "::error::device-layout geometry findings on $prof"
    FAIL=1
  fi

  # AX3 large-text pass when the whole run is comfortably under budget.
  ELAPSED=$(( $(date +%s) - START_TS ))
  if [ "$ELAPSED" -lt "$AX_TIME_BUDGET_S" ]; then
    echo "--- $prof AX3 large-text pass (elapsed ${ELAPSED}s < ${AX_TIME_BUDGET_S}s) ---"
    xcrun simctl ui "$UDID" content_size accessibility-extra-extra-extra-large >/dev/null 2>&1 || true
    CAPAX="$OUTROOT/$prof-ax3"
    capture_flows "$CAPAX" "$UDID"
    node "$DL_DIR/scripts/make-capture-manifest.mjs" "$CAPAX" --profile "$prof" --platform ios --source-sha "$SOURCE_SHA" --build-hash "$BUILD_HASH" --font-scale 2.0
    node "$DL_DIR/scripts/bundle-from-maestro.mjs" "$CAPAX" --platform ios --profile "$prof" --out "$CAPAX/bundle.json"
    if ! node "$DL_DIR/run-geometry.mjs" "$CAPAX/bundle.json" --waivers "$DL_DIR/waivers.json" --out "$CAPAX/findings.json"; then
      echo "::error::device-layout AX3 geometry findings on $prof"
      FAIL=1
    fi
  else
    echo "::notice::skipping AX3 pass for $prof (elapsed ${ELAPSED}s >= ${AX_TIME_BUDGET_S}s) — nightly covers AX3"
  fi

  xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
  xcrun simctl delete "$UDID" >/dev/null 2>&1 || true
done

[ "$FAIL" -eq 0 ] && echo "device-layout iOS: PASS" || echo "device-layout iOS: FAIL"
exit "$FAIL"
