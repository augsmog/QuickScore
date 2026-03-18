import { Player, Course, StrokePlayResult } from "../types";

export function calcStrokePlay(players: Player[], course: Course): StrokePlayResult[] {
  return players
    .map((p) => {
      const front = p.scores.slice(0, 9).reduce((a, b) => a + b, 0);
      const back = p.scores.slice(9).reduce((a, b) => a + b, 0);
      const total = front + back;
      const coursePar = course.holes.reduce((a, h) => a + h.par, 0);
      return {
        name: p.name,
        playerId: p.id,
        front,
        back,
        total,
        toPar: total - coursePar,
      };
    })
    .sort((a, b) => a.total - b.total);
}
