/**
 * OCR Service — orchestrates scorecard scanning.
 *
 * Pipeline:
 * 1. Try ML Kit on-device (fast, free, offline)
 * 2. If confidence < threshold, fallback to Claude Vision API
 * 3. Return ScannedPlayer[] for the review screen
 */

import { ScannedPlayer } from "./score-parser";
import {
  recognizeWithMLKit,
  isMLKitAvailable,
} from "./ml-kit-ocr";
import { recognizeWithClaude } from "./claude-ocr";

const CONFIDENCE_THRESHOLD = 0.7;

export interface ScanResult {
  players: ScannedPlayer[];
  source: "ml-kit" | "claude" | "ml-kit+claude";
  averageConfidence: number;
  parRow: number[];
}

export type ScanProgressCallback = (progress: number, message: string) => void;

/**
 * Scan a scorecard image and extract player scores.
 *
 * @param photoUri - file:// URI of the captured photo
 * @param onProgress - callback for progress updates (0-100)
 * @returns Structured scan results
 */
export async function scanScorecard(
  photoUri: string,
  onProgress?: ScanProgressCallback
): Promise<ScanResult> {
  onProgress?.(5, "Preparing image...");

  // Step 1: Try ML Kit on-device
  const mlKitAvailable = await isMLKitAvailable();

  if (mlKitAvailable) {
    onProgress?.(15, "Detecting scorecard layout...");

    try {
      const mlResult = await recognizeWithMLKit(photoUri);
      onProgress?.(50, "Analyzing scores...");

      // If ML Kit found players with decent confidence, use it
      if (
        mlResult.players.length >= 2 &&
        mlResult.averageConfidence >= CONFIDENCE_THRESHOLD
      ) {
        onProgress?.(90, "Validating results...");
        onProgress?.(100, "Done");
        return {
          players: mlResult.players,
          source: "ml-kit",
          averageConfidence: mlResult.averageConfidence,
          parRow: mlResult.parRow,
        };
      }

      // ML Kit found something but confidence is low — try Claude as well
      if (mlResult.players.length > 0) {
        onProgress?.(55, "Enhancing with AI...");
        try {
          const claudeResult = await recognizeWithClaude(photoUri);
          onProgress?.(90, "Validating results...");

          // Use whichever has higher confidence
          if (claudeResult.averageConfidence > mlResult.averageConfidence) {
            onProgress?.(100, "Done");
            return {
              players: claudeResult.players,
              source: "ml-kit+claude",
              averageConfidence: claudeResult.averageConfidence,
              parRow: mlResult.parRow,
            };
          }

          onProgress?.(100, "Done");
          return {
            players: mlResult.players,
            source: "ml-kit",
            averageConfidence: mlResult.averageConfidence,
            parRow: mlResult.parRow,
          };
        } catch (claudeError) {
          // Claude failed but ML Kit had partial results — use those
          console.warn("Claude fallback failed:", claudeError);
          onProgress?.(100, "Done");
          return {
            players: mlResult.players,
            source: "ml-kit",
            averageConfidence: mlResult.averageConfidence,
            parRow: mlResult.parRow,
          };
        }
      }
    } catch (mlKitError) {
      console.warn("ML Kit failed:", mlKitError);
      // Fall through to Claude-only
    }
  }

  // Step 2: Claude Vision as primary (ML Kit unavailable or failed)
  onProgress?.(20, "Reading scores with AI...");

  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OCR requires either on-device ML Kit or a Claude API key. " +
        "Set EXPO_PUBLIC_ANTHROPIC_API_KEY in your .env file."
    );
  }

  const claudeResult = await recognizeWithClaude(photoUri);
  onProgress?.(85, "Validating data...");

  if (claudeResult.players.length === 0) {
    throw new Error(
      "Could not detect any player scores in this image. " +
        "Make sure the full scorecard is visible and in focus."
    );
  }

  onProgress?.(100, "Done");
  return {
    players: claudeResult.players,
    source: "claude",
    averageConfidence: claudeResult.averageConfidence,
    parRow: [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4],
  };
}
