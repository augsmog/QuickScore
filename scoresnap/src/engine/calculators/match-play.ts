import { Player, Course, MatchPlayResult, GameConfig, AuxiliaryData, configForGame } from "../types";

export function calcMatchPlay(
  p1: Player,
  p2: Player,
  _course: Course,
  config?: GameConfig,
  auxiliary?: AuxiliaryData
): MatchPlayResult {
  if(config?.rulesVersion===1)config=configForGame(config,"match_play");
  const firstMissing = _course.holes.findIndex((_, i) => [p1, p2].some(p => !Number.isFinite(p.scores[i]) || p.scores[i] <= 0));
  const confirmed = config?.rulesVersion === 1 && firstMissing >= 0 ? firstMissing : 18;
  if(config?.rulesVersion===1 && config.bisqueHandicap){
    const adjusted=(p:Player)=>({...p,scores:p.scores.map((n,i)=>n-(auxiliary?.bisque?.[i+1]?.strokes[p.id]??0))});
    p1 = adjusted(p1); p2 = adjusted(p2);
  }
  else if (config?.rulesVersion === 1 && config.netHandicap) {
    const h1 = Math.round(p1.courseHandicaps?.[_course.name] ?? p1.handicap);
    const h2 = Math.round(p2.courseHandicaps?.[_course.name] ?? p2.handicap);
    const lowest = Math.min(h1,h2);
    const adjusted = (p: Player, h: number) => ({...p,scores:p.scores.map((s,i) => s > 0 ? s - Math.floor((h-lowest)/18) - (_course.holes[i].hcp <= (h-lowest)%18 ? 1 : 0) : s)});
    p1 = adjusted(p1,h1); p2 = adjusted(p2,h2);
  }
  let status = 0;
  const results = [];

  for (let i = 0; i < confirmed; i++) {
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
