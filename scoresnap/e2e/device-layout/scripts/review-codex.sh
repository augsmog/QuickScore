#!/usr/bin/env bash
# Reference reviewer for DEVICE_LAYOUT_VISION_CMD on the Mac runner (Claude-built SnapScore =>
# Codex gpt-6-astra/high, read-only; never Grok). Batch contract (run-vision.mjs batchReview):
# $1 = manifest JSON {items:[{image, meta}]}; prints a JSON array of review objects
# (lib/vision-schema.mjs), one per item, same order. One Codex call per bundle.
# Uses the Codex CLI already signed in on the runner host; no credentials in repo or GitHub.
#   DEVICE_LAYOUT_VISION_CMD='bash "$GITHUB_WORKSPACE/scoresnap/e2e/device-layout/scripts/review-codex.sh"'
set -euo pipefail
MANIFEST="${1:?manifest.json}"
DL="$(cd "$(dirname "$0")/.." && pwd)"
CODEX="${DEVICE_LAYOUT_CODEX_BIN:-codex}"
OUT="$(mktemp)"
IMGS=()
while IFS= read -r img; do IMGS+=(-i "$img"); done < <(node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const it of m.items) console.log(it.image);' "$MANIFEST")
METAS="$(node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  console.log(JSON.stringify(m.items.map((it, i) => ({ image_index: i + 1, ...it.meta })), null, 1));' "$MANIFEST")"
PROMPT="You are the SnapScore device-layout vision reviewer. Apply this rubric exactly:

$(cat "$DL/lib/vision-rubric.md")

You are given $(( ${#IMGS[@]} / 2 )) screenshots, attached in this order. Metadata per image (image_index is 1-based attachment order); copy sourceSha, buildHash, artifactHash, device, flow, checkpoint verbatim into that image's review:
$METAS

Reviewer identity for every review: {\"provider\":\"openai\",\"model\":\"gpt-6-astra\",\"effort\":\"high\"}.
Reply with ONLY a JSON array containing exactly one review object per image, in image_index order. No prose, no code fence."
"$CODEX" exec -m gpt-6-astra -c model_reasoning_effort=high --sandbox read-only --skip-git-repo-check \
  "${IMGS[@]}" --output-last-message "$OUT" "$PROMPT" >/dev/null </dev/null
sed -e '/^```/d' "$OUT"
rm -f "$OUT"
