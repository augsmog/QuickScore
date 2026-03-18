import { Player, NassauResult } from "../types";

export function calcNassau(p1: Player, p2: Player): NassauResult {
  let front = 0;
  let back = 0;

  for (let i = 0; i < 9; i++) {
    if (p1.scores[i] < p2.scores[i]) front++;
    else if (p2.scores[i] < p1.scores[i]) front--;
  }

  for (let i = 9; i < 18; i++) {
    if (p1.scores[i] < p2.scores[i]) back++;
    else if (p2.scores[i] < p1.scores[i]) back--;
  }

  const overall = front + back;
  return { p1: p1.name, p2: p2.name, front, back, overall };
}
