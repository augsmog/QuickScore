import { Player, Course, VegasResult } from "../types";

export function calcVegas(
  team1: Player[],
  team2: Player[],
  _course: Course
): VegasResult {
  let t1Total = 0;
  let t2Total = 0;
  const holes = [];

  for (let i = 0; i < 18; i++) {
    const t1Scores = team1.map((p) => p.scores[i]).sort((a, b) => a - b);
    const t2Scores = team2.map((p) => p.scores[i]).sort((a, b) => a - b);
    const t1Num = t1Scores[0] * 10 + t1Scores[1];
    const t2Num = t2Scores[0] * 10 + t2Scores[1];
    const diff = t1Num - t2Num;

    holes.push({ hole: i + 1, t1: t1Num, t2: t2Num, diff });
    t1Total += diff < 0 ? Math.abs(diff) : 0;
    t2Total += diff > 0 ? diff : 0;
  }

  return { team1Won: t1Total, team2Won: t2Total, holes };
}
