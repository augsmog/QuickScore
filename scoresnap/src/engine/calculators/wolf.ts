import { Player, Course } from "../types";

export interface WolfHoleResult {
  hole: number;
  wolfName: string;
  partnerName: string | null; // null = lone wolf
  wolfTeamScore: number;
  fieldScore: number;
  wolfWon: boolean;
  points: number; // positive = wolf team won, negative = field won
}

export interface WolfResult {
  holeResults: WolfHoleResult[];
  totals: Record<string, number>;
}

/**
 * Wolf — Rotating wolf chooses a partner after seeing tee shots, or goes lone wolf.
 * Wolf chooses last; if lone wolf wins, gets 4x points; if lone wolf loses, pays 4x.
 * Otherwise wolf+partner split 2x each.
 *
 * Since we can't track mid-hole partner selection, we simulate:
 * wolf pairs with lowest scorer on each hole (best available partner strategy).
 */
export function calcWolf(players: Player[], course: Course): WolfResult {
  if (players.length !== 4) {
    return { holeResults: [], totals: Object.fromEntries(players.map(p => [p.name, 0])) };
  }

  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.name] = 0));
  const holeResults: WolfHoleResult[] = [];

  for (let i = 0; i < 18; i++) {
    const wolfIdx = i % 4;
    const wolf = players[wolfIdx];
    const others = players.filter((_, idx) => idx !== wolfIdx);

    // Find the other player with the best score on this hole
    const otherScores = others.map((p) => ({ player: p, score: p.scores[i] }))
      .sort((a, b) => a.score - b.score);

    const bestPartner = otherScores[0];
    const wolfScore = wolf.scores[i];

    // Decide: go lone wolf if wolf's score is the best overall
    const allScores = players.map((p) => p.scores[i]);
    const isLoneWolf = wolfScore <= Math.min(...allScores);

    if (isLoneWolf) {
      // Lone wolf: wolf vs all 3
      const fieldBest = Math.min(...others.map((p) => p.scores[i]));
      const wolfWon = wolfScore < fieldBest;
      const tied = wolfScore === fieldBest;
      const pts = tied ? 0 : wolfWon ? 4 : -4;

      totals[wolf.name] += pts;
      if (!tied) {
        const perOther = wolfWon ? -(pts / 3) : pts / 3;
        others.forEach((o) => (totals[o.name] += perOther));
      }

      holeResults.push({
        hole: i + 1,
        wolfName: wolf.name,
        partnerName: null,
        wolfTeamScore: wolfScore,
        fieldScore: fieldBest,
        wolfWon,
        points: pts,
      });
    } else {
      // Wolf + partner vs other 2
      const partner = bestPartner.player;
      const field = others.filter((p) => p.id !== partner.id);
      const wolfTeamBest = Math.min(wolfScore, partner.scores[i]);
      const fieldBest = Math.min(...field.map((p) => p.scores[i]));
      const wolfWon = wolfTeamBest < fieldBest;
      const tied = wolfTeamBest === fieldBest;
      const pts = tied ? 0 : wolfWon ? 2 : -2;

      totals[wolf.name] += pts;
      totals[partner.name] += pts;
      if (!tied) {
        field.forEach((f) => (totals[f.name] += -pts));
      }

      holeResults.push({
        hole: i + 1,
        wolfName: wolf.name,
        partnerName: partner.name,
        wolfTeamScore: wolfTeamBest,
        fieldScore: fieldBest,
        wolfWon,
        points: pts,
      });
    }
  }

  return { holeResults, totals };
}
