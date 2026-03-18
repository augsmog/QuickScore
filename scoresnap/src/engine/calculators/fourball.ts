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
