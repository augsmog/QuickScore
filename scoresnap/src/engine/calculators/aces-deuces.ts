import { Player, Course } from "../types";

export interface AcesDeuceResult {
  totals: Record<string, number>;
  aces: { hole: number; playerName: string }[];  // birdie or better
  deuces: { hole: number; playerName: string }[]; // double bogey or worse
}

/**
 * Aces & Deuces — Bonus for "aces" (birdie or better), penalty for "deuces" (double bogey+).
 * Ace (birdie or better): collect 1 unit from each other player.
 * Deuce (double bogey or worse): pay 1 unit to each other player.
 */
export function calcAcesDeuces(players: Player[], course: Course): AcesDeuceResult {
  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.name] = 0));
  const aces: { hole: number; playerName: string }[] = [];
  const deuces: { hole: number; playerName: string }[] = [];

  for (let i = 0; i < 18; i++) {
    const par = course.holes[i].par;
    for (const p of players) {
      const diff = p.scores[i] - par;
      if (diff <= -1) {
        // Ace (birdie or better) — collect from each other player
        aces.push({ hole: i + 1, playerName: p.name });
        totals[p.name] += players.length - 1;
        players
          .filter((o) => o.id !== p.id)
          .forEach((o) => (totals[o.name] -= 1));
      } else if (diff >= 2) {
        // Deuce (double bogey or worse) — pay each other player
        deuces.push({ hole: i + 1, playerName: p.name });
        totals[p.name] -= players.length - 1;
        players
          .filter((o) => o.id !== p.id)
          .forEach((o) => (totals[o.name] += 1));
      }
    }
  }

  return { totals, aces, deuces };
}
