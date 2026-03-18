import { Player, Course, StrokePlayResult } from "../types";

/**
 * Shamble — Best drive, then each player plays their own ball from there.
 * Since we only have final scores, we treat it as best ball from the
 * second shot onward. Approximation: team score = best individual score per hole.
 */
export function calcShamble(
  teams: { name: string; players: Player[] }[],
  course: Course
): StrokePlayResult[] {
  return teams
    .map((team) => {
      let front = 0;
      let back = 0;
      for (let i = 0; i < 18; i++) {
        const best = Math.min(...team.players.map((p) => p.scores[i]));
        if (i < 9) front += best;
        else back += best;
      }
      const total = front + back;
      const coursePar = course.holes.reduce((a, h) => a + h.par, 0);
      return {
        name: team.name,
        playerId: team.name,
        front,
        back,
        total,
        toPar: total - coursePar,
      };
    })
    .sort((a, b) => a.total - b.total);
}
