import { Player, Course, VegasResult, GameConfig } from "../types";

export function calcVegas(
  team1: Player[],
  team2: Player[],
  _course: Course,
  config?: GameConfig
): VegasResult {
  let t1Total = 0;
  let t2Total = 0;
  const holes = [];

  for (let i = 0; i < 18; i++) {
    const t1Scores = team1.map((p) => p.scores[i]).sort((a, b) => a - b);
    const t2Scores = team2.map((p) => p.scores[i]).sort((a, b) => a - b);
    if (config?.rulesVersion === 1 && [...t1Scores,...t2Scores].some(s => !Number.isFinite(s) || s <= 0)) break;
    if (config?.rulesVersion === 1) {
      for (const values of [t1Scores,t2Scores]) values.forEach((s,j) => { values[j] = Math.min(9,s); });
    }
    let t1Num = t1Scores[0] * 10 + t1Scores[1];
    let t2Num = t2Scores[0] * 10 + t2Scores[1];
    let factor = 1;
    if (config?.rulesVersion === 1) {
      const par = _course.holes[i]?.par ?? 4;
      const a = Math.min(...team1.map(p => p.scores[i])) - par;
      const b = Math.min(...team2.map(p => p.scores[i])) - par;
      const reverse = (n: number) => n % 10 * 10 + Math.floor(n / 10);
      if (config.eagleDoubles && (a <= -2 || b <= -2)) {
        if (!(a <= -2 && b <= -2)) {
          if (a <= -2) t2Num = reverse(t2Num); else t1Num = reverse(t1Num);
          factor = 2;
        }
      } else if (config.birdieFlip && !(config.birdieBlocksBirdie && a === -1 && b === -1)) {
        if (a === -1) t2Num = reverse(t2Num);
        if (b === -1) t1Num = reverse(t1Num);
      }
    }
    const diff = (t1Num - t2Num) * factor;

    holes.push({ hole: i + 1, t1: t1Num, t2: t2Num, diff });
    t1Total += diff < 0 ? Math.abs(diff) : 0;
    t2Total += diff > 0 ? diff : 0;
  }

  return { team1Won: t1Total, team2Won: t2Total, holes };
}
