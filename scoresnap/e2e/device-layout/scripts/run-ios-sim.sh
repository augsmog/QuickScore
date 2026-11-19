#!/usr/bin/env bash
# iOS simulator legs of the device-layout gate on the self-hosted Mac mini runner (labels self-hosted, ios-sim).
# Profiles from DEVICE_LAYOUT_IOS_PROFILES (default iphone-16-pro,iphone-se-3). The native harness (simulator
# build of the candidate SHA, Maestro device-layout flows with captureHierarchy, capture bundle) lands under
# AUG-1376. Until it exists this fails loudly so a required check can never go green on an empty leg.
set -euo pipefail
cd "$(dirname "$0")/.."   # scoresnap/e2e/device-layout
ROOT="$(cd ../../.. && pwd)"
PROFILES="${DEVICE_LAYOUT_IOS_PROFILES:-iphone-16-pro,iphone-se-3}"
echo "device-layout: iOS legs [$PROFILES] on macOS $(sw_vers -productVersion 2>/dev/null || echo '?') / $(xcodebuild -version 2>/dev/null | head -1 || echo 'no xcode')"
FLOWS="$ROOT/.maestro/flows/device-layout"
if [ ! -d "$FLOWS" ] || [ ! -f "$ROOT/scoresnap/e2e/device-layout/scripts/build-ios-sim.sh" ]; then
  echo "::error::device-layout iOS native harness not present yet (AUG-1376). No device capture produced."
  echo "PENDING-NATIVE-HARNESS AUG-1376"
  exit 1
fi
bash "$ROOT/scoresnap/e2e/device-layout/scripts/build-ios-sim.sh"
IFS=',' read -ra P <<< "$PROFILES"
for prof in "${P[@]}"; do
  OUT="$(mktemp -d)/bundle-$prof.json"
  DEVICE_LAYOUT_PROFILE="$prof" maestro test "$FLOWS" --format junit --output "$OUT.maestro" || true
  node scripts/bundle-from-maestro.mjs "$OUT.maestro" --platform ios --profile "$prof" --out "$OUT"
  node run-geometry.mjs "$OUT" --waivers waivers.json
done
