/**
 * Score parser utilities for extracting structured scorecard data
 * from raw OCR text blocks.
 */

export interface ScannedPlayer {
  name: string;
  scores: number[];
  confidence: number[];
  nameConfidence: number;
  matchedPlayerId: string | null;
}

export interface ParsedGrid {
  players: ScannedPlayer[];
  parRow: number[];
  holeCount: number;
}

/**
 * Normalize a raw string score value to a number.
 * Handles common OCR misreads: O→0, l→1, S→5, etc.
 */
export function normalizeScore(raw: string): { value: number; confidence: number } {
  const cleaned = raw.trim();

  // Empty or dash = no score
  if (!cleaned || cleaned === "-" || cleaned === "—" || cleaned === "–") {
    return { value: 0, confidence: 0.9 };
  }

  // Direct number
  const num = parseInt(cleaned, 10);
  if (!isNaN(num) && num >= 1 && num <= 15) {
    return { value: num, confidence: 0.95 };
  }

  // Common OCR misreads
  const ocrFixes: Record<string, number> = {
    O: 0, o: 0, D: 0,
    l: 1, I: 1, "|": 1,
    Z: 2, z: 2,
    E: 3,
    A: 4, h: 4,
    S: 5, s: 5,
    G: 6, b: 6,
    T: 7,
    B: 8,
    g: 9, q: 9,
  };

  if (cleaned.length === 1 && ocrFixes[cleaned] !== undefined) {
    return { value: ocrFixes[cleaned], confidence: 0.55 };
  }

  // Try removing non-numeric chars
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length > 0) {
    const parsed = parseInt(digitsOnly, 10);
    if (parsed >= 1 && parsed <= 15) {
      return { value: parsed, confidence: 0.65 };
    }
  }

  return { value: 0, confidence: 0.2 };
}

/**
 * Detect if a row of text looks like a par row (values 3-5, consistent).
 */
export function isParRow(values: string[]): boolean {
  const nums = values.map((v) => parseInt(v.trim(), 10)).filter((n) => !isNaN(n));
  if (nums.length < 6) return false;
  return nums.every((n) => n >= 3 && n <= 5);
}

/**
 * Detect if a text value looks like a player name (not a number).
 */
export function isPlayerName(text: string): boolean {
  const cleaned = text.trim();
  if (!cleaned || cleaned.length < 2) return false;
  // If it's purely numeric, not a name
  if (/^\d+$/.test(cleaned)) return false;
  // If it looks like a header (Hole, Par, Total, etc.)
  const headers = ["hole", "par", "total", "out", "in", "hcp", "hdcp", "handicap", "net", "gross"];
  if (headers.includes(cleaned.toLowerCase())) return false;
  // Has at least one letter
  return /[a-zA-Z]/.test(cleaned);
}

/**
 * Calculate name confidence based on characteristics.
 */
export function nameConfidence(name: string): number {
  const cleaned = name.trim();
  // Full name (First Last) = high confidence
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(cleaned)) return 0.95;
  // First initial + last (M. Thompson)
  if (/^[A-Z]\.\s?[A-Z][a-z]+$/.test(cleaned)) return 0.85;
  // Just initials (D.R., JB)
  if (/^[A-Z]\.?[A-Z]\.?$/.test(cleaned)) return 0.45;
  // Single name
  if (/^[A-Z][a-z]+$/.test(cleaned)) return 0.8;
  // Abbreviated (Chris L, J. Parks)
  if (/^[A-Z][a-z]+ [A-Z]\.?$/.test(cleaned)) return 0.75;
  // Anything else with letters
  if (/[a-zA-Z]/.test(cleaned)) return 0.6;
  return 0.3;
}

/**
 * Parse a 2D grid of text into structured scorecard data.
 * Expects rows where first column is player name and remaining are scores.
 */
export function parseScoreGrid(
  rows: string[][],
  parValues?: number[]
): ParsedGrid {
  const players: ScannedPlayer[] = [];
  let parRow: number[] = [];
  let holeCount = 18;

  for (const row of rows) {
    if (row.length < 3) continue;

    const firstCell = row[0];

    // Check if this is a par row
    const scoreCells = row.slice(1);
    if (isParRow(scoreCells) && (
      firstCell.toLowerCase().includes("par") || isParRow(scoreCells)
    )) {
      parRow = scoreCells
        .map((v) => parseInt(v.trim(), 10))
        .filter((n) => !isNaN(n));
      holeCount = parRow.length;
      continue;
    }

    // Check if first cell is a player name
    if (isPlayerName(firstCell)) {
      const scores: number[] = [];
      const confidence: number[] = [];

      for (let i = 1; i < Math.min(row.length, holeCount + 1); i++) {
        const parsed = normalizeScore(row[i]);
        scores.push(parsed.value);
        confidence.push(parsed.confidence);
      }

      // Pad to 18 holes
      while (scores.length < 18) {
        scores.push(0);
        confidence.push(0);
      }

      players.push({
        name: firstCell.trim(),
        scores,
        confidence,
        nameConfidence: nameConfidence(firstCell),
        matchedPlayerId: null,
      });
    }
  }

  // Default par if not found
  if (parRow.length === 0) {
    parRow = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];
  }

  return { players, parRow, holeCount };
}
