import { Player, Course } from "../types";

export interface GreenieResult {
  hole: number;
  par: number;
  winnerName: string | null;
  winnerScore: number;
  qualified: boolean; // must make par or better to collect
}

export interface GreeniesResult {
  greenies: GreenieResult[];
  totals: Record<string, number>;
}

/**
 * Greenies — On par 3s, the player closest to the pin wins a greenie.
 * The player must make par or better to collect.
 *
 * Since we don't track proximity, we use lowest score on par 3s as proxy.
 * Must score par or better to qualify.
 */
export function calcGreenies(players: Player[], course: Course): GreeniesResult {
  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.name] = 0));
  const greenies: GreenieResult[] = [];

  for (let i = 0; i < 18; i++) {
    const hole = course.holes[i];
    if (hole.par !== 3) continue;

    const scores = players
      .map((p) => ({ name: p.name, score: p.scores[i] }))
      .filter((s) => s.score > 0 && s.score <= hole.par) // must make par or better
      .sort((a, b) => a.score - b.score);

    if (scores.length > 0 && scores[0].score < (scores[1]?.score ?? Infinity)) {
      // Solo winner
      const winner = scores[0];
      totals[winner.name] += 1;
      greenies.push({
        hole: i + 1,
        par: hole.par,
        winnerName: winner.name,
        winnerScore: winner.score,
        qualified: true,
      });
    } else if (scores.length === 0) {
      // No one made par
      greenies.push({
        hole: i + 1,
        par: hole.par,
        winnerName: null,
        winnerScore: 0,
        qualified: false,
      });
    } else {
      // Tie — no greenie awarded
      greenies.push({
        hole: i + 1,
        par: hole.par,
        winnerName: null,
        winnerScore: scores[0].score,
        qualified: false,
      });
    }
  }

  return { greenies, totals };
}
