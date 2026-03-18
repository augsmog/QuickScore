import { Player, Course } from "../types";

export interface DefenderResult {
  holeResults: {
    hole: number;
    defenderName: string;
    defenderScore: number;
    fieldBest: number;
    defenderWon: boolean;
  }[];
  totals: Record<string, number>;
}

/**
 * Defender — Rotating defender vs the field's best ball.
 * If the defender beats the field's best score, they win 1 unit from each player.
 * If the field beats the defender, the best field player wins 1 unit from the defender.
 */
export function calcDefender(players: Player[], _course: Course): DefenderResult {
  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.name] = 0));
  const holeResults = [];

  for (let i = 0; i < 18; i++) {
    const defenderIdx = i % players.length;
    const defender = players[defenderIdx];
    const field = players.filter((_, idx) => idx !== defenderIdx);

    const defenderScore = defender.scores[i];
    const fieldScores = field.map((p) => ({ name: p.name, score: p.scores[i] }));
    const fieldBest = Math.min(...fieldScores.map((s) => s.score));
    const defenderWon = defenderScore < fieldBest;

    if (defenderWon) {
      totals[defender.name] += field.length;
      field.forEach((f) => (totals[f.name] -= 1));
    } else if (fieldBest < defenderScore) {
      const fieldWinners = fieldScores.filter((s) => s.score === fieldBest);
      const perWinner = 1 / fieldWinners.length;
      fieldWinners.forEach((w) => (totals[w.name] += perWinner));
      totals[defender.name] -= 1;
    }

    holeResults.push({
      hole: i + 1,
      defenderName: defender.name,
      defenderScore,
      fieldBest,
      defenderWon,
    });
  }

  return { holeResults, totals };
}
