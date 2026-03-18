import { Player, Course } from "../types";

export interface BankerHoleResult {
  hole: number;
  bankerName: string;
  bankerScore: number;
  bestChallengerScore: number;
  bankerWon: boolean;
  points: number;
}

export interface BankerResult {
  holeResults: BankerHoleResult[];
  totals: Record<string, number>;
}

/**
 * Banker — Rotating banker takes all bets on the hole.
 * If banker has the lowest score, they collect 1 unit from each other player.
 * If any player beats the banker, the banker pays that player 1 unit.
 * If banker ties lowest, no action.
 */
export function calcBanker(players: Player[], _course: Course): BankerResult {
  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.name] = 0));
  const holeResults: BankerHoleResult[] = [];

  for (let i = 0; i < 18; i++) {
    const bankerIdx = i % players.length;
    const banker = players[bankerIdx];
    const challengers = players.filter((_, idx) => idx !== bankerIdx);
    const bankerScore = banker.scores[i];
    const bestChallenger = Math.min(...challengers.map((p) => p.scores[i]));

    let points = 0;
    if (bankerScore < bestChallenger) {
      // Banker wins — collects from everyone
      points = challengers.length;
      totals[banker.name] += points;
      challengers.forEach((c) => (totals[c.name] -= 1));
    } else {
      // Each challenger who beats the banker collects
      challengers.forEach((c) => {
        if (c.scores[i] < bankerScore) {
          totals[c.name] += 1;
          totals[banker.name] -= 1;
          points -= 1;
        }
      });
    }

    holeResults.push({
      hole: i + 1,
      bankerName: banker.name,
      bankerScore,
      bestChallengerScore: bestChallenger,
      bankerWon: bankerScore < bestChallenger,
      points,
    });
  }

  return { holeResults, totals };
}
