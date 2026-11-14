import { buildGameLeaderRows, gameLeaderText } from "../calculators/game-leaders";
import { calculateContestSettlement } from "../contest-results";
import type { Course, GameType, Player, SettlementSummary } from "../types";
import type { Contest, ContestGroup } from "../../stores/contest-store";

// The repository intentionally does not install @types/jest; Jest supplies these globals at runtime.
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: any;

// AUG-246 acceptance 4: per-game leader rows on Round > Leaderboard, for 2- and
// 16-player fixtures, reusing the settlement engine (no new game math) and never
// touching gross stroke ranking.

const COURSE: Course = {
  name: "Leader GC",
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 380 })),
};

const card = (holes: Record<number, number> = {}) => Array.from({ length: 18 }, (_, i) => holes[i] ?? 4);
const player = (id: string, name: string, scores: number[]): Player => ({ id, name, handicap: 0, scores, team: null });

function contest(groups: ContestGroup[], games: GameType[]): Contest {
  return {
    id: "c-leaders", name: "Leaders", course: COURSE, status: "active", betUnit: 5,
    hasTeams: false, groups, games, createdAt: "2026-11-14T00:00:00.000Z",
  };
}
const label = (g: GameType) => ({ skins: "Skins", stroke_play: "Stroke Play" } as Record<string, string>)[g] ?? g;
const rowsFor = (c: Contest) => buildGameLeaderRows(c.games, (g) => calculateContestSettlement(c, [g]), label);

describe("buildGameLeaderRows (AUG-246)", () => {
  test("2 players: skins leader comes from real settlement; stroke play gets no row", () => {
    const c = contest([{ id: "g1", name: "Group 1", players: [
      player("a", "Alex", card({ 0: 3, 1: 3 })), // two birdies -> two skins
      player("b", "Bo", card({ 2: 3 })),
    ] }], ["stroke_play", "skins"]);
    const rows = rowsFor(c);
    expect(rows.map((r) => r.game)).toEqual(["skins"]);
    expect(rows[0]).toMatchObject({ status: "leader", leaders: ["Alex"] });
    expect(gameLeaderText(rows[0])).toBe("Skins: Alex leads");
    // Matches the settle-up ledger exactly.
    const net = calculateContestSettlement(c, ["skins"]).netByPlayer;
    expect(net["Alex"]).toBeGreaterThan(net["Bo"]);
  });

  test("2 players, identical cards: all square, no invented leader", () => {
    const c = contest([{ id: "g1", name: "G", players: [player("a", "Alex", card()), player("b", "Bo", card())] }], ["skins"]);
    const [row] = rowsFor(c);
    expect(row).toMatchObject({ status: "all_square", leaders: [] });
    expect(gameLeaderText(row)).toBe("Skins: all square");
  });

  test("16 players across 4 groups: one row per side game, single field leader", () => {
    const players = Array.from({ length: 16 }, (_, i) => player(`p${i}`, `P${i + 1}`, card(i === 5 ? { 0: 2, 7: 3 } : {})));
    const groups = [0, 1, 2, 3].map((g) => ({ id: `g${g + 1}`, name: `Group ${g + 1}`, players: players.slice(g * 4, g * 4 + 4) }));
    const rows = rowsFor(contest(groups, ["stroke_play", "skins", "skins"]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ game: "skins", status: "leader", leaders: ["P6"] });
  });

  test("ties, pending and throwing settlements are reported without breaking the list", () => {
    const fake: Record<string, SettlementSummary | Error> = {
      nassau: { transactions: [], netByPlayer: { A: 5, B: 5, C: -10 } },
      wolf: { transactions: [], netByPlayer: {}, pending: true },
      hammer: new Error("missing aux"),
      vegas: { transactions: [], netByPlayer: { A: 0.004, B: -0.004 } },
    };
    const rows = buildGameLeaderRows(["nassau", "wolf", "hammer", "vegas"] as GameType[], (g) => {
      const v = fake[g]; if (v instanceof Error) throw v; return v;
    }, (g) => g);
    expect(rows.map((r) => [r.game, r.status])).toEqual([["nassau", "tied"], ["wolf", "pending"], ["hammer", "pending"], ["vegas", "all_square"]]);
    expect(rows[0].leaders).toEqual(["A", "B"]);
    expect(gameLeaderText(rows[0])).toBe("nassau: tied, A & B");
    expect(gameLeaderText(rows[1])).toBe("wolf: waiting on scores");
  });
});
