import { Player, Course } from "../types";

/**
 * Chicago — Stableford points minus a handicap-derived quota.
 * Quota = 36 - handicap (same as Quota game).
 * Points: Double Eagle = 5, Eagle = 4, Birdie = 3, Par = 2, Bogey = 1, Double+ = 0
 * Final score = points earned - quota. Highest wins.
 */
function chicagoPts(score: number, par: number): number {
  const diff = score - par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

export interface ChicagoResult {
  name: string;
  playerId: string;
  handicap: number;
  quota: number;
  grossPoints: number;
  netScore: number; // grossPoints - quota
}

export function calcChicago(players: Player[], course: Course): ChicagoResult[] {
  return players
    .map((p) => {
      const grossPoints = p.scores.reduce(
        (sum, s, i) => sum + chicagoPts(s, course.holes[i].par),
        0
      );
      const quota = 36 - Math.round(p.handicap);
      return {
        name: p.name,
        playerId: p.id,
        handicap: p.handicap,
        quota,
        grossPoints,
        netScore: grossPoints - quota,
      };
    })
    .sort((a, b) => b.netScore - a.netScore);
}
