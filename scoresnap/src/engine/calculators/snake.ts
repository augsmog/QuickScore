import { Player, Course } from "../types";

export interface SnakeResult {
  /** Who holds the snake at the end (loser) */
  snakeHolder: string;
  /** Track of who 3-putted last on each hole */
  events: { hole: number; playerName: string }[];
  totals: Record<string, number>;
}

/**
 * Snake — The last player to 3-putt "holds the snake."
 * At the end of the round, the snake holder pays each other player 1 unit.
 *
 * Since we track strokes but not putts separately in basic mode,
 * we approximate: a 3-putt is when score >= par + 2 (double bogey or worse).
 */
export function calcSnake(players: Player[], course: Course): SnakeResult {
  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.name] = 0));
  const events: { hole: number; playerName: string }[] = [];
  let snakeHolder = "";

  for (let i = 0; i < 18; i++) {
    const par = course.holes[i].par;
    // Find players who likely 3-putted (double bogey or worse)
    for (const p of players) {
      if (p.scores[i] >= par + 2) {
        snakeHolder = p.name;
        events.push({ hole: i + 1, playerName: p.name });
      }
    }
  }

  // Snake holder pays everyone
  if (snakeHolder) {
    const otherCount = players.length - 1;
    totals[snakeHolder] -= otherCount;
    players
      .filter((p) => p.name !== snakeHolder)
      .forEach((p) => (totals[p.name] += 1));
  }

  return { snakeHolder, events, totals };
}
