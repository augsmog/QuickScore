import { Player, Course, StablefordResult } from "../types";

/**
 * Modified Stableford — rewards eagles/birdies more aggressively, penalizes bogeys+.
 * Scoring: Eagle or better = +8, Birdie = +5, Par = +2, Bogey = -1, Double = -3, Worse = -5
 */
function modStablefordPoints(score: number, par: number): number {
  const diff = score - par;
  if (diff <= -2) return 8;  // eagle or better
  if (diff === -1) return 5; // birdie
  if (diff === 0) return 2;  // par
  if (diff === 1) return -1; // bogey
  if (diff === 2) return -3; // double bogey
  return -5;                  // triple or worse
}

export function calcModStableford(
  players: Player[],
  course: Course
): StablefordResult[] {
  return players
    .map((p) => {
      const holePoints = p.scores.map((s, i) =>
        modStablefordPoints(s, course.holes[i].par)
      );
      return {
        name: p.name,
        playerId: p.id,
        points: holePoints.reduce((sum, pts) => sum + pts, 0),
        holePoints,
      };
    })
    .sort((a, b) => b.points - a.points);
}
