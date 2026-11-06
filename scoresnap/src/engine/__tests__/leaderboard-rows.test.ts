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

    // Pinning composes after both filters and preserves the pre-filter competition rank.
    const pinnedCarol = buildLeaderboardRows(results, [], {
      holeCount: 18,
      groups,
      query: "car",
      groupId: "g2",
      youPlayerId: "c",
    });
    expect(pinnedCarol).toHaveLength(1);
    expect(pinnedCarol[0]).toMatchObject({ playerId: "c", isYou: true, rank: 2, rankLabel: "T2", tied: true });

    // A filtered-out player and an omitted id preserve the exact previous output.
    expect(buildLeaderboardRows(results, [], { holeCount: 18, groups, youPlayerId: "c", query: "al", groupId: "g1" }))
      .toEqual(combined);
    expect(buildLeaderboardRows(results, [], { holeCount: 18, groups })).toEqual(all);
    expect(buildLeaderboardRows(results, [], { holeCount: 18, groups, youPlayerId: "missing" })).toEqual(all);
  });

  test("16-player field pins the selected player without changing rank data or other order", () => {
    const players = Array.from({ length: 16 }, (_, i) =>
      player(`p${i + 1}`, `Player ${i + 1}`, roundTo(72 + i)),
    );
    const results = calcStrokePlay(players, COURSE);
    const original = buildLeaderboardRows(results, players, { holeCount: 18 });
    const youPlayerId = original[15].playerId;
    const expectedYou = original.find((row) => row.playerId === youPlayerId)!;
    const pinned = buildLeaderboardRows(results, players, { holeCount: 18, youPlayerId });

    expect(pinned[0]).toMatchObject({
      playerId: youPlayerId,
      isYou: true,
      rank: expectedYou.rank,
      rankLabel: expectedYou.rankLabel,
      tied: expectedYou.tied,
      thru: expectedYou.thru,
    });
    expect(pinned.slice(1)).toEqual(original.filter((row) => row.playerId !== youPlayerId));
    expect(pinned.slice(1).every((row) => !row.isYou)).toBe(true);
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

    const youPlayerId = rows[71].playerId;
    const expectedYou = rows[71];
    const pinned = buildLeaderboardRows(results, players, { holeCount: 18, youPlayerId });
    expect(pinned[0]).toMatchObject({
      playerId: youPlayerId,
      isYou: true,
      rank: expectedYou.rank,
      rankLabel: expectedYou.rankLabel,
      tied: expectedYou.tied,
      thru: expectedYou.thru,
    });
    expect(pinned.slice(1).map((row) => row.playerId)).toEqual(
      rows.slice(0, 71).map((row) => row.playerId),
    );
  });
});
