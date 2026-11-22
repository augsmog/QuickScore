#!/usr/bin/env bash
# Existing required native boundary; no success from missing/supplemental evidence.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec python3 -B "$HERE/checkpoint/gate_android.py"
