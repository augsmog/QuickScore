import { applyCut } from "../cut-line";
import type { LeaderboardRow } from "../leaderboard-rows";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;

function row(playerId: string, total: number, thru: LeaderboardRow["thru"] = "F"): LeaderboardRow {
  return { playerId, name: playerId, total, rank: 1, tied: false, rankLabel: "1", thru, teeTime: null, groupId: null };
}

describe("applyCut", () => {
  it("keeps every player tied across the Top N boundary", () => {
    const result = applyCut([row("a", 70), row("b", 71), row("c", 72), row("d", 72), row("e", 72), row("f", 73)], { kind: "top_n_and_ties", n: 3 });
    expect(result).toEqual({ made: ["a", "b", "c", "d", "e"], missed: ["f"], cutScore: 72 });
  });

  it("includes the within-strokes boundary", () => {
    const result = applyCut([row("a", -2), row("b", 2), row("c", 3), row("d", 4)], { kind: "within_strokes", strokes: 5 });
    expect(result).toEqual({ made: ["a", "b", "c"], missed: ["d"], cutScore: 3 });
  });

  it("lets the full field make a cut larger than the field", () => {
    expect(applyCut([row("a", 70), row("b", 80)], { kind: "top_n_and_ties", n: 10 })).toEqual({
      made: ["a", "b"], missed: [], cutScore: 80,
    });
  });

  it("treats players with no completed round as missed and documents their exclusion", () => {
    expect(applyCut([row("a", 70), row("pending", 68, null)], { kind: "top_n_and_ties", n: 10 })).toEqual({
      made: ["a"], missed: ["pending"], cutScore: 70,
    });
  });

  it("ranks the supplied Gross or Net totals without recomputing them", () => {
    const gross = applyCut([row("g1", 76), row("g2", 78)], { kind: "top_n_and_ties", n: 1 });
    const net = applyCut([row("n1", 70), row("n2", 68)], { kind: "top_n_and_ties", n: 1 });
    expect(gross.made).toEqual(["g1"]);
    expect(net.made).toEqual(["n2"]);
  });

  it("keeps output order deterministic and rejects invalid limits", () => {
    expect(applyCut([row("b", 71), row("a", 70)], { kind: "top_n_and_ties", n: 1 }).made).toEqual(["a"]);
    expect(() => applyCut([row("a", 70)], { kind: "top_n_and_ties", n: 1.5 })).toThrow(RangeError);
  });
});
