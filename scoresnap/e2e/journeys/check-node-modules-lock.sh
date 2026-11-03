#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <node_modules> <package-lock.json>" >&2
  exit 2
fi

node_modules_src=$1
lockfile=$2
marker="$(dirname -- "$node_modules_src")/LOCK_SHA"
if [[ ! -d "$node_modules_src" ]]; then
  echo "nightly preflight: node_modules directory missing: $node_modules_src" >&2
  exit 1
fi
if [[ ! -f "$lockfile" ]]; then
  echo "nightly preflight: package lockfile missing: $lockfile" >&2
  exit 1
fi
if [[ ! -f "$marker" ]]; then
  echo "nightly preflight: expected lockfile SHA marker missing: $marker" >&2
  exit 1
fi

expected=$(tr -d '[:space:]' < "$marker")
actual=$(sha256sum "$lockfile" | cut -d ' ' -f 1)
if [[ "$expected" != "$actual" ]]; then
  echo "nightly preflight: shared node_modules lockfile drift (tree=$expected project=$actual); rebuild the shared tree for this package-lock.json" >&2
  exit 1
fi
