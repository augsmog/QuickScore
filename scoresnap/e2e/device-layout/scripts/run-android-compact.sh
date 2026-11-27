#!/usr/bin/env bash
# Android compact-AVD native leg of the device-layout gate (AUG-1380 workflow hook; AUG-1376 harness).
#
# Runs inside reactivecircus/android-emulator-runner (ubuntu-latest KVM) once an emulator is booted.
# Builds the candidate debug APK, installs it, forces a compact ~360dp window, drives the Maestro
# device-layout capture flows (one checkpoint per sub-flow, `maestro hierarchy` + screenshot after
# each), turns the capture into a candidate-bound bundle, and scores it with the deterministic
# geometry runner (rules 1–8). When the whole run stays under the wall-time budget it also runs a
# 1.3 font-scale large-text geometry pass (DEVICE_LAYOUT_LARGE_TEXT).
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
AX_BUDGET_S="${DEVICE_LAYOUT_AX_BUDGET_S:-900}"   # < 15 min total → also run the 1.3 large-text pass
START_TS="$(date +%s)"
mkdir -p "$OUTROOT"

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

# Build the candidate APK for the exact SHA, then install it (guarded so the stub harness, which
# does not emit an apk path, does not abort).
bash "$DL/scripts/build-android.sh"
BUILD_HASH="$(cat "$OUTROOT/android-build-hash.txt" 2>/dev/null || echo '')"
APK="$(cat "$OUTROOT/android-apk-path.txt" 2>/dev/null || true)"
[ -n "$APK" ] && adb -s "$SERIAL" install -r -t "$APK" || true

# ── Scroll-only reveal captures for the New Contest wizard (A2/A3) ─────────────────────────────
# Android reports only the visible part of a view, so a control half scrolled out of the list is
# measured as a sliver and fails the 48dp rule. After each wizard checkpoint the list is dragged a
# little down, captured, put back, dragged a little up, captured, and put back. The two captures
# go to "<capdir>-reveal-down" and "<capdir>-reveal-up" under the same checkpoint name, and
# lib/android-wizard-reveal.mjs proves from them that a sliver is the same control, whole.
# Drags only: no tap, no text, no key. If the list cannot be put back exactly, the leg FAILS:
# every later checkpoint would otherwise be captured at the wrong place.
REVEAL_DP="${DEVICE_LAYOUT_REVEAL_DP:-96}"       # how far the list is dragged for a reveal
RESTORE_TOL_DP=2                                 # "back where it was" means within this
PROBE="$DL/scripts/wizard-scroll-probe.mjs"
px() { awk -v d="$DENSITY" -v v="$1" 'BEGIN{printf "%d", d*v}'; }
ui_dump() {  # $1 = file. Fast native dump; falls back to maestro's.
  adb -s "$SERIAL" exec-out uiautomator dump /dev/tty 2>/dev/null | sed 's/UI hierchary dumped to: \/dev\/tty//' > "$1" || true
  grep -q '<hierarchy' "$1" 2>/dev/null || maestro --device "$SERIAL" hierarchy > "$1" 2>/dev/null || true
}
drag() {  # $1 x, $2 from y, $3 to y (pixels). Slow, so the list follows the finger and does not fling.
  adb -s "$SERIAL" shell input swipe "$1" "$2" "$1" "$3" 1500 >/dev/null 2>&1 || true
  sleep 1
}
restore_scroll() {  # $1 baseline dump, $2 x, $3 list top, $4 list bottom. 0 = back in place.
  local base="$1" x="$2" top="$3" bottom="$4" now dy try mid slop tol step
  now="$(mktemp)"; mid=$(( (top + bottom) / 2 )); slop="$(px 8)"; tol="$(px "$RESTORE_TOL_DP")"
  for try in 1 2 3 4 5; do
    ui_dump "$now"
    dy="$(node "$PROBE" delta "$base" "$now" 2>/dev/null)" || { rm -f "$now"; return 1; }
    if [ "${dy#-}" -le "$tol" ]; then rm -f "$now"; return 0; fi
    step=$(( ${dy#-} + slop ))
    [ "$step" -gt $(( (bottom - top) / 2 - 20 )) ] && step=$(( (bottom - top) / 2 - 20 ))
    # dy > 0: the content sits lower than it did, so drag it up; and the reverse.
    if [ "$dy" -gt 0 ]; then drag "$x" "$mid" $(( mid - step )); else drag "$x" "$mid" $(( mid + step )); fi
  done
  rm -f "$now"; return 1
}
wizard_reveals() {  # $1 capture dir, $2 checkpoint file base
  local capdir="$1" base="$2" baseline area x top bottom mid dist dir rdir
  baseline="$(mktemp)"; ui_dump "$baseline"
  area="$(node "$PROBE" area "$baseline" 2>/dev/null)" || { echo "::notice::no New Contest list at $base; no reveal captures"; rm -f "$baseline"; return 0; }
  read -r x top bottom <<< "$area"
  dist="$(px "$REVEAL_DP")"; mid=$(( (top + bottom) / 2 ))
  if [ $(( bottom - top )) -le $(( dist + 80 )) ]; then echo "::notice::list too short to drag at $base; no reveal captures"; rm -f "$baseline"; return 0; fi
  for dir in down up; do
    rdir="$capdir-reveal-$dir"; mkdir -p "$rdir"
    if [ "$dir" = down ]; then drag "$x" $(( mid - dist / 2 )) $(( mid + dist / 2 )); else drag "$x" $(( mid + dist / 2 )) $(( mid - dist / 2 )); fi
    maestro --device "$SERIAL" hierarchy > "$rdir/$base.hierarchy.json" 2>/dev/null || echo '{"attributes":{},"children":[]}' > "$rdir/$base.hierarchy.json"
    adb -s "$SERIAL" exec-out screencap -p > "$rdir/$base.png" 2>/dev/null || true
    cp "$capdir/$base.ctx.json" "$rdir/$base.ctx.json"
    if ! restore_scroll "$baseline" "$x" "$top" "$bottom"; then
      echo "::error::could not put the New Contest list back after the reveal capture at $base; later checkpoints would be captured at the wrong scroll position"
      FAIL=1; rm -f "$baseline"; return 0
    fi
  done
  rm -f "$baseline"
}

# Drive every checkpoint of every flow dir into $1, dumping hierarchy + screenshot per checkpoint.
# $2 (optional) stamps a fontScale into each checkpoint context (large-text pass).
capture_flows() {
  local capdir="$1" fontscale="${2:-}" order=0 flowdir flow sub base slug
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
        echo "::warning::maestro sub-flow failed or timed out (>${FLOW_TIMEOUT_S}s): $sub"
        tail -20 "$capdir/$base.maestro.log" || true
      fi
      maestro --device "$SERIAL" hierarchy > "$capdir/$base.hierarchy.json" 2>/dev/null || echo '{"attributes":{},"children":[]}' > "$capdir/$base.hierarchy.json"
      adb -s "$SERIAL" exec-out screencap -p > "$capdir/$base.png" 2>/dev/null || true
      if [ -n "$fontscale" ]; then
        printf '{"flow":"%s","checkpoint":"%s","screen":"%s","state":"default","fontScale":%s}\n' "$flow" "$slug" "$flow" "$fontscale" > "$capdir/$base.ctx.json"
      else
        printf '{"flow":"%s","checkpoint":"%s","screen":"%s","state":"default"}\n' "$flow" "$slug" "$flow" > "$capdir/$base.ctx.json"
      fi
      [ "$flow" = new-contest ] && [ -z "${DEVICE_LAYOUT_NO_REVEALS:-}" ] && wizard_reveals "$capdir" "$base"
      order=$((order+1))
    done
  done
}

FAIL=0
# Capture dir → manifest → candidate-bound bundle → geometry gate.
#   $1 capture dir, $2 bundle filename (bundle.json = vision-reviewed; other = geometry-only), rest → manifest flags.
gate_capture() {
  local capdir="$1" bundle="$2" rdir rname; shift 2
  local -a reveal_args=()
  # Reveal captures become their own bundles (never named bundle.json: the screenshot review must
  # not pick them up) and are offered to the geometry runner as proof, nothing more.
  rname="reveal${bundle#bundle}"
  for rdir in "$capdir-reveal-down" "$capdir-reveal-up"; do
    ls "$rdir"/*.ctx.json >/dev/null 2>&1 || continue
    if node "$DL/scripts/make-capture-manifest.mjs" "$rdir" --profile "$PROFILE" --platform android \
         --source-sha "$SHA" --build-hash "$BUILD_HASH" --density "$DENSITY" --viewport-w "$VPW" --viewport-h "$VPH" "$@" \
       && node "$DL/scripts/bundle-from-maestro.mjs" "$rdir" --platform android --profile "$PROFILE" \
         --source-sha "$SHA" --out "$rdir/$rname"; then
      reveal_args+=(--reveal "$rdir/$rname")
    else
      echo "::warning::reveal capture $rdir could not be bundled; it proves nothing and the findings it might have answered stay"
    fi
  done
  node "$DL/scripts/make-capture-manifest.mjs" "$capdir" --profile "$PROFILE" --platform android \
    --source-sha "$SHA" --build-hash "$BUILD_HASH" --density "$DENSITY" --viewport-w "$VPW" --viewport-h "$VPH" "$@"
  node "$DL/scripts/bundle-from-maestro.mjs" "$capdir" --platform android --profile "$PROFILE" \
    --source-sha "$SHA" --out "$capdir/$bundle"
  if ! node "$DL/run-geometry.mjs" "$capdir/$bundle" --waivers "$DL/waivers.json" \
      --expect-sha "$SHA" --profile "$PROFILE" --expect-build "$BUILD_HASH" --out "$capdir/geometry-${bundle%.json}.json" \
      ${reveal_args[@]+"${reveal_args[@]}"}; then
    echo "::error::device-layout geometry findings on $PROFILE (${bundle})"
    FAIL=1
  fi
  # Fail-safe: an entry point that silently does not run (e.g. macOS symlinked tmp paths) must never pass.
  [ -s "$capdir/geometry-${bundle%.json}.json" ] || { echo "::error::geometry produced no result file for ${bundle} (silent exit)"; FAIL=1; }
}

OUTDIR="$OUTROOT/$PROFILE"
capture_flows "$OUTDIR"
gate_capture "$OUTDIR" bundle.json

# Large-text pass (font_scale 1.3) when enabled and comfortably under the wall-time budget.
ELAPSED=$(( $(date +%s) - START_TS ))
if [ -n "${DEVICE_LAYOUT_LARGE_TEXT:-}" ] && [ "$ELAPSED" -lt "$AX_BUDGET_S" ]; then
  echo "--- $PROFILE large-text pass (font_scale 1.3, elapsed ${ELAPSED}s < ${AX_BUDGET_S}s) ---"
  adb -s "$SERIAL" shell settings put system font_scale 1.3 >/dev/null 2>&1 || true
  CAPAX="$OUTROOT/$PROFILE-large-text"
  capture_flows "$CAPAX" 1.3
  gate_capture "$CAPAX" bundle.large-text.json --font-scale 1.3
  adb -s "$SERIAL" shell settings put system font_scale 1.0 >/dev/null 2>&1 || true
elif [ -n "${DEVICE_LAYOUT_LARGE_TEXT:-}" ]; then
  echo "::notice::skipping large-text pass for $PROFILE (elapsed ${ELAPSED}s >= ${AX_BUDGET_S}s) — nightly covers 1.3"
fi

[ "$FAIL" -eq 0 ] && echo "device-layout android: PASS" || echo "device-layout android: FAIL"
exit "$FAIL"
