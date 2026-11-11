import type { Contest } from "../stores/contest-store";
import type { Player } from "./types";
import { teamStandings, type TeamStanding } from "./team-standings";

export interface ContestTeamsResult {
  teams: { name: string; players: Player[] }[];
  unassigned: string[];
  empty: string[];
}

/** Resolve contest team assignments using the same active-round group selection as the store. */
export function contestTeams(
  contest: Contest,
  opts: { roundId?: string } = {},
): ContestTeamsResult | "no_teams" {
  if (contest.hasTeams === false) return "no_teams";

  const definitions = contest.teams?.length
    ? contest.teams
    : contest.teamAName && contest.teamBName
      ? [{ id: "A", name: contest.teamAName }, { id: "B", name: contest.teamBName }]
      : [];
  if (!definitions.length) return "no_teams";

  let groups;
  if (opts.roundId !== undefined) {
    groups = contest.rounds?.find((round) => round.id === opts.roundId)?.groups ?? [];
  } else if (contest.isTournament && contest.rounds && contest.currentRound) {
    groups = contest.rounds.find((round) => round.number === contest.currentRound)?.groups ?? [];
  } else {
    groups = contest.groups;
  }
  const playersById = new Map<string, Player>();
  for (const group of groups) {
    for (const player of group.players) {
      if (!playersById.has(player.id)) playersById.set(player.id, player);
    }
  }

  const assigned = definitions.map((team) => ({ name: team.name, players: [] as Player[] }));
  const unassigned: string[] = [];
  for (const player of playersById.values()) {
    const teamIdIndex = definitions.findIndex((team) => team.id === player.team);
    const teamNameIndex = teamIdIndex < 0
      ? definitions.findIndex((team) => team.name === player.team)
      : teamIdIndex;
    if (teamNameIndex < 0) unassigned.push(player.id);
    else assigned[teamNameIndex].players.push(player);
  }
  const empty = assigned.filter((team) => team.players.length === 0).map((team) => team.name);
  return { teams: assigned.filter((team) => team.players.length > 0), unassigned, empty };
}

export function contestTeamStandings(
  contest: Contest,
  options: { countBest: number; net: boolean; roundId?: string },
): TeamStanding[] | "unavailable" | "no_teams" {
  const resolved = contestTeams(contest, { roundId: options.roundId });
  if (resolved === "no_teams") return resolved;
  const round = options.roundId
    ? contest.rounds?.find((candidate) => candidate.id === options.roundId)
    : contest.isTournament && contest.rounds && contest.currentRound
      ? contest.rounds.find((candidate) => candidate.number === contest.currentRound)
      : undefined;
  return teamStandings(resolved.teams, round?.course ?? contest.course, {
    countBest: options.countBest,
    net: options.net,
  });
}
