import { Player, Course, MatchPlayResult } from "../types";

export function calcMatchPlay(
  p1: Player,
  p2: Player,
  _course: Course
): MatchPlayResult {
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
