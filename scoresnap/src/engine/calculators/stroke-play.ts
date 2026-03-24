import { Player, Course, StrokePlayResult } from "../types";

export function calcStrokePlay(players: Player[], course: Course): StrokePlayResult[] {
  return players
    .map((p) => {
      const front = p.scores.slice(0, 9).reduce((a, b) => a + b, 0);
      const back = p.scores.slice(9).reduce((a, b) => a + b, 0);
      const total = front + back;
      // Only sum par for holes where the player has entered a score (> 0)
      const parForPlayedHoles = p.scores.reduce((sum, score, i) => {
        if (score > 0 && course.holes[i]) {
          return sum + course.holes[i].par;
        }
        return sum;
      }, 0);
      return {
        name: p.name,
        playerId: p.id,
        front,
        back,
        total,
        toPar: parForPlayedHoles > 0 ? total - parForPlayedHoles : 0,
      };
    })
    .sort((a, b) => a.total - b.total);
}
