import { contestCutAfterRound, contestFieldForRound } from "../contest-cut";
import type { Contest, ContestGroup } from "../../stores/contest-store";
import type { Course, Player } from "../types";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const course18 = (name = "Course", par = 4): Course => ({
  name,
  holes: Array.from({ length: 18 }, (_, index) => ({ num: index + 1, par, hcp: index + 1, yards: 400 })),
});
const course9 = (name = "Nine"): Course => ({
  name,
  holes: Array.from({ length: 9 }, (_, index) => ({ num: index + 1, par: 4, hcp: index + 1, yards: 400 })),
});
const scoresFor = (total: number, holes = 18) => [total - (holes - 1) * 4, ...Array(holes - 1).fill(4)];
const player = (id: string, total: number, overrides: Partial<Player> = {}): Player => ({
  id, name: id, handicap: 0, scores: scoresFor(total), ...overrides,
});
const group = (id: string, players: Player[]): ContestGroup => ({ id, name: id, players });
const round = (id: string, number: number, players: Player[], course?: Course) => ({
  id, number, name: `R${number}`, course, groups: [group(`g${number}`, players)],
});
const base = (overrides: Partial<Contest> = {}): Contest => ({
  id: "c1", name: "Tournament", course: course18(), status: "active", betUnit: 1, hasTeams: false,
  groups: [], games: [], createdAt: "", isTournament: true, rounds: [], ...overrides,
});

describe("contestCutAfterRound", () => {
  it("applies Top-4 ties and cumulative totals across eight players", () => {
    const first = [70, 71, 72, 73, 73, 75, 76, 77].map((total, index) => player(`p${index + 1}`, total));
    const second = first.map((p) => player(p.id, 72));
    const contest = base({ rounds: [round("r1", 1, first), round("r2", 2, second), round("r3", 3, second)] });
    const actual = contestCutAfterRound(contest, { kind: "top_n_and_ties", n: 4 }, { afterRound: 1, rankMode: "gross" });
    expect(actual).toMatchObject({ mode: "gross", result: { made: ["p1", "p2", "p3", "p4", "p5"] } });
    expect(actual !== "unsupported" && actual.standings).toEqual(first.map((p) => ({ playerId: p.id, total: Number(p.scores.reduce((a, b) => a + b, 0)), thru: "F" })));
    const cumulative = contestCutAfterRound(contest, { kind: "top_n_and_ties", n: 4 }, { afterRound: 2, rankMode: "gross" });
    expect(cumulative !== "unsupported" && cumulative.standings[0]).toMatchObject({ playerId: "p1", total: 142 });
  });

  it("applies the inclusive within-strokes boundary", () => {
    const players = [70, 72, 73, 74].map((total, index) => player(`p${index + 1}`, total));
    const contest = base({ rounds: [round("r1", 1, players), round("r2", 2, players)] });
    const actual = contestCutAfterRound(contest, { kind: "within_strokes", strokes: 3 }, { afterRound: 1, rankMode: "gross" });
    expect(actual !== "unsupported" && actual.result).toEqual({ made: ["p1", "p2", "p3"], missed: ["p4"], cutScore: 73 });
  });

  it("uses each round's own course for net totals and switches all rounds to gross if one lacks net support", () => {
    const a = course18("A");
    const b = course18("B", 5);
    const golfer = player("golfer", 72, { handicap: 8, courseHandicaps: { A: 2, B: 5 } });
    const other = player("other", 73, { handicap: 0 });
    const contest = base({ course: course18("Contest default"), rounds: [
      round("r1", 1, [golfer, other], a), round("r2", 2, [golfer, other], b), round("r3", 3, [golfer, other], a),
    ] });
    const net = contestCutAfterRound(contest, { kind: "top_n_and_ties", n: 1 }, { afterRound: 1, rankMode: "net" });
    expect(net !== "unsupported" && net.mode).toBe("net");
    expect(net !== "unsupported" && net.standings[0]).toMatchObject({ playerId: "golfer", total: 70 });

    const fallback = base({ rounds: [round("r1", 1, [golfer, other], a), round("r2", 2, [golfer, other], course9()), round("r3", 3, [golfer, other], b)] });
    const gross = contestCutAfterRound(fallback, { kind: "top_n_and_ties", n: 1 }, { afterRound: 2, rankMode: "net" });
    expect(gross !== "unsupported" && gross.mode).toBe("gross");
    expect(gross !== "unsupported" && gross.standings[0]).toMatchObject({ playerId: "golfer", total: 144 });
  });

  it("marks WD, NS, and incomplete-round players missed and de-duplicates ids", () => {
    const first = [
      player("active", 72), player("wd", 70, { status: "WD" }), player("ns", 71, { status: "NS" }),
      player("partial", 60, { scores: [4, 4, 0, ...Array(15).fill(0)] }),
    ];
    const second = [player("active", 72), player("wd", 70), player("ns", 71), player("partial", 72)];
    const contest = base({ rounds: [
      round("r1", 1, [...first, first[0]]), round("r2", 2, second), round("r3", 3, second),
    ] });
    const actual = contestCutAfterRound(contest, { kind: "top_n_and_ties", n: 4 }, { afterRound: 2, rankMode: "gross" });
    expect(actual !== "unsupported" && actual.standings).toHaveLength(4);
    expect(actual !== "unsupported" && actual.standings.find((row) => row.playerId === "active")?.thru).toBe("F");
    expect(actual !== "unsupported" && actual.standings.filter((row) => row.thru === null).map((row) => row.playerId).sort())
      .toEqual(["ns", "partial", "wd"]);
    expect(actual !== "unsupported" && actual.result.missed.slice().sort()).toEqual(["ns", "partial", "wd"]);
  });

  it("returns unsupported for versioned team-card contests", () => {
    const contest = base({
      games: ["alternate_shot"], gameConfig: { rulesVersion: 1 },
      rounds: [round("r1", 1, [player("p", 72)]), round("r2", 2, [player("p", 72)])],
    });
    expect(contestCutAfterRound(contest, { kind: "top_n_and_ties", n: 1 }, { afterRound: 1, rankMode: "gross" }))
      .toBe("unsupported");
  });

  it("validates tournament, round selection and a remaining round, and propagates rule errors", () => {
    const valid = base({ rounds: [round("r1", 1, []), round("r2", 2, [])] });
    const rule = { kind: "top_n_and_ties", n: 1 } as const;
    expect(() => contestCutAfterRound(base({ isTournament: false }), rule, { afterRound: 1, rankMode: "gross" })).toThrow(RangeError);
    expect(() => contestCutAfterRound(valid, rule, { afterRound: 3, rankMode: "gross" })).toThrow(RangeError);
    expect(() => contestCutAfterRound(valid, rule, { afterRound: 2, rankMode: "gross" })).toThrow(RangeError);
    expect(() => contestCutAfterRound(valid, { kind: "top_n_and_ties", n: 1.5 }, { afterRound: 1, rankMode: "gross" })).toThrow(RangeError);
  });

  it("does not mutate inputs and the next-round selector filters only cut misses", () => {
    const first = [player("a", 70), player("b", 75)];
    const next = [player("a", 72), player("b", 73)];
    const contest = base({ rounds: [round("r1", 1, first), round("r2", 2, next)] });
    const before = JSON.stringify(contest);
    const actual = contestCutAfterRound(contest, { kind: "top_n_and_ties", n: 1 }, { afterRound: 1, rankMode: "gross" });
    expect(actual).not.toBe("unsupported");
    if (actual === "unsupported") return;
    const field = contestFieldForRound(contest, 2, actual.result);
    expect(field.map((p) => p.id)).toEqual(["a"]);
    expect(JSON.stringify(contest)).toBe(before);
    expect(contestFieldForRound(contest, 2, { ...actual.result, missed: [] })).toHaveLength(2);
  });
});
