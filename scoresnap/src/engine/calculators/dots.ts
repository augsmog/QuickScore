import { Player, Course } from "../types";

export interface DotsResult {
  totals: Record<string, number>;
  breakdown: Record<string, { birdies: number; pars: number; bogeys: number; doubles: number }>;
}

/**
 * Dots / Trash / Junk — Points for various achievements:
 * - Birdie or better: +2 dots
 * - Par: +1 dot
 * - Bogey: 0 dots
 * - Double bogey or worse: -1 dot (junk)
 *
 * Additional dots can be added for greenies, sandies, etc.
 * but we only have stroke data.
 */
export function calcDots(players: Player[], course: Course): DotsResult {
  const totals: Record<string, number> = {};
  const breakdown: Record<string, { birdies: number; pars: number; bogeys: number; doubles: number }> = {};

  players.forEach((p) => {
    totals[p.name] = 0;
    breakdown[p.name] = { birdies: 0, pars: 0, bogeys: 0, doubles: 0 };
  });

  for (let i = 0; i < 18; i++) {
    const par = course.holes[i].par;
    for (const p of players) {
      const diff = p.scores[i] - par;
      if (diff <= -1) {
        totals[p.name] += 2;
        breakdown[p.name].birdies++;
      } else if (diff === 0) {
        totals[p.name] += 1;
        breakdown[p.name].pars++;
      } else if (diff === 1) {
        // 0 dots for bogey
        breakdown[p.name].bogeys++;
      } else {
        totals[p.name] -= 1;
        breakdown[p.name].doubles++;
      }
    }
  }

  return { totals, breakdown };
}
