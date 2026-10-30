import { Player, Course, StablefordResult, GameConfig } from "../types";

import { handicapStrokesForHole } from "./skins";

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
  course: Course,
  config?: GameConfig
): StablefordResult[] {
  return players
    .map((p) => {
      const holePoints = course.holes.map((hole, i) =>
        p.scores[i] > 0 ? (() => {
          const score = p.scores[i] - (config?.rulesVersion === 1 && config.netHandicap ? handicapStrokesForHole(p.courseHandicaps?.[course.name] ?? p.handicap, hole.hcp) : 0);
          if (config?.rulesVersion === 1 && config.modifiedStableford) {
            const diff = score - hole.par;
            return diff <= -3 ? 8 : diff === -2 ? 5 : diff === -1 ? 2 : diff === 0 ? 0 : diff === 1 ? -1 : -3;
          }
          return stablefordPoints(score, hole.par);
        })() : 0
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
