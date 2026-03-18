import { Player, Course, StrokePlayResult } from "../types";

/**
 * Chapman / Pinehurst — Drive, swap balls, pick best, then alternate.
 * Like Alternate Shot, the team enters one score per hole.
 */
export function calcChapman(
  teams: { name: string; score: number[] }[],
  course: Course
): StrokePlayResult[] {
  return teams
    .map((team) => {
      const front = team.score.slice(0, 9).reduce((a, b) => a + b, 0);
      const back = team.score.slice(9).reduce((a, b) => a + b, 0);
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
