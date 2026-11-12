#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <node_modules-source> <project-node_modules-link>" >&2
  exit 2
fi

source=$1
link=$2
if [[ ! -d "$source" ]]; then
  echo "nightly preflight: node_modules source missing: $source" >&2
  exit 1
fi

if [[ -L "$link" ]]; then
  current=$(readlink -f -- "$link" 2>/dev/null || true)
  desired=$(readlink -f -- "$source")
  if [[ "$current" == "$desired" ]]; then exit 0; fi
  rm -- "$link"
elif [[ -e "$link" ]]; then
  echo "nightly preflight: refusing to replace non-symlink $link" >&2
  exit 1
fi

ln -s "$source" "$link"
