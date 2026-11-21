#!/usr/bin/env bash
# Test-only adapter. Smoke is never a successful full device-layout leg.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
exec python3 "$ROOT/qa/native-580b437/entrypoint.py" android
