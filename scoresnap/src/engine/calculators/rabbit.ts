import { Player, Course } from "../types";

export interface RabbitResult {
  /** Who holds the rabbit at the end of each 9 */
  front9Holder: string;
  back9Holder: string;
  events: { hole: number; caughtBy: string }[];
  totals: Record<string, number>;
}

/**
 * Rabbit — The player with the lowest score on a hole "catches the rabbit."
 * They hold it until someone else posts a lower score on a subsequent hole.
 * The player holding the rabbit at the end of 9 holes wins the pot.
 * Played as two separate rabbits: front 9 and back 9.
 */
export function calcRabbit(players: Player[], _course: Course): RabbitResult {
  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.name] = 0));
  const events: { hole: number; caughtBy: string }[] = [];

  let front9Holder = "";
  let back9Holder = "";

  // Front 9
  let holder = "";
  for (let i = 0; i < 9; i++) {
    const scores = players.map((p) => ({ name: p.name, score: p.scores[i] }));
    const min = Math.min(...scores.map((s) => s.score));
    const winners = scores.filter((s) => s.score === min);
    if (winners.length === 1 && winners[0].name !== holder) {
      holder = winners[0].name;
      events.push({ hole: i + 1, caughtBy: holder });
    }
  }
  front9Holder = holder;
  if (front9Holder) {
    totals[front9Holder] += players.length - 1;
    players
      .filter((p) => p.name !== front9Holder)
      .forEach((p) => (totals[p.name] -= 1));
  }

  // Back 9
  holder = "";
  for (let i = 9; i < 18; i++) {
    const scores = players.map((p) => ({ name: p.name, score: p.scores[i] }));
    const min = Math.min(...scores.map((s) => s.score));
    const winners = scores.filter((s) => s.score === min);
    if (winners.length === 1 && winners[0].name !== holder) {
      holder = winners[0].name;
      events.push({ hole: i + 1, caughtBy: holder });
    }
  }
  back9Holder = holder;
  if (back9Holder) {
    totals[back9Holder] += players.length - 1;
    players
      .filter((p) => p.name !== back9Holder)
      .forEach((p) => (totals[p.name] -= 1));
  }

  return { front9Holder, back9Holder, events, totals };
}
