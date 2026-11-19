import { contestCutAfterRound, contestFieldForRound } from "../contest-cut";
import type { Contest, ContestGroup, RoundInfo } from "../../stores/contest-store";
import type { Course, Player } from "../types";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

const course = (name = "A", par = 4): Course => ({ name, holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par, hcp: i + 1, yards: 400 })) });
const player = (id: string, score: number, overrides: Partial<Player> = {}): Player => ({ id, name: id, handicap: 0, scores: Array(18).fill(score), ...overrides });
const group = (id: string, players: Player[]): ContestGroup => ({ id, name: id, players });
const round = (number: number, players: Player[], c = course()): RoundInfo => ({ id: `r${number}`, number, name: `R${number}`, course: c, groups: [group(`g${number}`, players)] });
const contest = (rounds: RoundInfo[], overrides: Partial<Contest> = {}): Contest => ({ id: "c", name: "Cup", status: "active", course: course(), betUnit: 1, hasTeams: false, groups: [], games: [], createdAt: "", rounds, isTournament: true, ...overrides });

describe("contestCutAfterRound", () => {
  it("applies top-4-and-ties to cumulative totals and exposes next-round field", () => {
    const first = Array.from({ length: 8 }, (_, i) => player(`p${i}`, i < 3 ? 3 + i : i === 3 || i === 4 ? 6 : 8));
    const second = first.map((p, i) => player(p.id, i < 3 ? 3 : i === 3 || i === 4 ? 6 : 8));
    const c = contest([round(1, first), round(2, second), round(3, second)]);
    const result = contestCutAfterRound(c, { kind: "top_n_and_ties", n: 4 }, { afterRound: 2, rankMode: "gross" });
    expect(result).not.toBe("unsupported");
    if (result === "unsupported") return;
    expect(result.result.made).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    expect(contestFieldForRound(c, 3, result.result).map((p) => p.id)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  it("supports within-strokes, course-specific totals, and no input mutation", () => {
    const r1 = round(1, [player("a", 4), player("b", 5)], course("one", 4));
    const r2 = round(2, [player("a", 5), player("b", 4)], course("two", 5));
    const c = contest([r1, r2, round(3, [])]);
    const before = JSON.stringify(c);
    const result = contestCutAfterRound(c, { kind: "within_strokes", strokes: 3 }, { afterRound: 1, rankMode: "gross" });
    expect(result).not.toBe("unsupported");
    if (result === "unsupported") return;
    expect(result.standings.map((row) => row.total)).toEqual([72, 90]);
    expect(result.result.made).toEqual(["a"]);
    expect(JSON.stringify(c)).toBe(before);
  });

  it("uses gross if any requested net round cannot rank net", () => {
    const netPlayers = [player("a", 5, { handicap: 18 }), player("b", 4)];
    const grossPlayers = [player("a", 5, { handicap: 18 }), player("b", 4)];
    const c = contest([round(1, netPlayers), round(2, grossPlayers, { name: "Nine", holes: course().holes.slice(0, 9) }), round(3, grossPlayers)]);
    const result = contestCutAfterRound(c, { kind: "top_n_and_ties", n: 1 }, { afterRound: 2, rankMode: "net" });
    expect(result).not.toBe("unsupported");
    if (result !== "unsupported") {
      expect(result.mode).toBe("gross");
      expect(result.standings.map((row) => row.total)).toEqual([180, 144]);
    }
  });

  it("treats WD, NS, incomplete cards and players absent from a round as misses", () => {
    const first = [player("wd", 3, { status: "WD" }), player("ns", 4, { status: "NS" }), player("partial", 4, { scores: [4, 4, ...Array(16).fill(0)] }), player("gone", 4), player("ok", 4)];
    const second = [player("wd", 3), player("ns", 4), player("partial", 4), player("ok", 4, { status: "WD" })];
    const result = contestCutAfterRound(contest([round(1, first), round(2, second), round(3, second)]), { kind: "top_n_and_ties", n: 10 }, { afterRound: 2, rankMode: "gross" });
    expect(result).not.toBe("unsupported");
    if (result !== "unsupported") expect(result.result.missed).toEqual(["wd", "ns", "partial", "gone", "ok"]);
  });

  it("rejects invalid rounds and non-tournaments and returns unsupported team-card contests", () => {
    const rs = [round(1, []), round(2, []), round(3, [])];
    expect(() => contestCutAfterRound(contest(rs, { isTournament: false }), { kind: "top_n_and_ties", n: 1 }, { afterRound: 1, rankMode: "gross" })).toThrow(RangeError);
    expect(() => contestCutAfterRound(contest(rs), { kind: "top_n_and_ties", n: 1 }, { afterRound: 9, rankMode: "gross" })).toThrow(RangeError);
    expect(() => contestCutAfterRound(contest(rs), { kind: "top_n_and_ties", n: 1 }, { afterRound: 3, rankMode: "gross" })).toThrow(RangeError);
    const team = contest(rs, { games: ["alternate_shot" as any], gameConfig: { rulesVersion: 1 } as any });
    expect(contestCutAfterRound(team, { kind: "top_n_and_ties", n: 1 }, { afterRound: 1, rankMode: "gross" })).toBe("unsupported");
  });
});
