/**
 * On-device OCR using Google ML Kit Text Recognition.
 * Fast, free, works offline — but less accurate on handwriting.
 */

import TextRecognition, {
  TextRecognitionResult,
  TextBlock,
  TextLine,
} from "@react-native-ml-kit/text-recognition";
import {
  ScannedPlayer,
  parseScoreGrid,
  isPlayerName,
  normalizeScore,
  nameConfidence,
  ParsedGrid,
} from "./score-parser";

export interface MLKitResult {
  players: ScannedPlayer[];
  averageConfidence: number;
  rawText: string;
  parRow: number[];
}

/**
 * Run ML Kit text recognition on a scorecard image.
 */
export async function recognizeWithMLKit(
  imageUri: string
): Promise<MLKitResult> {
  const result: TextRecognitionResult =
    await TextRecognition.recognize(imageUri);

  const rawText = result.text;

  // Extract text blocks and organize into a grid
  const grid = extractGrid(result.blocks);

  // Parse the grid into structured player data
  const parsed = parseScoreGrid(grid);

  // Calculate average confidence
  const allConfidences = parsed.players.flatMap((p) => [
    ...p.confidence.filter((c) => c > 0),
    p.nameConfidence,
  ]);
  const averageConfidence =
    allConfidences.length > 0
      ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
      : 0;

  return {
    players: parsed.players,
    averageConfidence,
    rawText,
    parRow: parsed.parRow,
  };
}

/**
 * Extract a 2D grid from ML Kit text blocks.
 * Groups text elements by vertical position (y-coordinate) to form rows,
 * then sorts each row left-to-right.
 */
function extractGrid(blocks: TextBlock[]): string[][] {
  // Collect all text elements with their positions
  const elements: { text: string; x: number; y: number; height: number }[] = [];

  for (const block of blocks) {
    for (const line of block.lines) {
      for (const element of line.elements) {
        if (element.frame) {
          elements.push({
            text: element.text,
            x: element.frame.left,
            y: element.frame.top,
            height: element.frame.height,
          });
        }
      }
    }
  }

  if (elements.length === 0) return [];

  // Sort by vertical position
  elements.sort((a, b) => a.y - b.y);

  // Group into rows based on y-position proximity
  const rowThreshold = elements[0]?.height
    ? elements[0].height * 0.6
    : 15;
  const rows: typeof elements[] = [];
  let currentRow: typeof elements = [elements[0]];

  for (let i = 1; i < elements.length; i++) {
    const el = elements[i];
    const prevY = currentRow[currentRow.length - 1].y;

    if (Math.abs(el.y - prevY) <= rowThreshold) {
      currentRow.push(el);
    } else {
      rows.push(currentRow);
      currentRow = [el];
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  // Sort each row left-to-right and extract text
  return rows.map((row) =>
    row.sort((a, b) => a.x - b.x).map((el) => el.text)
  );
}

/**
 * Quick check if ML Kit is available on this device.
 */
export async function isMLKitAvailable(): Promise<boolean> {
  try {
    // ML Kit is always available on native via the module
    return typeof TextRecognition.recognize === "function";
  } catch {
    return false;
  }
}
