#!/usr/bin/env bash
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ $# == 1 ]] || { echo "Usage: $0 <fresh-live-catalog.json>" >&2; exit 2; }
# Python only. Never reads credentials, connects, or invokes Supabase.
python3 "$here/drift.py" compare "$here/../schema-snapshot/live.json" "$1"
python3 "$here/drift.py" ledger "$1" --mode live
printf '%s\n' 'Guard passed.' \
  'Next: apply approved M2 (20261027120000_sync_foundation), then M2b (20261027130000_guest_write_guard), per the live-apply plan.'
