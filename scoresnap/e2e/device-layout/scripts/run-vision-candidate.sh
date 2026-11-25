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
# Report-only profiles (owner t1557u, Nov 20 2026): iphone-se-3 vision findings are produced and
# printed but do not fail the required gate until 1.0.2. Launch-blocking: iphone-16-pro + android.
REPORT_ONLY="${DEVICE_LAYOUT_REPORT_ONLY_PROFILES:-iphone-se-3}"
is_report_only() { case ",$REPORT_ONLY," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
summary() { if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$1" >> "$GITHUB_STEP_SUMMARY"; else echo "$1"; fi; }

# bash 3.2-safe (macOS runner): no mapfile, no empty-array expansion under set -u.
LIST="$(find "$IN" -name bundle.json | sort)"
[ -n "$LIST" ] || { echo "::error::no native capture bundles found under $IN"; exit 1; }
rc=0
summary "### candidate vision review"
while IFS= read -r b; do
  [ -n "$b" ] || continue
  prof="$(basename "$(dirname "$b")")"
  echo "== candidate vision: $prof"
  prc=0
  node "$DL/run-vision.mjs" --candidate "$b" --review-cmd "$DEVICE_LAYOUT_VISION_CMD" \
    --expect-sha "$SHA" --profile "$prof" || prc=1
  if is_report_only "$prof"; then
    [ "$prc" = 0 ] && summary "- **$prof** (REPORT-ONLY, not blocking until 1.0.2): PASS" \
      || { summary "- **$prof** (REPORT-ONLY, not blocking until 1.0.2): FAIL — see log/artifacts"; echo "::notice::candidate vision $prof FAIL — REPORT-ONLY (owner t1557u), not failing the gate"; }
  else
    [ "$prc" = 0 ] && summary "- **$prof** (REQUIRED): PASS" || { summary "- **$prof** (REQUIRED): FAIL"; rc=1; }
  fi
done <<< "$LIST"
exit $rc
