#!/usr/bin/env bash
# iOS simulator legs of the device-layout gate on the self-hosted Mac mini runner (labels
# self-hosted, ios-sim). Builds the simulator app once, then for each per-PR profile
# (DEVICE_LAYOUT_IOS_PROFILES, default iphone-16-pro,iphone-se-3) boots the matching simulator,
# drives the Maestro device-layout capture flows (one checkpoint per sub-flow, `maestro hierarchy`
# after each), turns the capture into a candidate-bound bundle, and scores it with the deterministic
# geometry runner (rules 1–8). When total wall time stays under 15 min it also runs an AX3 large-text
# geometry pass (DEVICE_LAYOUT_LARGE_TEXT); otherwise AX3 runs nightly.
#
# PERF (AUG-1376 round 2): the first run spent the full 45-min cap capturing only 6 checkpoints of
# one profile (~5-6 min/checkpoint) because each checkpoint spawned `maestro test`, a separate
# `maestro hierarchy`, AND a `xcrun simctl io screenshot` that hung 10+ s. Two cuts here:
#   1. The screenshot comes from the PNG Maestro already writes in-flow (every sub-flow ends in
#      `takeScreenshot`); we lift it from `--test-output-dir`/`--debug-output` instead of a second,
#      hanging `xcrun` call (which is kept only as a time-boxed fallback).
#   2. The two iPhone profiles run on two distinct simulators IN PARALLEL (one Mac runner), so wall
#      time is max(profile) not sum (DEVICE_LAYOUT_IOS_PARALLEL=0 serializes).
# Every checkpoint logs per-phase wall time (maestro-test / hierarchy / screenshot) and each profile
# prints a summary, so the next run's logs prove where the time actually goes.
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
# the job timeout. macOS ships no `timeout`; prefer coreutils `gtimeout` if brew-installed.
FLOW_TIMEOUT_S="${DEVICE_LAYOUT_FLOW_TIMEOUT_S:-150}"
BOOT_TIMEOUT_S="${DEVICE_LAYOUT_BOOT_TIMEOUT_S:-180}"
SHOT_TIMEOUT_S="${DEVICE_LAYOUT_SHOT_TIMEOUT_S:-20}"   # cap the fallback `xcrun io screenshot` hang
if command -v timeout >/dev/null 2>&1; then TIMEOUT_BIN=timeout
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_BIN=gtimeout
else TIMEOUT_BIN=""; fi
with_timeout() { local secs="$1"; shift
  if [ -n "$TIMEOUT_BIN" ]; then "$TIMEOUT_BIN" "${secs}s" "$@"
  else "$@"; fi; }

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
# Per checkpoint we time three phases and write them to <capdir>/phase-timings.tsv.
capture_flows() {
  local capdir="$1" udid="$2" fontscale="${3:-}" order=0 flowdir flow sub base slug devarg=""
  local shotname dbg lifted t0 t1 t2 t3
  [ -n "$udid" ] && devarg="--device $udid"
  mkdir -p "$capdir"
  : > "$capdir/phase-timings.tsv"
  for flowdir in "$FLOWS"/*/; do
    [ -d "$flowdir" ] || continue
    flow="$(basename "$flowdir")"
    for sub in "$flowdir"*.yaml; do
      [ -e "$sub" ] || continue
      base="$(printf '%02d-%s-%s' "$order" "$flow" "$(basename "$sub" .yaml | sed 's/^[0-9]*-//')")"
      slug="$(basename "$sub" .yaml | sed 's/^[0-9]*-//; s/-/ /g')"
      # The sub-flow's own takeScreenshot name (device-layout-<flow>-<file-stem>) — we lift this PNG.
      shotname="device-layout-${flow}-$(basename "$sub" .yaml)"
      dbg="$capdir/_dbg/$base"; mkdir -p "$dbg"
      echo "  checkpoint $base"
      # Phase 1 — drive the sub-flow. --test-output-dir/--debug-output capture the in-flow
      # takeScreenshot so phase 3 needs no second (hanging) xcrun call on the happy path.
      t0="$(date +%s)"
      if ! with_timeout "$FLOW_TIMEOUT_S" maestro $devarg test --test-output-dir "$dbg" --debug-output "$dbg/debug" "$sub" > "$capdir/$base.maestro.log" 2>&1; then
        echo "::warning::maestro sub-flow failed or timed out (>${FLOW_TIMEOUT_S}s): $sub (see $base.maestro.log)"
        tail -20 "$capdir/$base.maestro.log" || true
      fi
      # Phase 2 — the live view hierarchy for the geometry engine (the one unavoidable per-checkpoint
      # maestro call: geometry needs the element tree at THIS state).
      t1="$(date +%s)"
      maestro $devarg hierarchy > "$capdir/$base.hierarchy.json" 2>/dev/null || echo '{"attributes":{},"children":[]}' > "$capdir/$base.hierarchy.json"
      # Phase 3 — screenshot: prefer the PNG Maestro already wrote; fall back to a time-boxed simctl
      # screenshot only if it is missing (never let a hung xcrun eat the job).
      t2="$(date +%s)"
      lifted="$(find "$dbg" -name "${shotname}.png" 2>/dev/null | head -1)"
      [ -n "$lifted" ] || lifted="$(find "$dbg" -name '*.png' 2>/dev/null | head -1)"
      if [ -n "$lifted" ] && [ -s "$lifted" ]; then
        cp "$lifted" "$capdir/$base.png"
      elif command -v xcrun >/dev/null 2>&1; then
        with_timeout "$SHOT_TIMEOUT_S" xcrun simctl io "${udid:-booted}" screenshot "$capdir/$base.png" >/dev/null 2>&1 || true
      fi
      t3="$(date +%s)"
      printf '%s\t%d\t%d\t%d\n' "$base" "$((t1-t0))" "$((t2-t1))" "$((t3-t2))" >> "$capdir/phase-timings.tsv"
      rm -rf "$dbg"  # keep inode/byte use small; $base.maestro.log retains the flow trace
      if [ -n "$fontscale" ]; then
        printf '{"flow":"%s","checkpoint":"%s","screen":"%s","state":"default","fontScale":%s}\n' "$flow" "$slug" "$flow" "$fontscale" > "$capdir/$base.ctx.json"
      else
        printf '{"flow":"%s","checkpoint":"%s","screen":"%s","state":"default"}\n' "$flow" "$slug" "$flow" > "$capdir/$base.ctx.json"
      fi
      order=$((order+1))
    done
  done
}

# Per-profile per-phase timing summary (where the minutes actually went).
print_timing_summary() {
  local label="$1" tsv="$2/phase-timings.tsv"
  [ -s "$tsv" ] || return 0
  awk -v L="$label" 'BEGIN{FS="\t"} {t+=$2;h+=$3;s+=$4;n++} END{ if(n>0) printf "::notice::[%s] %d checkpoints — maestro-test %ds, hierarchy %ds, screenshot %ds, total %ds (avg %.1fs/cp)\n", L, n, t, h, s, t+h+s, (t+h+s)/n }' "$tsv"
  echo "--- $label per-phase timings (s): checkpoint  test  hier  shot ---"
  cat "$tsv"
}

# Capture dir → manifest → candidate-bound bundle → geometry gate. Returns non-zero on any finding
# or silent-exit so the caller aggregates it (parallel-safe: no global state).
#   $1 capture dir, $2 bundle filename (bundle.json = vision-reviewed; other = geometry-only),
#   $3 profile id, rest → manifest flags.
gate_capture() {
  local capdir="$1" bundle="$2" prof="$3"; shift 3
  local rc=0
  node "$DL/scripts/make-capture-manifest.mjs" "$capdir" --profile "$prof" --platform ios \
    --source-sha "$SHA" --build-hash "$BUILD_HASH" "$@" || return 1
  node "$DL/scripts/bundle-from-maestro.mjs" "$capdir" --platform ios --profile "$prof" \
    --source-sha "$SHA" --out "$capdir/$bundle" || return 1
  if ! node "$DL/run-geometry.mjs" "$capdir/$bundle" --waivers "$DL/waivers.json" \
      --expect-sha "$SHA" --profile "$prof" --expect-build "$BUILD_HASH" --out "$capdir/geometry-${bundle%.json}.json"; then
    echo "::error::device-layout geometry findings on $prof (${bundle})"; rc=1
  fi
  # Fail-safe: an entry point that silently does not run (e.g. macOS symlinked tmp paths) must never pass.
  [ -s "$capdir/geometry-${bundle%.json}.json" ] || { echo "::error::geometry produced no result file for ${bundle} (silent exit)"; rc=1; }
  return $rc
}

# One profile end-to-end on its own simulator. Returns 0 on pass, 1 on any geometry failure.
run_profile() {
  local prof="$1" pfail=0 dev UDID="" CAPAX ELAPSED
  dev="$(simdevice "$prof")"
  [ -n "$dev" ] || { echo "::error::no simulator device mapping for profile $prof"; return 1; }
  if command -v xcrun >/dev/null 2>&1; then
    echo "=== profile $prof ($dev, $IOS_RUNTIME) ==="
    # Drop any leftover sim of this name from a prior aborted run (persistent runner: no accumulation).
    xcrun simctl delete "dl-$prof" >/dev/null 2>&1 || true
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

  local OUTDIR="$OUTROOT/$prof"
  capture_flows "$OUTDIR" "$UDID"
  gate_capture "$OUTDIR" bundle.json "$prof" || pfail=1
  print_timing_summary "$prof" "$OUTDIR"

  ELAPSED=$(( $(date +%s) - START_TS ))
  if [ -n "${DEVICE_LAYOUT_LARGE_TEXT:-}" ] && [ "$ELAPSED" -lt "$AX_BUDGET_S" ]; then
    echo "--- $prof AX3 large-text pass (elapsed ${ELAPSED}s < ${AX_BUDGET_S}s) ---"
    if [ -n "$UDID" ] && command -v xcrun >/dev/null 2>&1; then
      xcrun simctl ui "$UDID" content_size accessibility-extra-extra-extra-large >/dev/null 2>&1 || true
    fi
    CAPAX="$OUTROOT/$prof-ax3"
    capture_flows "$CAPAX" "$UDID" 2.0
    gate_capture "$CAPAX" bundle.ax3.json "$prof" --font-scale 2.0 || pfail=1
    print_timing_summary "$prof-ax3" "$CAPAX"
  elif [ -n "${DEVICE_LAYOUT_LARGE_TEXT:-}" ]; then
    echo "::notice::skipping AX3 pass for $prof (elapsed ${ELAPSED}s >= ${AX_BUDGET_S}s) — nightly covers AX3"
  fi

  if [ -n "$UDID" ] && command -v xcrun >/dev/null 2>&1; then
    xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
    xcrun simctl delete "$UDID" >/dev/null 2>&1 || true
  fi
  return "$pfail"
}

IFS=',' read -ra PLIST <<< "$PROFILES"
PARALLEL="${DEVICE_LAYOUT_IOS_PARALLEL:-1}"
FAIL=0
if [ "$PARALLEL" = "1" ] && [ "${#PLIST[@]}" -gt 1 ]; then
  echo "device-layout: running ${#PLIST[@]} iOS profiles in parallel on distinct simulators (DEVICE_LAYOUT_IOS_PARALLEL=0 to serialize)."
  pids=()
  for prof in "${PLIST[@]}"; do
    ( if run_profile "$prof"; then rc=0; else rc=$?; fi; echo "$rc" > "$OUTROOT/$prof.status" ) &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do wait "$pid" || true; done
  for prof in "${PLIST[@]}"; do
    st="$(cat "$OUTROOT/$prof.status" 2>/dev/null || echo 1)"
    [ "$st" = "0" ] || { echo "::error::profile $prof reported failure (status $st)"; FAIL=1; }
  done
else
  for prof in "${PLIST[@]}"; do
    run_profile "$prof" || FAIL=1
  done
fi

[ "$FAIL" -eq 0 ] && echo "device-layout iOS: PASS" || echo "device-layout iOS: FAIL"
exit "$FAIL"
