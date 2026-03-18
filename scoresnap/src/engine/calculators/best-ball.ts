import { Player, Course, StrokePlayResult } from "../types";

/**
 * Best Ball / Four-Ball: Best score on team counts each hole.
 * Returns team results sorted by total.
 */
export function calcBestBall(
  teams: { name: string; players: Player[] }[],
  course: Course
): StrokePlayResult[] {
  return teams
    .map((team) => {
      let front = 0;
      let back = 0;

      for (let i = 0; i < 18; i++) {
        const bestScore = Math.min(...team.players.map((p) => p.scores[i]));
        if (i < 9) front += bestScore;
        else back += bestScore;
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
