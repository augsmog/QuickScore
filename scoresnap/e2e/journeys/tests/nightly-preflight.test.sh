#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
CHECK="$SCRIPT_DIR/check-node-modules-lock.sh"
LINK="$SCRIPT_DIR/ensure-node-modules-link.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/tree/node_modules" "$tmp/stale-node_modules"
touch "$tmp/stale-node_modules/keep-me"
mkdir -p "$tmp/project"
mkdir -p "$tmp/project/real-node_modules"
touch "$tmp/project/real-node_modules/preserve-me"

ln -s "$tmp/stale-node_modules" "$tmp/project/stale-link"
bash "$LINK" "$tmp/tree/node_modules" "$tmp/project/stale-link"
[[ "$(readlink -f "$tmp/project/stale-link")" == "$(readlink -f "$tmp/tree/node_modules")" ]]
[[ -f "$tmp/stale-node_modules/keep-me" ]]
bash "$LINK" "$tmp/tree/node_modules" "$tmp/project/stale-link"
ln -s "$tmp/missing-node_modules" "$tmp/project/dangling-link"
bash "$LINK" "$tmp/tree/node_modules" "$tmp/project/dangling-link"
[[ "$(readlink -f "$tmp/project/dangling-link")" == "$(readlink -f "$tmp/tree/node_modules")" ]]
if bash "$LINK" "$tmp/tree/node_modules" "$tmp/project/real-node_modules" >"$tmp/link-out" 2>&1; then
  echo 'expected non-symlink node_modules to be refused' >&2
  exit 1
fi
[[ -f "$tmp/project/real-node_modules/preserve-me" ]]

printf 'lockfile v1\n' > "$tmp/package-lock.json"
sha256sum "$tmp/package-lock.json" | cut -d ' ' -f 1 > "$tmp/tree/LOCK_SHA"

bash "$CHECK" "$tmp/tree/node_modules" "$tmp/package-lock.json"

printf 'lockfile v2\n' > "$tmp/package-lock.json"
if bash "$CHECK" "$tmp/tree/node_modules" "$tmp/package-lock.json" >"$tmp/out" 2>&1; then
  echo 'expected lockfile drift to fail' >&2
  exit 1
fi
grep -q 'shared node_modules lockfile drift' "$tmp/out"
echo 'nightly node_modules and lockfile preflight: PASS'
