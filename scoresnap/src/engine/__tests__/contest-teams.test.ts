declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;
import { contestTeamStandings, contestTeams } from "../contest-teams";
import type { Contest, ContestGroup } from "../../stores/contest-store";
import type { Player } from "../types";

const player = (id: string, team: string | null, score = 4): Player => ({
  id, name: id, team, handicap: 0, scores: Array(18).fill(score),
});
const group = (id: string, players: Player[]): ContestGroup => ({ id, name: id, players });
const base = (overrides: Partial<Contest> = {}): Contest => ({
  id: "c1", name: "Contest", course: { name: "Course", holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 400 })) },
  status: "active", betUnit: 1, hasTeams: true, teams: [{ id: "t1", name: "One" }, { id: "t2", name: "Two" }],
  groups: [group("g1", [player("p1", "t1"), player("p2", "One"), player("p3", null), player("p4", "unknown")])],
  games: [], createdAt: "", ...overrides,
});

describe("contestTeams", () => {
  it("adapts up to twenty teams, resolving ids before names and reporting missing assignments", () => {
    const teams = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, name: `Team ${i}` }));
    const contest = base({ teams, groups: [group("g", [player("p0", "Team 1"), player("p1", "t1"), player("p2", null), player("p3", "unknown")])] });
    const result = contestTeams(contest);
    expect(result).not.toBe("no_teams");
    if (result === "no_teams") return;
    expect(result.teams.map((team) => team.name)).toEqual(["Team 1"]);
    expect(result.teams[0].players.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(result.unassigned).toEqual(["p2", "p3"]);
    expect(result.empty).toHaveLength(19);
  });

  it("prefers a team ID when it collides with another team's name", () => {
    const contest = base({
      teams: [{ id: "t1", name: "One" }, { id: "t2", name: "t1" }],
      groups: [group("g", [player("p", "t1")])],
    });
    expect(contestTeams(contest)).toMatchObject({
      teams: [{ name: "One", players: [{ id: "p" }] }],
      empty: ["t1"],
    });
  });

  it("supports legacy A/B names and excludes empty teams", () => {
    const result = contestTeams(base({ teams: undefined, teamAName: "Alpha", teamBName: "Beta", groups: [group("g", [player("a", "A"), player("b", "Beta")])] }));
    expect(result).toEqual({ teams: [{ name: "Alpha", players: [expect.objectContaining({ id: "a" })] }, { name: "Beta", players: [expect.objectContaining({ id: "b" })] }], unassigned: [], empty: [] });
  });

  it("uses the active tournament round by default and an explicit round when requested", () => {
    const first = group("first", [player("first-player", "t1")]);
    const second = group("second", [player("second-player", "t2")]);
    const contest = base({ isTournament: true, currentRound: 2, rounds: [{ id: "r1", number: 1, name: "R1", groups: [first] }, { id: "r2", number: 2, name: "R2", groups: [second] }] });
    expect(contestTeams(contest)).toMatchObject({ teams: [{ name: "Two", players: [{ id: "second-player" }] }] });
    expect(contestTeams(contest, { roundId: "r1" })).toMatchObject({ teams: [{ name: "One", players: [{ id: "first-player" }] }] });
  });

  it("matches getActiveGroups when the tournament current round is missing", () => {
    const contest = base({
      isTournament: true,
      currentRound: 2,
      rounds: [{ id: "r1", number: 1, name: "R1", groups: [group("stale", [player("stale", "t1")])] }],
    });
    expect(contestTeams(contest)).toEqual({ teams: [], unassigned: [], empty: ["One", "Two"] });
    expect(contestTeamStandings(contest, { countBest: 1, net: false })).toEqual([]);
  });

  it("deduplicates players without mutating contest data and composes standings", () => {
    const repeated = player("same", "t1");
    const contest = base({ groups: [group("g1", [repeated]), group("g2", [repeated, player("p2", "t2", 5)])] });
    const before = JSON.stringify(contest);
    expect(contestTeams(contest)).toMatchObject({ teams: [{ players: [{ id: "same" }] }, { players: [{ id: "p2" }] }] });
    expect(contestTeamStandings(contest, { countBest: 1, net: false })).toHaveLength(2);
    expect(JSON.stringify(contest)).toBe(before);
  });

  it("returns no_teams when disabled or no definitions exist, and passes unavailable through", () => {
    expect(contestTeams(base({ hasTeams: false }))).toBe("no_teams");
    expect(contestTeams(base({ teams: undefined, teamAName: undefined, teamBName: undefined }))).toBe("no_teams");
    const nineHole = base({ course: { name: "Nine", holes: Array(9).fill({ num: 1, par: 4, hcp: 1, yards: 400 }) } });
    expect(contestTeamStandings(nineHole, { countBest: 1, net: true })).toBe("unavailable");
    expect(contestTeamStandings(base({ hasTeams: false }), { countBest: 1, net: false })).toBe("no_teams");
  });
});
