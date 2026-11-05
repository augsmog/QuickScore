import { useSettingsStore } from "../stores/settings-store";
import { useScanStore } from "../stores/scan-store";
/**
 * Cloud OCR fallback using Claude Vision API via Supabase Edge Function.
 * Used when ML Kit confidence is too low (handwritten, blurry, etc.)
 */

import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../db/supabase";
import { normalizePlayer } from "./ocr-review";
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
  if (useSettingsStore.getState().ocrConsent !== true) throw new Error("Cloud OCR consent is required. Use manual entry.");
  // Read image as base64
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Determine media type from URI
  const mediaType = imageUri.toLowerCase().endsWith(".png")
    ? "image/png"
    : "image/jpeg";

  // Recheck after the asynchronous file read so withdrawal takes effect immediately.
  if (useSettingsStore.getState().ocrConsent !== true) throw new Error("Cloud OCR consent is required. Use manual entry.");
  if (!useScanStore.getState().useScan()) throw new Error("Monthly cloud scan limit reached. Use manual entry or upgrade.");
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

  if (!Array.isArray(data.players)) throw new Error("OCR service returned invalid response");
  const players: ScannedPlayer[] = data.players.map((p: any) => normalizePlayer({ ...p, source: "ocr", name: String(p?.name || "Unknown") }));

  // Calculate average confidence
  const allConfs = players.flatMap((p) => [
    ...p.confidence,
    p.nameConfidence,
  ]);
  const averageConfidence =
    allConfs.length > 0
      ? allConfs.reduce((a, b) => a + b, 0) / allConfs.length
      : 0;

  return { players, averageConfidence };
}
