import { buildLeaderboardRows, LeaderboardGroup } from "../leaderboard-rows";
import { calcStrokePlay } from "../calculators/stroke-play";
import type { Course, Player, StrokePlayResult } from "../types";

// The repository intentionally does not install @types/jest; Jest supplies these globals at runtime.
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: any;

// Par-72 course used for THRU and for driving calcStrokePlay in the 72-player fixture.
const COURSE: Course = {
  name: "Test GC",
  holes: Array.from({ length: 18 }, (_, i) => ({
    num: i + 1,
    par: 4,
    hcp: i + 1,
    yards: 350,
  })),
};

function player(id: string, name: string, scores: number[]): Player {
  return { id, name, handicap: 0, scores };
}

// Full 18-hole round whose strokes sum to `total` (so calcStrokePlay returns `total`).
function roundTo(total: number): number[] {
  const scores = Array(18).fill(4); // base 72
  let delta = total - 72;
  let i = 0;
  while (delta !== 0 && i < 18) {
    if (delta > 0) {
      scores[i] += 1;
      delta -= 1;
    } else {
      // keep strokes >= 1
      if (scores[i] > 1) {
        scores[i] -= 1;
        delta += 1;
      }
    }
    i = (i + 1) % 18;
  }
  return scores;
}

// Reference rank/label exactly as app/contest/[id]/index.tsx computes it today
// (results.findIndex / results.filter), to prove buildLeaderboardRows matches.
function refLabel(results: StrokePlayResult[], total: number): string {
  const rank = results.findIndex((x) => x.total === total) + 1;
  const tied = results.filter((x) => x.total === total).length > 1;
  return tied ? `T${rank}` : `${rank}`;
}

describe("buildLeaderboardRows", () => {
  test("3-way tie shares a rank and the next distinct total skips (1, T2, T2, T2, 5)", () => {
    const results: StrokePlayResult[] = [
      { playerId: "a", name: "A", front: 0, back: 0, total: 70, toPar: -2 },
      { playerId: "b", name: "B", front: 0, back: 0, total: 72, toPar: 0 },
      { playerId: "c", name: "C", front: 0, back: 0, total: 72, toPar: 0 },
      { playerId: "d", name: "D", front: 0, back: 0, total: 72, toPar: 0 },
      { playerId: "e", name: "E", front: 0, back: 0, total: 75, toPar: 3 },
    ];
    const rows = buildLeaderboardRows(results, [], { holeCount: 18 });
    expect(rows.map((r) => r.rankLabel)).toEqual(["1", "T2", "T2", "T2", "5"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 2, 5]);
    expect(rows.map((r) => r.tied)).toEqual([false, true, true, true, false]);
  });

  test("all tied → everyone is T1", () => {
    const results: StrokePlayResult[] = ["a", "b", "c", "d"].map((id) => ({
      playerId: id,
      name: id.toUpperCase(),
      front: 0,
      back: 0,
      total: 71,
      toPar: -1,
    }));
    const rows = buildLeaderboardRows(results, [], { holeCount: 18 });
    expect(rows.map((r) => r.rankLabel)).toEqual(["T1", "T1", "T1", "T1"]);
    expect(rows.every((r) => r.rank === 1 && r.tied)).toBe(true);
  });

  test("no scores → thru is null; distinct totals are not tied", () => {
    const players = [player("a", "A", Array(18).fill(0)), player("b", "B", Array(18).fill(0))];
    const results = calcStrokePlay(players, COURSE); // both total 0
    const rows = buildLeaderboardRows(results, players, { holeCount: 18 });
    expect(rows.map((r) => r.thru)).toEqual([null, null]);
    // both total 0 → tied T1
    expect(rows.map((r) => r.rankLabel)).toEqual(["T1", "T1"]);
  });

  test("THRU: F for a full round, the count for a partial round, null for none", () => {
    const full = player("f", "Full", Array(18).fill(4));
    const partial = player("p", "Partial", [...Array(7).fill(4), ...Array(11).fill(0)]);
    const none = player("n", "None", Array(18).fill(0));
    const players = [full, partial, none];
    const results = calcStrokePlay(players, COURSE);
    const rows = buildLeaderboardRows(results, players, { holeCount: 18 });
    const byId = Object.fromEntries(rows.map((r) => [r.playerId, r.thru]));
    expect(byId["f"]).toBe("F");
    expect(byId["p"]).toBe(7);
    expect(byId["n"]).toBe(null);
  });

  test("THRU respects a 9-hole course: 9 played of 9 is F", () => {
    const nineHole: Course = { name: "Nine", holes: COURSE.holes.slice(0, 9) };
    const p = player("p", "P", [...Array(9).fill(4), ...Array(9).fill(0)]);
    const results = calcStrokePlay([p], nineHole);
    const rows = buildLeaderboardRows(results, [p], { holeCount: 9 });
    expect(rows[0].thru).toBe("F");
  });

  test("search + group filters keep the original field rank", () => {
    const results: StrokePlayResult[] = [
      { playerId: "a", name: "Alice", front: 0, back: 0, total: 70, toPar: -2 },
      { playerId: "b", name: "Bob", front: 0, back: 0, total: 72, toPar: 0 },
      { playerId: "c", name: "Carol", front: 0, back: 0, total: 72, toPar: 0 },
      { playerId: "d", name: "ALBERT", front: 0, back: 0, total: 75, toPar: 3 },
    ];
    const groups: LeaderboardGroup[] = [
      { id: "g1", players: [{ id: "a" }, { id: "d" }] },
      { id: "g2", players: [{ id: "b" }, { id: "c" }] },
    ];

    // groupId per row is assigned before filtering.
    const all = buildLeaderboardRows(results, [], { holeCount: 18, groups });
    expect(Object.fromEntries(all.map((r) => [r.playerId, r.groupId]))).toEqual({
      a: "g1",
      b: "g2",
      c: "g2",
      d: "g1",
    });

    // Case-insensitive substring "al" matches Alice (rank 1) and ALBERT (rank 4);
    // ranks are preserved from the full field.
    const searched = buildLeaderboardRows(results, [], { holeCount: 18, groups, query: "AL" });
    expect(searched.map((r) => [r.name, r.rankLabel])).toEqual([
      ["Alice", "1"],
      ["ALBERT", "4"],
    ]);

    // Group filter keeps only g2 (Bob, Carol) but keeps their real ranks (T2).
    const g2 = buildLeaderboardRows(results, [], { holeCount: 18, groups, groupId: "g2" });
    expect(g2.map((r) => [r.name, r.rankLabel])).toEqual([
      ["Bob", "T2"],
      ["Carol", "T2"],
    ]);

    // Combined search + group: Alice and ALBERT are both in g1 and match "al";
    // ranks stay the full-field ranks (1 and 4), order preserved.
    const combined = buildLeaderboardRows(results, [], {
      holeCount: 18,
      groups,
      query: "al",
      groupId: "g1",
    });
    expect(combined.map((r) => [r.name, r.rankLabel])).toEqual([
      ["Alice", "1"],
      ["ALBERT", "4"],
    ]);
  });

  test("72-player field: rank labels match the current index.tsx findIndex/filter logic exactly", () => {
    // 72 players with many ties: totals cycle through a small set so tie groups
    // of varying sizes appear throughout the field.
    const totalsPattern = [68, 70, 70, 72, 72, 72, 74, 75, 76, 76, 78, 80];
    const players: Player[] = Array.from({ length: 72 }, (_, i) =>
      player(`p${i}`, `Player ${i}`, roundTo(totalsPattern[i % totalsPattern.length] + Math.floor(i / 36))),
    );
    const results = calcStrokePlay(players, COURSE);

    const rows = buildLeaderboardRows(results, players, { holeCount: 18 });

    // Same order as the sorted results, and identical rank labels per row.
    expect(rows.map((r) => r.playerId)).toEqual(results.map((r) => r.playerId));
    for (const row of rows) {
      expect(row.rankLabel).toBe(refLabel(results, row.total));
    }

    // Spot check: first row is rank 1 (or T1 if the best total is shared).
    expect(rows[0].rank).toBe(1);
    // Ranks are non-decreasing down the board.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].rank).toBeGreaterThanOrEqual(rows[i - 1].rank);
    }
  });
});

// AUG-253i (AUG-745) / AUG-253j (AUG-746): the pinned-"You" contract. youPlayerId is a
// fixture/debug id (there is no real user↔player link yet — AUG-254). When it matches a row
// that survives the filters, that row is flagged `isYou` and moved to the front WITHOUT
// renumbering any rank/label/tied. Unset or unmatched is a byte-identical no-op.
describe("buildLeaderboardRows youPlayerId pin", () => {
  const FIELD: StrokePlayResult[] = [
    { playerId: "a", name: "Alice", front: 0, back: 0, total: 70, toPar: -2 },
    { playerId: "b", name: "Bob", front: 0, back: 0, total: 72, toPar: 0 },
    { playerId: "c", name: "Carol", front: 0, back: 0, total: 72, toPar: 0 },
    { playerId: "d", name: "Dave", front: 0, back: 0, total: 75, toPar: 3 },
  ];

  test("unset youPlayerId → identical to the no-option call, no isYou anywhere (golden)", () => {
    const base = buildLeaderboardRows(FIELD, [], { holeCount: 18 });
    const withUndefined = buildLeaderboardRows(FIELD, [], { holeCount: 18, youPlayerId: undefined });
    expect(withUndefined).toEqual(base);
    expect(withUndefined.every((r) => r.isYou === undefined)).toBe(true);
  });

  test("present (non-leader) → that row is first, flagged isYou, every rank/label unchanged", () => {
    const base = buildLeaderboardRows(FIELD, [], { holeCount: 18 });
    const rows = buildLeaderboardRows(FIELD, [], { holeCount: 18, youPlayerId: "c" });

    // Carol (field rank T2, 3rd on the board) is pinned to the front.
    expect(rows.map((r) => r.playerId)).toEqual(["c", "a", "b", "d"]);
    expect(rows[0].isYou).toBe(true);
    // No other row is flagged.
    expect(rows.filter((r) => r.isYou).map((r) => r.playerId)).toEqual(["c"]);
    // Field ranks/labels/tied are the player's real values, not renumbered by the move.
    const labelById = Object.fromEntries(rows.map((r) => [r.playerId, r.rankLabel]));
    const baseLabelById = Object.fromEntries(base.map((r) => [r.playerId, r.rankLabel]));
    expect(labelById).toEqual(baseLabelById);
    expect(rows.find((r) => r.playerId === "c")!.rankLabel).toBe("T2");
    expect(rows.find((r) => r.playerId === "c")!.rank).toBe(2);
  });

  test("matches the leader → stays first and is flagged, order and ranks unchanged", () => {
    const base = buildLeaderboardRows(FIELD, [], { holeCount: 18 });
    const rows = buildLeaderboardRows(FIELD, [], { holeCount: 18, youPlayerId: "a" });
    expect(rows.map((r) => r.playerId)).toEqual(base.map((r) => r.playerId));
    expect(rows[0].playerId).toBe("a");
    expect(rows[0].isYou).toBe(true);
    expect(rows[0].rankLabel).toBe("1");
    expect(rows.slice(1).every((r) => r.isYou === undefined)).toBe(true);
  });

  test("unmatched youPlayerId → no-op: no pin, no isYou, identical to base", () => {
    const base = buildLeaderboardRows(FIELD, [], { holeCount: 18 });
    const rows = buildLeaderboardRows(FIELD, [], { holeCount: 18, youPlayerId: "zzz" });
    expect(rows).toEqual(base);
    expect(rows.every((r) => r.isYou === undefined)).toBe(true);
  });

  test("youPlayerId survives a search filter → pinned, field rank preserved", () => {
    // Query "a" keeps Alice(1), Carol(T2), Dave(4); pin Carol to the front.
    const rows = buildLeaderboardRows(FIELD, [], { holeCount: 18, query: "a", youPlayerId: "c" });
    expect(rows.map((r) => r.playerId)).toEqual(["c", "a", "d"]);
    expect(rows[0].isYou).toBe(true);
    expect(rows[0].rankLabel).toBe("T2"); // Carol's real field rank, not "1"
  });

  test("youPlayerId filtered OUT by search → no pin, no isYou (ranks still pre-filter)", () => {
    // Query "a" drops Bob; pinning Bob is then a no-op.
    const rows = buildLeaderboardRows(FIELD, [], { holeCount: 18, query: "a", youPlayerId: "b" });
    expect(rows.map((r) => r.playerId)).toEqual(["a", "c", "d"]);
    expect(rows.every((r) => r.isYou === undefined)).toBe(true);
  });

  test("youPlayerId composes with a group filter: pin only within the surviving group", () => {
    const groups: LeaderboardGroup[] = [
      { id: "g1", players: [{ id: "a" }, { id: "d" }] },
      { id: "g2", players: [{ id: "b" }, { id: "c" }] },
    ];
    const rows = buildLeaderboardRows(FIELD, [], { holeCount: 18, groups, groupId: "g2", youPlayerId: "c" });
    expect(rows.map((r) => r.playerId)).toEqual(["c", "b"]);
    expect(rows[0].isYou).toBe(true);
    expect(rows[0].rankLabel).toBe("T2");
    // A youPlayerId in the filtered-out group is a no-op.
    const other = buildLeaderboardRows(FIELD, [], { holeCount: 18, groups, groupId: "g2", youPlayerId: "a" });
    expect(other.every((r) => r.isYou === undefined)).toBe(true);
  });

  test("16-player fixture: pinned You keeps its real field rank at the top", () => {
    const players: Player[] = Array.from({ length: 16 }, (_, i) =>
      player(`p${i}`, `Player ${i}`, roundTo(70 + i)),
    );
    const results = calcStrokePlay(players, COURSE);
    const youId = results[6].playerId; // the 7th player on the board
    const expectedLabel = refLabel(results, results[6].total);

    const rows = buildLeaderboardRows(results, players, { holeCount: 18, youPlayerId: youId });
    expect(rows[0].playerId).toBe(youId);
    expect(rows[0].isYou).toBe(true);
    expect(rows[0].rankLabel).toBe(expectedLabel);
    // Exactly one flagged row, and every other label is unchanged from the base board.
    expect(rows.filter((r) => r.isYou)).toHaveLength(1);
    const base = buildLeaderboardRows(results, players, { holeCount: 18 });
    const baseLabelById = Object.fromEntries(base.map((r) => [r.playerId, r.rankLabel]));
    for (const row of rows) expect(row.rankLabel).toBe(baseLabelById[row.playerId]);
  });
});
