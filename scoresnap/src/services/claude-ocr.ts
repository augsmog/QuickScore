/**
 * Cloud OCR fallback using Claude Vision API.
 * Used when ML Kit confidence is too low (handwritten, blurry, etc.)
 */

import * as FileSystem from "expo-file-system";
import { ScannedPlayer, nameConfidence } from "./score-parser";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface ClaudeOCRResult {
  players: ScannedPlayer[];
  averageConfidence: number;
}

/**
 * Send a scorecard image to Claude Vision API for extraction.
 */
export async function recognizeWithClaude(
  imageUri: string
): Promise<ClaudeOCRResult> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("EXPO_PUBLIC_ANTHROPIC_API_KEY is not configured");
  }

  // Read image as base64
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Determine media type from URI
  const mediaType = imageUri.toLowerCase().endsWith(".png")
    ? "image/png"
    : "image/jpeg";

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: `Extract all player names and their 18-hole golf scores from this scorecard image.

Return ONLY a JSON object in this exact format (no other text):
{
  "players": [
    {
      "name": "Player Name",
      "scores": [4, 5, 3, 4, 5, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4],
      "confidence": [0.95, 0.9, 0.95, 0.85, 0.9, 0.95, 0.9, 0.95, 0.9, 0.95, 0.9, 0.95, 0.9, 0.85, 0.9, 0.95, 0.9, 0.95]
    }
  ],
  "par": [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]
}

Rules:
- Each player must have exactly 18 scores (use 0 for missing holes)
- Each player must have exactly 18 confidence values (0.0-1.0)
- Confidence should reflect how certain you are of each score read
- Lower confidence (< 0.7) for unclear, smudged, or ambiguous values
- Include the par row if visible on the scorecard
- If fewer than 18 holes are visible, fill remaining with 0 and confidence 0
- Names should match exactly what's written (initials, abbreviations, etc.)`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${errorText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || "";

  // Extract JSON from response (may be wrapped in markdown code blocks)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude did not return valid JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  const players: ScannedPlayer[] = (parsed.players || []).map(
    (p: any) => ({
      name: String(p.name || "Unknown"),
      scores: ensureArray(p.scores, 18, 0),
      confidence: ensureArray(p.confidence, 18, 0.8),
      nameConfidence: nameConfidence(String(p.name || "")),
      matchedPlayerId: null,
    })
  );

  // Calculate average confidence
  const allConfs = players.flatMap((p) => [
    ...p.confidence.filter((c) => c > 0),
    p.nameConfidence,
  ]);
  const averageConfidence =
    allConfs.length > 0
      ? allConfs.reduce((a, b) => a + b, 0) / allConfs.length
      : 0;

  return { players, averageConfidence };
}

/**
 * Ensure an array has exactly `length` elements, padding with `fill`.
 */
function ensureArray(arr: any, length: number, fill: number): number[] {
  if (!Array.isArray(arr)) return new Array(length).fill(fill);
  const result = arr.slice(0, length).map((v: any) => {
    const n = Number(v);
    return isNaN(n) ? fill : n;
  });
  while (result.length < length) result.push(fill);
  return result;
}
