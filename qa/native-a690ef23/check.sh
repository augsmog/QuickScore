#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
python3 "$here/check-source.py"
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$here/android" -p 'test_*.py' -v
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s "$here" -p 'test_entrypoint.py' -v
bash -n "$here/android/build-release.sh"
bash -n "$here/../../scoresnap/e2e/device-layout/scripts/run-android-compact.sh"
bash -n "$here/../../scoresnap/e2e/device-layout/scripts/run-ios-sim.sh"
