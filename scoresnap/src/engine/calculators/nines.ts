import { Player, Course, NinesResult, NinesHoleResult } from "../types";

export function calcNines(players: Player[], _course: Course): NinesResult {
  const points: Record<string, number> = {};
  players.forEach((p) => (points[p.name] = 0));
  const holeResults: NinesHoleResult[] = [];

  const rankPts = [5, 3, 1, 0];

  for (let i = 0; i < 18; i++) {
    const scores = players
      .map((p) => ({ name: p.name, score: p.scores[i] }))
      .sort((a, b) => a.score - b.score);

    const allocation: Record<string, number> = {};

    if (players.length === 4) {
      // Check if all tied
      const allSame = scores.every((s) => s.score === scores[0].score);
      if (allSame) {
        scores.forEach((s) => {
          allocation[s.name] = 2.25;
          points[s.name] += 2.25;
        });
      } else {
        // Group by score for tie handling
        const groups: Record<number, string[]> = {};
        scores.forEach((s) => {
          if (!groups[s.score]) groups[s.score] = [];
          groups[s.score].push(s.name);
        });

        const sortedScores = Object.keys(groups)
          .map(Number)
          .sort((a, b) => a - b);

        let rank = 0;
        sortedScores.forEach((sc) => {
          const g = groups[sc];
          const share =
            g.reduce((sum, _, idx) => sum + (rankPts[rank + idx] || 0), 0) /
            g.length;
          g.forEach((name) => {
            allocation[name] = share;
            points[name] += share;
          });
          rank += g.length;
        });
      }
    }

    holeResults.push({ hole: i + 1, allocation });
  }

  return { points, holeResults };
}
