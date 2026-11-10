import { calculateContestSettlement, contestPrimaryRounds, contestStableford } from "../contest-results";
import { calcStableford } from "../calculators/stableford";
import type { Course, GameType, Player } from "../types";
import type { Contest, ContestGroup, RoundInfo } from "../../stores/contest-store";

declare const describe: (name: string, fn: () => void) => void;
declare const test: {
  (name: string, fn: () => void): void;
  failing: (name: string, fn: () => void) => void;
};
declare const expect: any;

const COURSE_A: Course = {
  name: "Isolation A",
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 350 })),
};
const COURSE_B: Course = {
  name: "Isolation B",
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: i < 3 ? 5 : 4, hcp: i + 1, yards: 350 })),
};

const ids = Array.from({ length: 16 }, (_, i) => i);
function card(id: number, round: number): number[] {
  return Array.from({ length: 18 }, (_, hole) => {
    let value = Math.imul(id + 1, 0x45d9f3b) ^ Math.imul(hole + 1, 0x119de1f3) ^ Math.imul(round + 1, 0x3449f);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value ^= value >>> 16;
    return 3 + ((value >>> 0) % 6);
  });
}
function roundPlayers(round: number): Player[] {
  return ids.map((id) => ({
    id: `p${id}`,
    name: `Player ${id + 1}`,
    handicap: 0,
    team: id % 2 === 0 ? "Red" : "Blue",
    scores: card(id, round),
  }));
}
function group(name: string, players: Player[]): ContestGroup {
  return { id: name, name, players };
}
function roundGroups(round: number, players: Player[]): ContestGroup[] {
  const layouts = round === 2
    ? [[0, 5, 2, 7], [4, 1, 6, 3], [8, 13, 10, 15], [12, 9, 14, 11]]
    : [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15]];
  const active = round === 3 ? layouts.map((layout) => layout.filter((id) => id < 14)) : undefined;
  return layouts.map((layout, index) => group(
    `r${round}-g${index + 1}`,
    (round === 3 ? active![index] : layout).map((id) => players[id]),
  ));
}

function fixture(games: GameType[]): Contest {
  const r1Players = roundPlayers(0);
  const r2Players = roundPlayers(1);
  const r3Players = roundPlayers(2);
  const groups = roundGroups(1, r1Players);
  const rounds: RoundInfo[] = [
    { id: "r1", number: 1, name: "Round 1", course: COURSE_A, groups },
    { id: "r2", number: 2, name: "Round 2", course: COURSE_B, groups: roundGroups(2, r2Players) },
    { id: "r3", number: 3, name: "Round 3", course: COURSE_A, groups: roundGroups(3, r3Players) },
  ];
  return {
    id: "settlement-isolation",
    name: "Multi-round isolation",
    course: COURSE_A,
    status: "active",
    betUnit: 1,
    hasTeams: false,
    groups,
    games,
    createdAt: "2026-11-10T00:00:00.000Z",
    gameConfig: { rulesVersion: 1, inputRulesVersion: 1, skinsScope: "field", skinsMode: "gross", nassauWeights: [1, 1, 1] },
    isTournament: true,
    currentRound: 3,
    rounds,
  };
}

function roundSettlement(contest: Contest, game: GameType) {
  return contestPrimaryRounds(contest).map(({ contest: round }) => calculateContestSettlement(round, [game]));
}
function assertConservingAndNonzero(summary: ReturnType<typeof calculateContestSettlement>) {
  expect(summary.pending).toBeFalsy();
  expect(Object.values(summary.netByPlayer).reduce((sum, amount) => sum + amount, 0)).toBeCloseTo(0, 2);
  expect(Object.values(summary.netByPlayer).some((amount) => amount !== 0)).toBe(true);
}
function addRoundLedgers(summaries: ReturnType<typeof calculateContestSettlement>[]) {
  return Object.fromEntries(ids.map((id) => {
    const name = `Player ${id + 1}`;
    return [name, summaries.reduce((total, summary) => total + (summary.netByPlayer[name] ?? 0), 0)];
  }));
}
function expectLedgerMatchesRoundSum(combined: ReturnType<typeof calculateContestSettlement>, rounds: ReturnType<typeof calculateContestSettlement>[]) {
  const expected = addRoundLedgers(rounds);
  for (const [name, amount] of Object.entries(expected)) {
    expect(combined.netByPlayer[name] ?? 0).toBeCloseTo(amount, 2);
  }
}

describe("multi-round, multi-group settlement isolation (AUG-832)", () => {
  test("skins settles each round independently across two courses", () => {
    const contest = fixture(["skins"]);
    const combined = calculateContestSettlement(contest);
    const rounds = roundSettlement(contest, "skins");
    assertConservingAndNonzero(combined);
    expectLedgerMatchesRoundSum(combined, rounds);
  });

  test("Nassau settles each round independently when two players are absent in Round 3", () => {
    // Round 3 regroups the remaining 14 as 4/4/4/2, all supported version-one Nassau shapes.
    const contest = fixture(["nassau"]);
    const combined = calculateContestSettlement(contest);
    const rounds = roundSettlement(contest, "nassau");
    assertConservingAndNonzero(combined);
    expectLedgerMatchesRoundSum(combined, rounds);
  });

  test("stableford totals use each round course and omit both Round 3-absent players", () => {
    const contest = fixture(["stableford"]);
    const combined = calculateContestSettlement(contest);
    const settlements = roundSettlement(contest, "stableford");
    assertConservingAndNonzero(combined);
    expectLedgerMatchesRoundSum(combined, settlements);

    const actual = new Map(contestStableford(contest).map((row) => [row.playerId, row.points]));
    const expected = new Map<string, number>();
    for (const round of contest.rounds ?? []) {
      for (const row of calcStableford(round.groups.flatMap((g) => g.players), round.course ?? contest.course, contest.gameConfig)) {
        expected.set(row.playerId, (expected.get(row.playerId) ?? 0) + row.points);
      }
    }
    expect(actual).toEqual(expected);
    for (const absentId of ["p14", "p15"]) {
      const throughRoundTwo = (contest.rounds ?? []).slice(0, 2).flatMap((round) =>
        calcStableford(round.groups.flatMap((g) => g.players), round.course ?? contest.course, contest.gameConfig)
          .filter((row) => row.playerId === absentId),
      ).reduce((sum, row) => sum + row.points, 0);
      expect(actual.get(absentId)).toBe(throughRoundTwo);
      expect(contest.rounds?.[2].groups.flatMap((g) => g.players).some((p) => p.id === absentId)).toBe(false);
    }
  });

  test("changing Course B par changes only Round 2 Stableford contribution", () => {
    const contest = fixture(["stableford"]);
    const changed: Contest = {
      ...contest,
      rounds: contest.rounds?.map((round) => round.id !== "r2" ? round : {
        ...round,
        course: { ...COURSE_B, holes: COURSE_B.holes.map((hole, index) => index === 0 ? { ...hole, par: 3 } : hole) },
      }),
    };
    const contributions = (input: Contest) => (input.rounds ?? []).map((round) =>
      calcStableford(round.groups.flatMap((g) => g.players), round.course ?? input.course, input.gameConfig)
        .map((row) => [row.playerId, row.points] as const),
    );
    const before = contributions(contest);
    const after = contributions(changed);
    expect(after[0]).toEqual(before[0]);
    expect(after[2]).toEqual(before[2]);
    expect(after[1]).not.toEqual(before[1]);
  });
});
