import { Player, Course, GameConfig } from "../types";

export interface SixesResult {
  rounds: {
    holes: string; // e.g. "1-6", "7-12", "13-18"
    team1: [string, string];
    team2: [string, string];
    team1Score: number;
    team2Score: number;
    winner: string; // "team1", "team2", or "tie"
  }[];
  totals: Record<string, number>;
}

/**
 * Sixes / Round Robin — Partners rotate every 6 holes.
 * With 4 players (A,B,C,D):
 * Holes 1-6: A+B vs C+D
 * Holes 7-12: A+C vs B+D
 * Holes 13-18: A+D vs B+C
 * Best ball within each team per hole. Team with lower best ball wins the hole (1 point).
 */
export function calcSixes(players: Player[], _course: Course, config?: GameConfig): SixesResult {
  if (players.length !== 4) {
    return { rounds: [], totals: Object.fromEntries(players.map(p => [p.name, 0])) };
  }

  const [a, b, c, d] = players;
  const pairings = [
    { team1: [a, b] as [Player, Player], team2: [c, d] as [Player, Player], start: 0, end: 6, label: "1-6" },
    { team1: [a, c] as [Player, Player], team2: [b, d] as [Player, Player], start: 6, end: 12, label: "7-12" },
    { team1: [a, d] as [Player, Player], team2: [b, c] as [Player, Player], start: 12, end: 18, label: "13-18" },
  ];

  let prefix = 18;
  if (config?.rulesVersion === 1) {
    for (let i = 0; i < 18; i++) if (players.some(p => !Number.isFinite(p.scores[i]) || p.scores[i] <= 0)) { prefix = i; break; }
  }
  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.name] = 0));
  const rounds = [];

  for (const { team1, team2, start, end, label } of pairings) {
    let pressStart = -1;
    let pressMargin = 0;
    let t1Wins = 0;
    let t2Wins = 0;

    for (let i = start; i < end; i++) {
      if (config?.rulesVersion === 1 && i >= prefix) break;
      const t1Best = Math.min(team1[0].scores[i], team1[1].scores[i]);
      const t2Best = Math.min(team2[0].scores[i], team2[1].scores[i]);
      if (t1Best < t2Best) t1Wins++;
      else if (t2Best < t1Best) t2Wins++;
      if (config?.rulesVersion === 1 && config.sixesPresses) {
        if (pressStart >= 0 && i >= pressStart) pressMargin += Math.sign(t2Best - t1Best);
        if (pressStart < 0 && Math.abs(t1Wins - t2Wins) >= 2 && i + 1 < end) pressStart = i + 1;
      }
    }

    const winner = t1Wins > t2Wins ? "team1" : t2Wins > t1Wins ? "team2" : "tie";
    const margin = t1Wins - t2Wins + pressMargin;
    const factor = config?.rulesVersion === 1 && config.escalatingSegments ? 2 ** (start / 6) : 1;
    const points = Math.abs(margin) * factor;
    const payoutWinner = margin > 0 ? "team1" : margin < 0 ? "team2" : "tie";

    if (payoutWinner === "team1") {
      team1.forEach((p) => (totals[p.name] += points));
      team2.forEach((p) => (totals[p.name] -= points));
    } else if (payoutWinner === "team2") {
      team2.forEach((p) => (totals[p.name] += points));
      team1.forEach((p) => (totals[p.name] -= points));
    }

    rounds.push({
      holes: label,
      team1: [team1[0].name, team1[1].name] as [string, string],
      team2: [team2[0].name, team2[1].name] as [string, string],
      team1Score: t1Wins,
      team2Score: t2Wins,
      winner,
    });
  }

  return { rounds, totals };
}
