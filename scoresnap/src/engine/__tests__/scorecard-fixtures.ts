/**
 * Scorecard Test Fixtures — Real scorecard data for OCR validation.
 *
 * Each fixture represents a real scorecard image with expected OCR output.
 * Use these to validate the OCR pipeline produces correct results.
 *
 * To add a new fixture:
 * 1. Place the scorecard image in scoresnap/test-scorecards/
 * 2. Manually read the scorecard and record expected data below
 * 3. Run OCR pipeline against the image and compare to fixture
 */

import { ScannedPlayer } from "../../services/score-parser";
import { Course } from "../types";

export interface ScorecardFixture {
  /** Unique fixture ID */
  id: string;
  /** Description of the scorecard */
  description: string;
  /** Image filename (relative to test-scorecards/) */
  imageFile: string;
  /** Course information */
  course: {
    name: string;
    par: number[];
    totalPar: number;
    tees?: string;
  };
  /** Expected players and scores from OCR */
  expectedPlayers: {
    name: string;
    scores: number[];
    total: number;
    handicap?: number;
    /** Areas that may be difficult for OCR */
    hardToRead?: string[];
  }[];
  /** Expected date on scorecard (if visible) */
  date?: string;
  /** Notes about OCR difficulty */
  ocrNotes: string[];
}

// ─── FIXTURE 1: Yates/Smith/Shure/Kirk (handwritten, 4 players) ────

export const FIXTURE_YATES_SMITH: ScorecardFixture = {
  id: "yates-smith-shure-kirk",
  description: "4-player handwritten scorecard with circled scores, par 71 gold tees",
  imageFile: "yates-smith-shure-kirk.jpg",
  course: {
    name: "Unknown Course (Gold Tees)",
    par: [4, 3, 4, 4, 4, 4, 3, 5, 4, 5, 4, 4, 4, 3, 4, 4, 4, 5],
    totalPar: 71,
    tees: "Gold",
  },
  expectedPlayers: [
    {
      name: "Bob Yates",
      scores: [4, 4, 6, 5, 5, 3, 5, 6, 4, 5, 4, 5, 4, 5, 3, 4, 6, 7],
      total: 88,
      handicap: 13,
      hardToRead: ["Circled scores on back 9", "Hole 18 may be 6 or 7"],
    },
    {
      name: "Ted Smith",
      scores: [5, 4, 7, 5, 4, 4, 3, 6, 4, 6, 4, 5, 4, 6, 4, 4, 8, 5],
      total: 88,
      handicap: 12,
      hardToRead: ["Hole 3 may be 7 or 1", "Hole 17 has large circled 8"],
    },
    {
      name: "Steve Shure",
      scores: [5, 3, 5, 5, 5, 4, 5, 5, 5, 5, 5, 4, 4, 6, 4, 4, 6, 5],
      total: 85,
      handicap: 11,
      hardToRead: ["Name may OCR as 'Steve Shure' or 'Steve Share'"],
    },
    {
      name: "Rob Kirk",
      scores: [5, 4, 4, 7, 4, 4, 5, 5, 5, 5, 5, 5, 4, 5, 4, 4, 5, 5],
      total: 85,
      handicap: 7,
      hardToRead: ["Hole 4 may be 7 or 1"],
    },
  ],
  date: "5/26/22",
  ocrNotes: [
    "Handwritten scores in circles — OCR must handle circled digits",
    "Multiple tee box rows (Blue/White/Red/Green/Gold) — must pick player score rows",
    "Par row is labeled 'PAR' and also 'BLUE/WHITE/RED/GREEN PAR'",
    "HCP row exists (MEN'S HCP) — useful for validation but not scores",
    "OUT/IN/TOT columns contain subtotals — don't count as hole scores",
    "Scorer signature at bottom — may generate garbage text",
    "Red pen markings for some values",
    "Reverse Cha-Cha-Cha and Team White HCP sections at bottom — ignore",
  ],
};

// ─── FIXTURE 2: Gibson/Munson/Fox (3 players, cleaner print) ────────

export const FIXTURE_GIBSON_MUNSON: ScorecardFixture = {
  id: "gibson-munson-fox",
  description: "3-player scorecard with course hole illustrations, cleaner handwriting",
  imageFile: "gibson-munson-fox.jpg",
  course: {
    name: "Unknown Course (White Tees)",
    par: [4, 3, 4, 4, 4, 4, 3, 5, 4, 5, 4, 4, 3, 4, 4, 4, 4, 5],
    totalPar: 72,
    tees: "White",
  },
  expectedPlayers: [
    {
      name: "Rikin Gibson",
      scores: [4, 3, 4, 2, 3, 5, 3, 3, 4, 4, 3, 5, 4, 3, 4, 3, 7, 3],
      total: 67,
      handicap: 24,
      hardToRead: ["Name 'Rikin' is unusual — may misread as 'Rikon'", "Hole 4 score of 2 is exceptional"],
    },
    {
      name: "Bryan Munson",
      scores: [4, 3, 4, 3, 4, 3, 4, 4, 3, 4, 4, 5, 4, 3, 4, 4, 3, 3],
      total: 66,
      handicap: 4,
      hardToRead: ["Name may OCR as 'Bryan' or 'Brian'"],
    },
    {
      name: "Eric Fox",
      scores: [4, 3, 4, 3, 5, 5, 4, 4, 4, 5, 3, 5, 4, 3, 4, 5, 3, 3],
      total: 71,
      handicap: 3,
      hardToRead: [],
    },
  ],
  date: "May 12, 2012",
  ocrNotes: [
    "Course hole illustrations at top — OCR may try to read these as text",
    "Multiple tee box rows (Black/Blue/White/Yellow) with ratings",
    "Handicap row with single-digit numbers",
    "Circled scores on some holes",
    "Signatures at bottom — may generate garbage",
    "Date format: 'May 12, 2012' in handwriting",
    "3 players only — fewer rows to parse",
  ],
};

// ─── FIXTURE 3: Vintage scorecard (very old format) ─────────────────

export const FIXTURE_VINTAGE: ScorecardFixture = {
  id: "vintage-card",
  description: "Vintage scorecard with old-style format, pencil writing, multiple player columns",
  imageFile: "vintage-card.jpg",
  course: {
    name: "Unknown Vintage Course",
    par: [4, 4, 5, 4, 3, 4, 4, 4, 4, 4, 3, 4, 4, 3, 4, 4, 5, 4],
    totalPar: 72,
  },
  expectedPlayers: [
    {
      name: "Unknown Player",
      scores: [4, 4, 5, 4, 3, 5, 5, 4, 5, 4, 4, 4, 5, 4, 4, 5, 5, 4],
      total: 78,
      hardToRead: [
        "Vintage pencil writing — very low contrast",
        "Multiple score columns — unclear which is the player's",
        "Stymie gauge markings on the side",
      ],
    },
  ],
  date: "Unknown",
  ocrNotes: [
    "Very old scorecard format with 'SIX INCH STYMIE GAUGE' on side",
    "Columns labeled: Holes, Yards, Par, Strokes, then numbered 3-6",
    "Multiple score columns may represent different players or match play tracking",
    "Pencil on aged paper — expect very low OCR confidence",
    "OUT/IN/Total rows with subtotals",
    "Won/Lost columns suggest match play format",
    "This will likely require Claude Vision API fallback",
  ],
};

// ─── ALL FIXTURES ────────────────────────────────────────────────────

export const ALL_FIXTURES: ScorecardFixture[] = [
  FIXTURE_YATES_SMITH,
  FIXTURE_GIBSON_MUNSON,
  FIXTURE_VINTAGE,
];

/**
 * Validate OCR results against a fixture.
 * Returns list of mismatches.
 */
export function validateOCRResult(
  fixture: ScorecardFixture,
  ocrPlayers: ScannedPlayer[]
): { field: string; expected: any; actual: any; severity: "error" | "warning" }[] {
  const issues: { field: string; expected: any; actual: any; severity: "error" | "warning" }[] = [];

  // Check player count
  if (ocrPlayers.length !== fixture.expectedPlayers.length) {
    issues.push({
      field: "playerCount",
      expected: fixture.expectedPlayers.length,
      actual: ocrPlayers.length,
      severity: "error",
    });
    return issues; // Can't compare further
  }

  // Match players by best name similarity
  for (let i = 0; i < fixture.expectedPlayers.length; i++) {
    const expected = fixture.expectedPlayers[i];
    const ocr = ocrPlayers[i];

    // Name check (fuzzy — OCR may abbreviate)
    if (!ocr.name.toLowerCase().includes(expected.name.split(" ")[0].toLowerCase())) {
      issues.push({
        field: `player[${i}].name`,
        expected: expected.name,
        actual: ocr.name,
        severity: "warning",
      });
    }

    // Score check per hole
    for (let h = 0; h < 18; h++) {
      if (expected.scores[h] !== ocr.scores[h]) {
        issues.push({
          field: `player[${i}].scores[${h + 1}]`,
          expected: expected.scores[h],
          actual: ocr.scores[h],
          severity: Math.abs(expected.scores[h] - ocr.scores[h]) > 1 ? "error" : "warning",
        });
      }
    }

    // Total check
    const ocrTotal = ocr.scores.reduce((a, b) => a + b, 0);
    if (ocrTotal !== expected.total) {
      issues.push({
        field: `player[${i}].total`,
        expected: expected.total,
        actual: ocrTotal,
        severity: Math.abs(ocrTotal - expected.total) > 3 ? "error" : "warning",
      });
    }
  }

  return issues;
}
