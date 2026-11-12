import { applyCut, withCutStatus } from "../cut-line";
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

describe("withCutStatus", () => {
  it("adds the inclusive Top N cut and preserves row order and rank fields", () => {
    const rows = [row("a", 70), row("b", 72), row("c", 72), row("d", 75)];
    rows[0].rank = 1; rows[0].rankLabel = "T1";
    rows[1].rank = 2; rows[1].rankLabel = "T2";
    rows[2].rank = 2; rows[2].rankLabel = "T2";
    rows[3].rank = 4; rows[3].rankLabel = "4";
    const result = withCutStatus(rows, { kind: "top_n_and_ties", n: 2 });
    expect(result.map((r) => r.playerId)).toEqual(["a", "b", "c", "d"]);
    expect(result.map(({ cut, cutScore }) => [cut, cutScore])).toEqual([
      ["made", 72], ["made", 72], ["made", 72], ["missed", 72],
    ]);
    expect(result.map(({ rank, rankLabel }) => [rank, rankLabel])).toEqual([
      [1, "T1"], [2, "T2"], [2, "T2"], [4, "4"],
    ]);
    expect(rows[0]).not.toHaveProperty("cut");
  });

  it("uses a full-field boundary for already filtered search or group rows", () => {
    const fullField = [row("a", 70), row("b", 71), row("c", 72), row("d", 74)];
    const searchRows = [fullField[2]];
    const groupRows = [fullField[3]];
    expect(withCutStatus(searchRows, { kind: "top_n_and_ties", n: 2 }, fullField)[0])
      .toMatchObject({ cut: "missed", cutScore: 71 });
    expect(withCutStatus(groupRows, { kind: "within_strokes", strokes: 2 }, fullField)[0])
      .toMatchObject({ cut: "missed", cutScore: 72 });
  });

  it("marks unstarted players missed and gives empty fields a null boundary", () => {
    const rows = [row("started", 70), row("pending", 65, null)];
    expect(withCutStatus(rows, { kind: "top_n_and_ties", n: 1 })).toMatchObject([
      { cut: "made", cutScore: 70 }, { cut: "missed", cutScore: 70 },
    ]);
    expect(withCutStatus([], { kind: "top_n_and_ties", n: 1 })).toEqual([]);
    expect(withCutStatus([row("pending", 65, null)], { kind: "top_n_and_ties", n: 1 })[0])
      .toMatchObject({ cut: "missed", cutScore: null });
  });

  it("supports within-strokes cuts", () => {
    const result = withCutStatus([row("a", 70), row("b", 72), row("c", 73)], { kind: "within_strokes", strokes: 2 });
    expect(result.map((r) => r.cut)).toEqual(["made", "made", "missed"]);
    expect(result.map((r) => r.cutScore)).toEqual([72, 72, 72]);
  });
});
