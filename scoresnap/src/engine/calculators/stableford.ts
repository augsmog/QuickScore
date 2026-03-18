import { Player, Course, StablefordResult } from "../types";

function stablefordPoints(score: number, par: number): number {
  const diff = score - par;
  if (diff <= -3) return 5; // albatross or better
  if (diff === -2) return 4; // eagle
  if (diff === -1) return 3; // birdie
  if (diff === 0) return 2;  // par
  if (diff === 1) return 1;  // bogey
  return 0;                   // double bogey or worse
}

export function calcStableford(
  players: Player[],
  course: Course
): StablefordResult[] {
  return players
    .map((p) => {
      const holePoints = p.scores.map((s, i) =>
        stablefordPoints(s, course.holes[i].par)
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
