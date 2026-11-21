#!/usr/bin/env bash
# Android compact-AVD native leg of the device-layout gate (AUG-1380 workflow hook).
#
# Thin entry the emulator job calls once an emulator is booted. The full native harness —
# build-android.sh (Expo Android build of the exact candidate SHA) and bundle-from-maestro.mjs
# (Maestro device-layout flows with captureHierarchy + screenshot at every checkpoint) — lands
# under AUG-1376. Until it is present this fails loudly so a required check can never go green
# on an empty native leg.
#
# Output: $DEVICE_LAYOUT_OUT/android-compact/bundle.json (+ screenshots), candidate-bound to the
# checked-out SHA; uploaded by the workflow and reviewed by the vision-candidate job.
set -euo pipefail
# Only the existing owner-controlled manual QA ref selects supplemental smoke.
# The ordinary full-gate path below is unchanged; smoke always exits nonzero.
if [[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_EVENT_NAME:-}" == workflow_dispatch &&
      "${GITHUB_REPOSITORY:-}" == augsmog/QuickScore && "${GITHUB_WORKFLOW:-}" == device-layout-gate &&
      "${GITHUB_REF:-}" == refs/heads/qa/snapscore-a690ef23-android-smoke ]]; then
  QA_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
  exec python3 "$QA_ROOT/qa/native-a690ef23/entrypoint.py" android
fi
DL="$(cd "$(dirname "$0")/.." && pwd)"   # scoresnap/e2e/device-layout
ROOT="${DEVICE_LAYOUT_ROOT:-$(cd "$DL/../../.." && pwd)}"
cd "$DL"
PROFILE=android-compact
SHA="$(git -C "$ROOT" rev-parse HEAD)"
OUTDIR="${DEVICE_LAYOUT_OUT:-$(mktemp -d)}/$PROFILE"
mkdir -p "$OUTDIR"

echo "device-layout: $PROFILE leg @ $SHA on $(adb devices | tr '\n' ' ')"

FLOWS="$ROOT/.maestro/flows/device-layout"
if [ ! -d "$FLOWS" ] || [ ! -f "$DL/scripts/build-android.sh" ] || [ ! -f "$DL/scripts/bundle-from-maestro.mjs" ]; then
  echo "::error::device-layout Android native harness not present yet (AUG-1376). No device capture produced."
  echo "PENDING-NATIVE-HARNESS AUG-1376"
  exit 1
fi

# 1. Build + install the candidate Android binary.
bash "$DL/scripts/build-android.sh"
# 2. Drive the Maestro device-layout flows; capture hierarchy + screenshot at every checkpoint.
#    A failed flow simply leaves checkpoints missing, which the geometry gate fails (rule 8).
maestro test "$FLOWS" --format junit --output "$OUTDIR/maestro.xml" --debug-output "$OUTDIR/maestro" || true
node "$DL/scripts/bundle-from-maestro.mjs" "$OUTDIR/maestro" --platform android --profile "$PROFILE" \
  --source-sha "$SHA" --out "$OUTDIR/bundle.json"
# 3. Deterministic geometry gate, bound to this SHA/profile and the full per-PR checkpoint set.
node "$DL/run-geometry.mjs" "$OUTDIR/bundle.json" --waivers "$DL/waivers.json" \
  --expect-sha "$SHA" --profile "$PROFILE" --out "$OUTDIR/geometry.json"
