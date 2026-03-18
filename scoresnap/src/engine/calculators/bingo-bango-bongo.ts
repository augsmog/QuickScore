import { Player, Course } from "../types";

export interface BBBResult {
  totals: Record<string, number>;
  holeResults: {
    hole: number;
    bingo: string; // first on green (lowest score approach)
    bango: string; // closest to pin (simulated)
    bongo: string; // first in hole (lowest score)
  }[];
}

/**
 * Bingo Bango Bongo — 3 points awarded per hole:
 * - Bingo: First player on the green (simulated as lowest score)
 * - Bango: Closest to the pin once all are on green (simulated as 2nd lowest)
 * - Bongo: First player in the hole (simulated as lowest score overall)
 *
 * Each point = 1 unit. Since we only have stroke data, we approximate.
 */
export function calcBingoBangoBongo(
  players: Player[],
  _course: Course
): BBBResult {
  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.name] = 0));
  const holeResults = [];

  for (let i = 0; i < 18; i++) {
    const scores = players
      .map((p) => ({ name: p.name, score: p.scores[i] }))
      .sort((a, b) => a.score - b.score);

    // Bingo: first on green — best approach (lowest score)
    const bingo = scores[0].name;
    totals[bingo] += 1;

    // Bango: closest to pin — second best
    const bango = scores.length > 1 ? scores[1].name : scores[0].name;
    totals[bango] += 1;

    // Bongo: first in hole — lowest score (same as bingo for us, but in real play order matters)
    const bongo = scores[0].name;
    totals[bongo] += 1;

    holeResults.push({ hole: i + 1, bingo, bango, bongo });
  }

  return { totals, holeResults };
}
