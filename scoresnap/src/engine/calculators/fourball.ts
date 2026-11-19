import { Player, Course, MatchPlayResult } from "../types";

export interface FourBallResult {
  team1Names: [string, string];
  team2Names: [string, string];
  holeResults: {
    hole: number;
    team1Best: number;
    team2Best: number;
    status: number; // positive = team1 up
  }[];
  finalStatus: number;
}

/**
 * Four-Ball — Best ball of each partner pair in match play format.
 * Each team's best score on each hole is compared head-to-head.
 */
export function calcFourBall(
  team1: [Player, Player],
  team2: [Player, Player],
  _course: Course
): FourBallResult {
  let status = 0;
  const holeResults = [];

  for (let i = 0; i < 18; i++) {
    const t1Best = Math.min(team1[0].scores[i], team1[1].scores[i]);
    const t2Best = Math.min(team2[0].scores[i], team2[1].scores[i]);

    if (t1Best < t2Best) status++;
    else if (t2Best < t1Best) status--;

    holeResults.push({
      hole: i + 1,
      team1Best: t1Best,
      team2Best: t2Best,
      status,
    });
  }

  return {
    team1Names: [team1[0].name, team1[1].name],
    team2Names: [team2[0].name, team2[1].name],
    holeResults,
    finalStatus: status,
  };
}

export interface FourBallMatchup {
  team1Id: string;
  team2Id: string;
  finalStatus: number; // positive = team1 up
}

/**
 * Four-Ball for any number of two-player teams: every pair of teams plays a
 * best-ball match (round robin). Team best per hole = lowest score of its two
 * members. Teams that are not exactly 2 players are not a supported Four-Ball
 * configuration and are excluded rather than settled; `validateVariationSetup`
 * is the setup-time check that rejects a malformed roster outright.
 */
export function calcFourBallAllTeams(
  teams: Map<string, Player[]> | Record<string, Player[]>
): FourBallMatchup[] {
  const entries = teams instanceof Map ? Array.from(teams.entries()) : Object.entries(teams);
  const valid = entries.filter(([, members]) => members.length === 2);
  const matchups: FourBallMatchup[] = [];
  for (let a = 0; a < valid.length; a++) {
    for (let b = a + 1; b < valid.length; b++) {
      let status = 0;
      for (let i = 0; i < 18; i++) {
        const t1 = Math.min(...valid[a][1].map((p) => p.scores[i]));
        const t2 = Math.min(...valid[b][1].map((p) => p.scores[i]));
        if (t1 < t2) status++;
        else if (t2 < t1) status--;
      }
      matchups.push({ team1Id: valid[a][0], team2Id: valid[b][0], finalStatus: status });
    }
  }
  return matchups;
}
