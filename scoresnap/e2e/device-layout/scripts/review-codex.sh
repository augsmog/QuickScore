#!/usr/bin/env bash
# Reference reviewer for DEVICE_LAYOUT_VISION_CMD on the Mac runner (Claude-built SnapScore =>
# Codex gpt-6-astra/high, read-only; never Grok). Args: <image> <meta.json>. Prints ONE review
# JSON object (lib/vision-schema.mjs) on stdout. Requires the Codex CLI to be signed in on the
# runner host (runner-side; no credentials in the repo or in GitHub).
#   DEVICE_LAYOUT_VISION_CMD="bash <repo>/scoresnap/e2e/device-layout/scripts/review-codex.sh"
set -euo pipefail
IMG="${1:?image}"; META="${2:?meta.json}"
DL="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp)"
PROMPT="You are the SnapScore device-layout vision reviewer. Apply this rubric exactly:

$(cat "$DL/lib/vision-rubric.md")

Screenshot metadata (copy sourceSha, buildHash, artifactHash, device, flow, checkpoint verbatim into the review):
$(cat "$META")

Reviewer identity: {\"provider\":\"openai\",\"model\":\"gpt-6-astra\",\"effort\":\"high\"}.
Reply with ONLY the review JSON object, no prose, no code fence."
codex exec -m gpt-6-astra -c model_reasoning_effort=high --sandbox read-only --skip-git-repo-check \
  -i "$IMG" --output-last-message "$OUT" "$PROMPT" >/dev/null
# Strip an accidental code fence, then print.
sed -e '/^```/d' "$OUT"
rm -f "$OUT"
