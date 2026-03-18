import { Player, Course, StablefordResult } from "../types";

/**
 * Quota / Point Quota — Each player has a point target based on handicap.
 * Target = 36 - handicap. Player earns Stableford points per hole.
 * The player who exceeds their quota by the most wins.
 *
 * Stableford points: Eagle+ = 4, Birdie = 3, Par = 2, Bogey = 1, Double+ = 0
 */
function stablefordPts(score: number, par: number): number {
  const diff = score - par;
  if (diff <= -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

export interface QuotaResult {
  name: string;
  playerId: string;
  handicap: number;
  quota: number;
  points: number;
  overUnder: number; // positive = exceeded quota
}

export function calcQuota(players: Player[], course: Course): QuotaResult[] {
  return players
    .map((p) => {
      const points = p.scores.reduce(
        (sum, s, i) => sum + stablefordPts(s, course.holes[i].par),
        0
      );
      const quota = 36 - Math.round(p.handicap);
      return {
        name: p.name,
        playerId: p.id,
        handicap: p.handicap,
        quota,
        points,
        overUnder: points - quota,
      };
    })
    .sort((a, b) => b.overUnder - a.overUnder);
}
