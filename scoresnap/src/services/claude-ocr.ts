/**
 * Cloud OCR fallback using Claude Vision API via Supabase Edge Function.
 * Used when ML Kit confidence is too low (handwritten, blurry, etc.)
 */

import * as FileSystem from "expo-file-system";
import { supabase } from "../db/supabase";
import { ScannedPlayer } from "./score-parser";

interface ClaudeOCRResult {
  players: ScannedPlayer[];
  averageConfidence: number;
}

/**
 * Send a scorecard image to our OCR service for extraction.
 */
export async function recognizeWithClaude(
  imageUri: string
): Promise<ClaudeOCRResult> {
  // Read image as base64
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Determine media type from URI
  const mediaType = imageUri.toLowerCase().endsWith(".png")
    ? "image/png"
    : "image/jpeg";

  // Call our Edge Function
  const { data, error } = await supabase.functions.invoke("ocr-scorecard", {
    body: {
      imageData: base64,
      mediaType,
    },
  });

  if (error) {
    throw new Error(`OCR service error: ${error.message}`);
  }

  if (!data || !data.players) {
    throw new Error("OCR service returned invalid response");
  }

  const players: ScannedPlayer[] = data.players.map((p: any) => ({
    name: String(p.name || "Unknown"),
    scores: ensureArray(p.scores, 18, 0),
    confidence: ensureArray(p.confidence, 18, 0.8),
    nameConfidence: p.nameConfidence || 0.8,
    matchedPlayerId: null,
  }));

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
