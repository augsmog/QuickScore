import { Player, Course } from "../types";

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
export function calcSixes(players: Player[], _course: Course): SixesResult {
  if (players.length !== 4) {
    return { rounds: [], totals: Object.fromEntries(players.map(p => [p.name, 0])) };
  }

  const [a, b, c, d] = players;
  const pairings = [
    { team1: [a, b] as [Player, Player], team2: [c, d] as [Player, Player], start: 0, end: 6, label: "1-6" },
    { team1: [a, c] as [Player, Player], team2: [b, d] as [Player, Player], start: 6, end: 12, label: "7-12" },
    { team1: [a, d] as [Player, Player], team2: [b, c] as [Player, Player], start: 12, end: 18, label: "13-18" },
  ];

  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.name] = 0));
  const rounds = [];

  for (const { team1, team2, start, end, label } of pairings) {
    let t1Wins = 0;
    let t2Wins = 0;

    for (let i = start; i < end; i++) {
      const t1Best = Math.min(team1[0].scores[i], team1[1].scores[i]);
      const t2Best = Math.min(team2[0].scores[i], team2[1].scores[i]);
      if (t1Best < t2Best) t1Wins++;
      else if (t2Best < t1Best) t2Wins++;
    }

    const winner = t1Wins > t2Wins ? "team1" : t2Wins > t1Wins ? "team2" : "tie";
    const points = Math.abs(t1Wins - t2Wins);

    if (winner === "team1") {
      team1.forEach((p) => (totals[p.name] += points));
      team2.forEach((p) => (totals[p.name] -= points));
    } else if (winner === "team2") {
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
