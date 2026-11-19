#!/usr/bin/env bash
# Android compact-AVD native leg of the device-layout gate (AUG-1380 workflow hook).
#
# This is the thin entry the emulator job calls once an emulator is booted. The full native
# harness — building the Expo Android debug binary for the exact candidate SHA, driving the
# Maestro device-layout flows with captureHierarchy at every checkpoint, and emitting a capture
# bundle — lands under AUG-1376. Until that harness is present this script exits with a clear,
# non-silent "pending" message so the job never pretends to have run a device.
set -euo pipefail
cd "$(dirname "$0")/.."   # scoresnap/e2e/device-layout
ROOT="$(cd ../../.. && pwd)"

echo "device-layout: android-compact leg on $(adb devices | tr '\n' ' ')"

FLOWS="$ROOT/.maestro/flows/device-layout"
HARNESS="$ROOT/.maestro/device-layout-android.yaml"
if [ ! -d "$FLOWS" ] && [ ! -f "$HARNESS" ]; then
  echo "::notice::device-layout native harness (Maestro device-layout flows) not present yet — tracked by AUG-1376. No device capture produced."
  echo "PENDING-NATIVE-HARNESS AUG-1376"
  # Non-silent: fail so a REQUIRED check cannot go green on an empty native leg. The job only
  # runs at all when DEVICE_LAYOUT_NATIVE=='true', so this does not block PRs today.
  exit 1
fi

# 1. Build + install the candidate Android binary (AUG-1376 provides build-android.sh).
bash "$ROOT/scoresnap/e2e/device-layout/scripts/build-android.sh"
# 2. Drive the Maestro device-layout flows, capturing hierarchy at every checkpoint into a bundle.
OUT="$(mktemp -d)/bundle.json"
maestro test "$FLOWS" --format junit --output "$OUT.maestro" || true
node scripts/bundle-from-maestro.mjs "$OUT.maestro" --platform android --profile android-compact --out "$OUT"
# 3. Run the deterministic geometry gate on the captured bundle.
node ../run-geometry.mjs "$OUT" --waivers ../waivers.json
