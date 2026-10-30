import { Player, Course, MatchPlayResult, GameConfig } from "../types";

export function calcMatchPlay(
  p1: Player,
  p2: Player,
  _course: Course,
  config?: GameConfig
): MatchPlayResult {
  if (config?.rulesVersion === 1 && config.netHandicap) {
    const h1 = Math.round(p1.courseHandicaps?.[_course.name] ?? p1.handicap);
    const h2 = Math.round(p2.courseHandicaps?.[_course.name] ?? p2.handicap);
    const lowest = Math.min(h1,h2);
    const adjusted = (p: Player, h: number) => ({...p,scores:p.scores.map((s,i) => s > 0 ? s - Math.floor((h-lowest)/18) - (_course.holes[i].hcp <= (h-lowest)%18 ? 1 : 0) : s)});
    return calcMatchPlay(adjusted(p1,h1),adjusted(p2,h2),_course);
  }
  let status = 0;
  const results = [];

  for (let i = 0; i < 18; i++) {
    if (p1.scores[i] < p2.scores[i]) status++;
    else if (p2.scores[i] < p1.scores[i]) status--;
    results.push({
      hole: i + 1,
      p1Score: p1.scores[i],
      p2Score: p2.scores[i],
      status,
    });
  }

  return { p1: p1.name, p2: p2.name, results, finalStatus: status };
}
