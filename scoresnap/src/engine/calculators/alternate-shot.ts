import { Player, Course, StrokePlayResult } from "../types";

/**
 * Alternate Shot — Partners alternate shots on each hole.
 * Since we can't track individual shots, the team enters one score per hole.
 * This calculator works the same as Scramble — one score per team per hole.
 */
export function calcAlternateShot(
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
