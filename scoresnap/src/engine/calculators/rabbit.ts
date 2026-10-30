import { Player, Course, GameConfig } from "../types";

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
export function calcRabbit(players: Player[], _course: Course, config?: GameConfig): RabbitResult {
  let prefix = 18;
  if (config?.rulesVersion === 1) {
    for (let i = 0; i < 18; i++) if (players.some(p => !Number.isFinite(p.scores[i]) || p.scores[i] <= 0)) { prefix = i; break; }
  }
  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.name] = 0));
  const events: { hole: number; caughtBy: string }[] = [];

  let front9Holder = "";
  let back9Holder = "";

  // Front 9
  let holder = "";
  for (let i = 0; i < 9; i++) {
    if (config?.rulesVersion === 1 && i >= prefix) break;
    const scores = players.map((p) => ({ name: p.name, score: p.scores[i] }));
    const min = Math.min(...scores.map((s) => s.score));
    const winners = scores.filter((s) => s.score === min);
    if (winners.length === 1 && winners[0].name !== holder) {
      holder = winners[0].name;
      events.push({ hole: i + 1, caughtBy: holder });
    }
  }
  front9Holder = holder;
  if (front9Holder && (config?.rulesVersion !== 1 || players.every(p => p.scores.slice(0,9).filter(s => s > 0).length === 9))) {
    totals[front9Holder] += players.length - 1;
    players
      .filter((p) => p.name !== front9Holder)
      .forEach((p) => (totals[p.name] -= 1));
  }

  // Back 9
  holder = "";
  for (let i = 9; i < 18; i++) {
    if (config?.rulesVersion === 1 && i >= prefix) break;
    const scores = players.map((p) => ({ name: p.name, score: p.scores[i] }));
    const min = Math.min(...scores.map((s) => s.score));
    const winners = scores.filter((s) => s.score === min);
    if (winners.length === 1 && winners[0].name !== holder) {
      holder = winners[0].name;
      events.push({ hole: i + 1, caughtBy: holder });
    }
  }
  back9Holder = holder;
  if (back9Holder && (config?.rulesVersion !== 1 || players.every(p => p.scores.slice(0,18).filter(s => s > 0).length === 18))) {
    totals[back9Holder] += players.length - 1;
    players
      .filter((p) => p.name !== back9Holder)
      .forEach((p) => (totals[p.name] -= 1));
  }

  if (config?.rulesVersion === 1 && config.doubleRabbit && players.every(p => p.scores.slice(0,18).filter(s => s > 0).length === 18)) {
    let overall = "";
    for (let i = 0; i < 18; i++) {
      const min = Math.min(...players.map(p => p.scores[i]));
      const low = players.filter(p => p.scores[i] === min);
      if (low.length === 1) overall = low[0].name;
    }
    if (overall) players.forEach(p => { totals[p.name] += p.name === overall ? players.length - 1 : -1; });
  }
  return { front9Holder, back9Holder, events, totals };
}
