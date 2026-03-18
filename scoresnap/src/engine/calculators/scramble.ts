import { Player, Course, StrokePlayResult } from "../types";

/**
 * Scramble — All players hit from the best shot each time.
 * Since we only have final scores, scramble score = single team score entered.
 * For scoring purposes, each team enters one score per hole (the scramble score).
 * We treat team players as having identical scores (the team score).
 */
export function calcScramble(
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
