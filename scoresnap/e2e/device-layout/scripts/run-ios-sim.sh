#!/usr/bin/env bash
# iOS simulator legs of the device-layout gate on the self-hosted Mac mini runner (labels
# self-hosted, ios-sim). Profiles from DEVICE_LAYOUT_IOS_PROFILES (default
# iphone-16-pro,iphone-se-3). The native harness — build-ios-sim.sh (simulator build of the
# candidate SHA) and bundle-from-maestro.mjs (Maestro device-layout flows with captureHierarchy
# + screenshot per checkpoint) — lands under AUG-1376. Until it exists this fails loudly so a
# required check can never go green on an empty leg.
#
# Output: $DEVICE_LAYOUT_OUT/<profile>/bundle.json (+ screenshots), candidate-bound to the
# checked-out SHA; reviewed by the vision-candidate job.
set -euo pipefail
# Only the existing owner-controlled manual QA ref selects supplemental smoke.
# The ordinary full-gate path below is unchanged; smoke always exits nonzero.
if [[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_EVENT_NAME:-}" == workflow_dispatch &&
      "${GITHUB_REPOSITORY:-}" == augsmog/QuickScore && "${GITHUB_WORKFLOW:-}" == device-layout-gate &&
      "${GITHUB_REF:-}" == refs/heads/qa/snapscore-a690ef23-android-smoke ]]; then
  QA_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
  exec python3 "$QA_ROOT/qa/native-a690ef23/entrypoint.py" ios
fi
DL="$(cd "$(dirname "$0")/.." && pwd)"   # scoresnap/e2e/device-layout
ROOT="${DEVICE_LAYOUT_ROOT:-$(cd "$DL/../../.." && pwd)}"
cd "$DL"
PROFILES="${DEVICE_LAYOUT_IOS_PROFILES:-iphone-16-pro,iphone-se-3}"
SHA="$(git -C "$ROOT" rev-parse HEAD)"
OUTROOT="${DEVICE_LAYOUT_OUT:-$(mktemp -d)}"
echo "device-layout: iOS legs [$PROFILES] @ $SHA on macOS $(sw_vers -productVersion 2>/dev/null || echo '?') / $(xcodebuild -version 2>/dev/null | head -1 || echo 'no xcode')"
FLOWS="$ROOT/.maestro/flows/device-layout"
if [ ! -d "$FLOWS" ] || [ ! -f "$DL/scripts/build-ios-sim.sh" ] || [ ! -f "$DL/scripts/bundle-from-maestro.mjs" ]; then
  echo "::error::device-layout iOS native harness not present yet (AUG-1376). No device capture produced."
  echo "PENDING-NATIVE-HARNESS AUG-1376"
  exit 1
fi
bash "$DL/scripts/build-ios-sim.sh"
IFS=',' read -ra P <<< "$PROFILES"
rc=0
for prof in "${P[@]}"; do
  OUTDIR="$OUTROOT/$prof"; mkdir -p "$OUTDIR"
  DEVICE_LAYOUT_PROFILE="$prof" maestro test "$FLOWS" --format junit --output "$OUTDIR/maestro.xml" --debug-output "$OUTDIR/maestro" || true
  node "$DL/scripts/bundle-from-maestro.mjs" "$OUTDIR/maestro" --platform ios --profile "$prof" \
    --source-sha "$SHA" --out "$OUTDIR/bundle.json"
  node "$DL/run-geometry.mjs" "$OUTDIR/bundle.json" --waivers "$DL/waivers.json" \
    --expect-sha "$SHA" --profile "$prof" --out "$OUTDIR/geometry.json" || rc=1
done
exit $rc
