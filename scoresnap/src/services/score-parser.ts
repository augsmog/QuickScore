/**
 * Score parser utilities for extracting structured scorecard data
 * from raw OCR text blocks.
 */

export interface ScannedPlayer {
  name: string;
  source?: "paste" | "ocr";
  scores: (number | null)[];
  requiredHoles?: number[];
  alignmentError?: string;
  confidence: number[];
  nameConfidence: number;
  matchedPlayerId: string | null;
}

export interface ParsedGrid {
  players: ScannedPlayer[];
  parRow: number[];
  holeCount: number;
}

/** Split pasted rows, preserving empty comma/tab cells and single spaces in names. */
export function textToGrid(text: string): string[][] {
  return text
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const delimiter = line.includes(",") ? "," : line.includes("\t") ? "\t" : / {2,}/;
      const row = typeof delimiter === "string" ? line : line.trim();
      return row.split(delimiter).map((cell) => cell.trim());
    });
}

/**
 * Normalize a raw string score value to a number.
 * Non-numeric readings need explicit human correction.
 */
export function normalizeScore(raw: string): { value: number | null; confidence: number } {
  const cleaned = typeof raw === "string" ? raw.trim() : "";

  // Empty or dash = no score
  if (!cleaned || cleaned === "-" || cleaned === "—" || cleaned === "–") {
    return { value: null, confidence: 0 };
  }

  // Direct number
  const num = /^\d+$/.test(cleaned) ? Number(cleaned) : NaN;
  if (Number.isSafeInteger(num) && num > 0) {
    return { value: num, confidence: 0.95 };
  }

  return { value: null, confidence: 0 };
}

/**
 * Detect if a row of text looks like a par row (values 3-5, consistent).
 * Par rows must:
 * - Have 9 or 18 valid values
 * - All values be in range 3-6 (allowing par 6 occasionally)
 * - Sum to typical course total (60-78 for 18, 30-39 for 9)
 * - Not be all the same value (player row of all 4s is not par)
 */
export function isParRow(values: string[]): boolean {
  const nums = values.map((v) => /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

  // Must have at least 9 values for a full 9 holes
  if (nums.length !== 9 && nums.length !== 18) return false;

  // All values must be in typical par range (3-6)
  if (!nums.every((n) => n >= 3 && n <= 6)) return false;

  // Reject rows that are all the same value (e.g., all 4s is a player row, not par)
  const allSame = nums.every((n) => n === nums[0]);
  if (allSame) return false;

  // Check total is in typical course par range
  const total = nums.reduce((a, b) => a + b, 0);
  if (nums.length >= 18) {
    // 18 holes: typical par 70-74, allow 60-78
    if (total < 60 || total > 78) return false;
  } else if (nums.length >= 9) {
    // 9 holes: typical par 35-37, allow 30-39
    if (total < 30 || total > 39) return false;
  }

  return true;
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
  parValues?: number[],
  source: "paste" | "ocr" = "ocr"
): ParsedGrid {
  const players: ScannedPlayer[] = [];
  let parRow: number[] = [];
  let holeCount = 18;

  // A numbered Hole header is authoritative; summary columns never become holes.
  const header = rows.find((row) => /^holes?:?$/i.test(row[0]?.trim() ?? ""));
  const columns = header?.flatMap((cell, index) =>
    index > 0 && /^\d+$/.test(cell.trim()) && Number(cell) >= 1 && Number(cell) <= 18
      ? [{ index, hole: Number(cell) }] : []);
  const hasHeader = columns && (columns.length === 9 || columns.length === 18)
    && columns.every((column, index) => column.hole === index + columns[0].hole);
  if (hasHeader) holeCount = columns.length;

  function cellsFor(row: string[]): string[] {
    if (hasHeader) return columns!.map(({ index }) => row[index] ?? "");
    const cells = row.slice(1);
    // Without a header, only remove an embedded OUT when it equals the
    // preceding nine scores. Trailing IN/total cells are outside the 18 holes.
    if (cells.length >= 19 && cells.length <= 21) {
      const front = cells.slice(0, 9).map(normalizeScore);
      const subtotal = cells[9].trim();
      if (/^\d+$/.test(subtotal) && front.every((score) => score.confidence >= 0.55)
        && Number(subtotal) === front.reduce((sum, score) => sum + (score.value ?? 0), 0)) {
        return [...cells.slice(0, 9), ...cells.slice(10, 19)];
      }
    }
    return cells.slice(0, holeCount);
  }

  for (const row of rows) {
    if (row.length < 3 || row === header) continue;

    const firstCell = row[0].trim();
    const scoreCells = cellsFor(row);

    // Check if this is a par row by looking at label first, then values
    const hasParLabel = /^par\s*:?$/i.test(firstCell);
    const valuesLookLikePar = isParRow(scoreCells);

    if (hasParLabel && valuesLookLikePar) {
      // Strong match: labeled "Par" and values look like par
      parRow = scoreCells
        .map((v) => parseInt(v.trim(), 10))
        .filter((n) => !isNaN(n));

      continue;
    } else if (hasParLabel && !valuesLookLikePar) {
      // Labeled "Par" but values don't match - skip this row (likely malformed)
      continue;
    } else if (!hasParLabel && !isPlayerName(firstCell) && valuesLookLikePar && parRow.length === 0) {
      // No player name or par label, but values look like par and we haven't found par yet
      // Only accept this if it's in the first few rows (typical scorecard layout)
      const rowIndex = rows.indexOf(row);
      if (rowIndex < 5) {
        parRow = scoreCells
          .map((v) => parseInt(v.trim(), 10))
          .filter((n) => !isNaN(n));

        continue;
      }
    }

    // Check if first cell is a player name
    if (isPlayerName(firstCell)) {
      const scores: (number | null)[] = [];
      const confidence: number[] = [];

      for (let i = 0; i < Math.min(scoreCells.length, holeCount); i++) {
        const cell = scoreCells[i];
        const trailingUnplayed = source === "paste" && cell.trim() === "0"
          && scoreCells.length === holeCount && scoreCells.slice(i).every(c => c.trim() === "0")
          && scoreCells.slice(0, i).some(c => normalizeScore(c).value !== null);
        const parsed = trailingUnplayed ? { value: 0, confidence: 0.95 } : normalizeScore(cell);
        scores.push(parsed.value);
        confidence.push(parsed.confidence);
      }

      // Pad to 18 holes
      while (scores.length < holeCount) {
        scores.push(null);
        confidence.push(0);
      }

      players.push({
        name: firstCell,
        source,
        ...(!hasHeader && row.length > 19 && cellsFor(row)[9] === row[10] ? {
          alignmentError: "Unnumbered summary columns have ambiguous alignment. Retain these readings and enter scores manually."
        } : {}),
        requiredHoles: hasHeader ? columns!.map(c => c.hole) : Array.from({ length: holeCount }, (_, i) => i + 1),
        scores,
        confidence,
        nameConfidence: nameConfidence(firstCell),
        matchedPlayerId: null,
      });
    }
  }

  // Use provided par values if given, otherwise use default
  if (parRow.length === 0) {
    if (parValues && parValues.length > 0) {
      parRow = parValues;
    } else {
      parRow = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];
    }
  }

  return { players, parRow, holeCount };
}
