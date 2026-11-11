import { Course, Player } from "./types";
import { handicapStrokesForHole } from "./calculators/skins";

export interface TeamStanding {
  name: string;
  holesPlayed: number;
  total: number;
  toPar: number;
  rank: number;
  tied: boolean;
}

/**
 * Build gross or net team standings. Each hole counts the lowest `countBest`
 * scores from players who have completed that hole. A partial team score is
 * not counted until enough players have entered a score.
 */
export function teamStandings(
  teams: { name: string; players: Player[] }[],
  course: Course,
  options: { countBest: number; net: boolean; courseHandicaps?: Record<string, number> },
): TeamStanding[] | "unavailable" {
  if (!Number.isInteger(options.countBest) || options.countBest < 1 || teams.some((team) => options.countBest > team.players.length)) {
    throw new RangeError("countBest must be between 1 and every team's size");
  }
  if (options.net && !supportsNet(course)) return "unavailable";

  const rows = teams.map(({ name, players }) => {
    let holesPlayed = 0;
    let total = 0;
    let playedPar = 0;

    course.holes.forEach((hole, holeIndex) => {
      const scores = players
        .filter((player) => Number.isFinite(player.scores[holeIndex]) && player.scores[holeIndex] > 0)
        .map((player) => {
          if (!options.net) return player.scores[holeIndex];
          const handicap = options.courseHandicaps?.[player.id]
            ?? player.courseHandicaps?.[course.name]
            ?? player.handicap;
          return player.scores[holeIndex] - handicapStrokesForHole(handicap, hole.hcp);
        })
        .sort((a, b) => a - b);

      if (scores.length < options.countBest) return;
      holesPlayed += 1;
      total += scores.slice(0, options.countBest).reduce((sum, score) => sum + score, 0);
      playedPar += hole.par * options.countBest;
    });

    return { name, holesPlayed, total, toPar: total - playedPar, rank: 0, tied: false };
  });

  rows.sort((a, b) => a.toPar - b.toPar || a.name.localeCompare(b.name));
  rows.forEach((row, index) => {
    const firstIndex = rows.findIndex((candidate) => candidate.toPar === row.toPar);
    row.rank = firstIndex + 1;
    row.tied = rows.filter((candidate) => candidate.toPar === row.toPar).length > 1;
  });
  return rows;
}

function supportsNet(course: Course): boolean {
  if (!Array.isArray(course?.holes) || course.holes.length !== 18) return false;
  const indexes = new Set<number>();
  for (const hole of course.holes) {
    if (!hole || !Number.isInteger(hole.hcp) || hole.hcp < 1 || hole.hcp > 18) return false;
    indexes.add(hole.hcp);
  }
  return indexes.size === 18;
}
