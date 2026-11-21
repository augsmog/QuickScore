#!/usr/bin/env bash
# Test-only trusted manual intake; all outcomes keep full native gate red.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
exec python3 -B "$ROOT/qa/iphone-a690ef23/intake.py"
