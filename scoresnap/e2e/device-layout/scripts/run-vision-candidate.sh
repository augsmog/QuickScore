#!/usr/bin/env bash
# Candidate vision acceptance over every native capture bundle under $1 (downloaded artifacts).
# Reviewer command comes from DEVICE_LAYOUT_VISION_CMD (runner-side configuration; it receives
# <image> <meta.json> and prints the review JSON). Policy (config reviewerPolicy): cross-company,
# Codex gpt-6-astra/high for Claude-built SnapScore; never Grok. Unset reviewer => FAIL.
set -euo pipefail
DL="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${DEVICE_LAYOUT_ROOT:-$(cd "$DL/../../.." && pwd)}"
IN="${1:?usage: run-vision-candidate.sh <artifacts-dir>}"
SHA="${DEVICE_LAYOUT_EXPECT_SHA:-$(git -C "$ROOT" rev-parse HEAD)}"
if [ -z "${DEVICE_LAYOUT_VISION_CMD:-}" ]; then
  echo "::error::DEVICE_LAYOUT_VISION_CMD not configured on this runner — candidate vision review unavailable (fail closed)"
  exit 1
fi
# bash 3.2-safe (macOS runner): no mapfile, no empty-array expansion under set -u.
LIST="$(find "$IN" -name bundle.json | sort)"
[ -n "$LIST" ] || { echo "::error::no native capture bundles found under $IN"; exit 1; }
rc=0
while IFS= read -r b; do
  [ -n "$b" ] || continue
  prof="$(basename "$(dirname "$b")")"
  echo "== candidate vision: $prof"
  node "$DL/run-vision.mjs" --candidate "$b" --review-cmd "$DEVICE_LAYOUT_VISION_CMD" \
    --expect-sha "$SHA" --profile "$prof" || rc=1
done <<< "$LIST"
exit $rc
