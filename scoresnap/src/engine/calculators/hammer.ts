import { Player, Course } from "../types";

export interface HammerResult {
  holeResults: { hole: number; winnerName: string; points: number }[];
  totals: Record<string, number>;
}

/**
 * Hammer — 2-player game. Each hole is worth 1 unit initially.
 * Either player can "hammer" (double the bet) during the hole.
 * The opponent must accept or concede.
 *
 * Since we can't track mid-hole hammering, we simulate:
 * The value doubles on holes where the margin is >= 2 strokes (indicating pressure).
 */
export function calcHammer(p1: Player, p2: Player, _course: Course): HammerResult {
  const totals: Record<string, number> = { [p1.name]: 0, [p2.name]: 0 };
  const holeResults = [];

  for (let i = 0; i < 18; i++) {
    const diff = p1.scores[i] - p2.scores[i];
    const margin = Math.abs(diff);
    // Simulate hammer: if margin >= 2, the bet was likely doubled
    const value = margin >= 2 ? 2 : 1;

    if (diff < 0) {
      // p1 wins the hole
      totals[p1.name] += value;
      totals[p2.name] -= value;
      holeResults.push({ hole: i + 1, winnerName: p1.name, points: value });
    } else if (diff > 0) {
      // p2 wins the hole
      totals[p2.name] += value;
      totals[p1.name] -= value;
      holeResults.push({ hole: i + 1, winnerName: p2.name, points: value });
    } else {
      holeResults.push({ hole: i + 1, winnerName: "Push", points: 0 });
    }
  }

  return { holeResults, totals };
}
