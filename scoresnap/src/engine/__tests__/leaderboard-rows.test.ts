import { buildLeaderboardRows, LeaderboardGroup } from "../leaderboard-rows";
import { calcStrokePlay } from "../calculators/stroke-play";
import { calcNetStrokePlay, NetBreakdown } from "../calculators/net-stroke-play";
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
  test("empty field stays empty with optional filters, pin, groups, and round context", () => {
    expect(buildLeaderboardRows([], [], { holeCount: 18 })).toEqual([]);
    expect(buildLeaderboardRows([], [], {
      holeCount: 18,
      youPlayerId: "me",
      query: "player",
      groupId: "g1",
      groups: [{ id: "g1", players: [{ id: "me" }] }],
      roundInfo: { r1: [], today: [] },
    })).toEqual([]);
  });

  test("single player has rank 1 and is not tied", () => {
    expect(buildLeaderboardRows([
      { playerId: "solo", name: "Solo", front: 0, back: 0, total: -3, toPar: -75 },
    ], [], { holeCount: 18 })).toMatchObject([
      { playerId: "solo", rank: 1, tied: false, rankLabel: "1" },
    ]);
  });

  test("negative totals use competition ranks (1, T2, T2, 4)", () => {
    const results: StrokePlayResult[] = [-5, -3, -3, 0].map((total, i) => ({
      playerId: `p${i}`, name: `P${i}`, front: 0, back: 0, total, toPar: total - 72,
    }));
    const rows = buildLeaderboardRows(results, [], { holeCount: 18 });
    expect(rows.map((row) => row.rankLabel)).toEqual(["1", "T2", "T2", "4"]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 2, 4]);
  });

  test("unsorted totals can disagree: duplicate total is globally tied but gets separate ranks", () => {
    const results: StrokePlayResult[] = [70, 72, 70].map((total, i) => ({
      playerId: `p${i}`, name: `P${i}`, front: 0, back: 0, total, toPar: total - 72,
    }));
    const rows = buildLeaderboardRows(results, [], { holeCount: 18 });
    expect(rows.map((row) => [row.rank, row.tied, row.rankLabel])).toEqual([
      [1, true, "T1"], [2, false, "2"], [3, true, "T3"],
    ]);
  });

  test("duplicate playerIds emit both rows and pin marks the first matching row", () => {
    const results: StrokePlayResult[] = [
      { playerId: "dup", name: "First", front: 0, back: 0, total: 70, toPar: -2 },
      { playerId: "other", name: "Other", front: 0, back: 0, total: 71, toPar: -1 },
      { playerId: "dup", name: "Second", front: 0, back: 0, total: 72, toPar: 0 },
    ];
    const rows = buildLeaderboardRows(results, [], { holeCount: 18, youPlayerId: "dup" });
    expect(rows.map((row) => [row.name, row.rank, row.isYou === true])).toEqual([
      ["First", 1, true], ["Other", 2, false], ["Second", 3, false],
    ]);
  });

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

  // AUG-253n: pre-start tee-time token on the sibling `teeTime` field.
  test("tee time: not-started player exposes the group tee time, thru stays null", () => {
    const none = player("n", "None", Array(18).fill(0));
    const results = calcStrokePlay([none], COURSE);
    const groups: LeaderboardGroup[] = [{ id: "g1", players: [{ id: "n" }], teeTime: "8:40 AM" }];
    const rows = buildLeaderboardRows(results, [none], { holeCount: 18, groups });
    expect(rows[0].thru).toBe(null);
    expect(rows[0].teeTime).toBe("8:40 AM");
  });

  test("tee time: a started (mid-round) player clears the tee time", () => {
    const partial = player("p", "Partial", [...Array(7).fill(4), ...Array(11).fill(0)]);
    const results = calcStrokePlay([partial], COURSE);
    const groups: LeaderboardGroup[] = [{ id: "g1", players: [{ id: "p" }], teeTime: "9:10 AM" }];
    const rows = buildLeaderboardRows(results, [partial], { holeCount: 18, groups });
    expect(rows[0].thru).toBe(7);
    expect(rows[0].teeTime).toBe(null);
  });

  test("tee time: a finished player clears the tee time (thru F, teeTime null)", () => {
    const full = player("f", "Full", Array(18).fill(4));
    const results = calcStrokePlay([full], COURSE);
    const groups: LeaderboardGroup[] = [{ id: "g1", players: [{ id: "f" }], teeTime: "7:30 AM" }];
    const rows = buildLeaderboardRows(results, [full], { holeCount: 18, groups });
    expect(rows[0].thru).toBe("F");
    expect(rows[0].teeTime).toBe(null);
  });

  test("tee time: not-started player with no tee time (group omits / empty) is null", () => {
    const noTee = player("a", "A", Array(18).fill(0));
    const emptyTee = player("b", "B", Array(18).fill(0));
    const ungrouped = player("c", "C", Array(18).fill(0));
    const players = [noTee, emptyTee, ungrouped];
    const results = calcStrokePlay(players, COURSE);
    const groups: LeaderboardGroup[] = [
      { id: "g1", players: [{ id: "a" }] }, // teeTime omitted
      { id: "g2", players: [{ id: "b" }], teeTime: "" }, // empty tee time ignored
    ];
    const rows = buildLeaderboardRows(results, players, { holeCount: 18, groups });
    const byId = Object.fromEntries(rows.map((r) => [r.playerId, r.teeTime]));
    expect(byId["a"]).toBe(null);
    expect(byId["b"]).toBe(null);
    expect(byId["c"]).toBe(null);
  });

  test("tee time: omitting tee-time input leaves every row's teeTime null and thru unchanged", () => {
    const full = player("f", "Full", Array(18).fill(4));
    const partial = player("p", "Partial", [...Array(7).fill(4), ...Array(11).fill(0)]);
    const none = player("n", "None", Array(18).fill(0));
    const players = [full, partial, none];
    const results = calcStrokePlay(players, COURSE);
    const rows = buildLeaderboardRows(results, players, { holeCount: 18 });
    expect(rows.every((r) => r.teeTime === null)).toBe(true);
    const byId = Object.fromEntries(rows.map((r) => [r.playerId, r.thru]));
    expect(byId["f"]).toBe("F");
    expect(byId["p"]).toBe(7);
    expect(byId["n"]).toBe(null);
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

// AUG-253m: R1 / Today columns (Figma 15:2). Pure model only — the UI wire is a
// later sibling. These prove: absent roundInfo leaves the row model byte-for-byte
// unchanged; present roundInfo sets r1/today from the per-round StrokePlayResult[];
// a player missing from a round (or an omitted round array) yields null; and the
// columns compose with search/group filters and the you-pin without rank drift.
describe("buildLeaderboardRows R1/Today columns (AUG-253m)", () => {
  // Base keys present on every row regardless of roundInfo. `teeTime` (AUG-760) and `groupId` are
  // always-present siblings of `thru` (value null when inapplicable); only `r1`/`today` are gated on
  // roundInfo. teeTime landed via a branch cut before this assertion existed, so the Nov-8 merge of
  // AUG-760 into main left this list stale — a semantic (not textual) merge break.
  const LEGACY_ROW_KEYS = ["playerId", "name", "total", "rank", "tied", "rankLabel", "thru", "teeTime", "groupId"];

  function scoreMap(results: StrokePlayResult[]): Record<string, { total: number; toPar: number }> {
    return Object.fromEntries(results.map((r) => [r.playerId, { total: r.total, toPar: r.toPar }]));
  }

  test("absent roundInfo: rows carry no r1/today and match the legacy model exactly", () => {
    const players = Array.from({ length: 16 }, (_, i) => player(`p${i + 1}`, `Player ${i + 1}`, roundTo(72 + i)));
    const results = calcStrokePlay(players, COURSE);

    const rows = buildLeaderboardRows(results, players, { holeCount: 18 });
    // No r1/today keys at all (not even undefined) so JSON/goldens are unchanged.
    for (const row of rows) {
      expect("r1" in row).toBe(false);
      expect("today" in row).toBe(false);
      expect(Object.keys(row).sort()).toEqual([...LEGACY_ROW_KEYS].sort());
    }
    // Passing roundInfo: undefined is identical to omitting it.
    expect(buildLeaderboardRows(results, players, { holeCount: 18, roundInfo: undefined })).toStrictEqual(rows);
  });

  test("16-player field: present R1 + Today set each row's round score; rank is unchanged", () => {
    const players = Array.from({ length: 16 }, (_, i) => player(`p${i + 1}`, `Player ${i + 1}`, roundTo(72 + i)));
    const results = calcStrokePlay(players, COURSE);

    // Round 1 and the current round scored independently of the cumulative board.
    const r1Results = calcStrokePlay(
      players.map((p, i) => player(p.id, p.name, roundTo(70 + i))),
      COURSE,
    );
    const todayResults = calcStrokePlay(
      players.map((p, i) => player(p.id, p.name, roundTo(80 - i))),
      COURSE,
    );
    const r1By = scoreMap(r1Results);
    const todayBy = scoreMap(todayResults);

    const plain = buildLeaderboardRows(results, players, { holeCount: 18 });
    const rows = buildLeaderboardRows(results, players, {
      holeCount: 18,
      roundInfo: { r1: r1Results, today: todayResults },
    });

    for (const row of rows) {
      expect(row.r1).toEqual(r1By[row.playerId]);
      expect(row.today).toEqual(todayBy[row.playerId]);
    }
    // R1/Today carry real to-par, not just copies of the cumulative total.
    expect(rows[0].today).toEqual({ total: expect.any(Number), toPar: expect.any(Number) });
    // Adding the columns must not perturb order, rank, ties, or THRU.
    expect(rows.map((r) => [r.playerId, r.rankLabel, r.rank, r.tied, r.thru])).toEqual(
      plain.map((r) => [r.playerId, r.rankLabel, r.rank, r.tied, r.thru]),
    );
  });

  test("a player absent from a round, or an omitted round array, yields null", () => {
    const players = Array.from({ length: 16 }, (_, i) => player(`p${i + 1}`, `Player ${i + 1}`, roundTo(72 + i)));
    const results = calcStrokePlay(players, COURSE);
    const r1Results = calcStrokePlay(
      players.map((p, i) => player(p.id, p.name, roundTo(70 + i))),
      COURSE,
    );
    // Drop player p1 from the round-1 results.
    const partialR1 = r1Results.filter((r) => r.playerId !== "p1");

    const rows = buildLeaderboardRows(results, players, { holeCount: 18, roundInfo: { r1: partialR1 } });
    const byId = Object.fromEntries(rows.map((r) => [r.playerId, r]));
    expect(byId["p1"].r1).toBeNull(); // present in roundInfo but missing from the r1 rows
    expect(byId["p2"].r1).toEqual({ total: r1Results.find((r) => r.playerId === "p2")!.total, toPar: r1Results.find((r) => r.playerId === "p2")!.toPar });
    // `today` array omitted entirely → null for every row (field still present).
    expect(rows.every((r) => r.today === null)).toBe(true);
  });

  test("72-player field: R1/Today compose with the you-pin and filters without rank drift", () => {
    const totalsPattern = [68, 70, 70, 72, 72, 72, 74, 75, 76, 76, 78, 80];
    const players: Player[] = Array.from({ length: 72 }, (_, i) =>
      player(`p${i}`, `Player ${i}`, roundTo(totalsPattern[i % totalsPattern.length] + Math.floor(i / 36))),
    );
    const results = calcStrokePlay(players, COURSE);
    const r1Results = calcStrokePlay(
      players.map((p, i) => player(p.id, p.name, roundTo(69 + (i % 9)))),
      COURSE,
    );
    const todayResults = calcStrokePlay(
      players.map((p, i) => player(p.id, p.name, roundTo(71 + (i % 7)))),
      COURSE,
    );
    const roundInfo = { r1: r1Results, today: todayResults };
    const r1By = scoreMap(r1Results);
    const todayBy = scoreMap(todayResults);

    const plain = buildLeaderboardRows(results, players, { holeCount: 18 });
    const rows = buildLeaderboardRows(results, players, { holeCount: 18, roundInfo });

    // Ranks identical to the no-roundInfo board.
    expect(rows.map((r) => r.rankLabel)).toEqual(plain.map((r) => r.rankLabel));
    for (const row of rows) {
      expect(row.r1).toEqual(r1By[row.playerId]);
      expect(row.today).toEqual(todayBy[row.playerId]);
    }

    // Pin the last player: the pinned row keeps its field rank AND its R1/Today.
    const youPlayerId = rows[71].playerId;
    const expectedYou = rows[71];
    const pinned = buildLeaderboardRows(results, players, { holeCount: 18, roundInfo, youPlayerId });
    expect(pinned[0]).toMatchObject({
      playerId: youPlayerId,
      isYou: true,
      rank: expectedYou.rank,
      rankLabel: expectedYou.rankLabel,
      r1: expectedYou.r1,
      today: expectedYou.today,
    });

    // Search filter preserves R1/Today on each surviving row and its field rank.
    const searched = buildLeaderboardRows(results, players, { holeCount: 18, roundInfo, query: "Player 1" });
    for (const row of searched) {
      expect(row.r1).toEqual(r1By[row.playerId]);
      expect(row.today).toEqual(todayBy[row.playerId]);
      expect(row.rankLabel).toBe(plain.find((r) => r.playerId === row.playerId)!.rankLabel);
    }

    // Group filter composes with roundInfo the same way: surviving rows keep
    // their full-field rank AND their R1/Today. Split the field into two groups.
    const groups: LeaderboardGroup[] = [
      { id: "gA", players: players.filter((_, i) => i % 2 === 0).map((p) => ({ id: p.id })) },
      { id: "gB", players: players.filter((_, i) => i % 2 === 1).map((p) => ({ id: p.id })) },
    ];
    const grouped = buildLeaderboardRows(results, players, { holeCount: 18, roundInfo, groups, groupId: "gB" });
    expect(grouped.length).toBe(36);
    for (const row of grouped) {
      expect(row.groupId).toBe("gB");
      expect(row.r1).toEqual(r1By[row.playerId]);
      expect(row.today).toEqual(todayBy[row.playerId]);
      expect(row.rankLabel).toBe(plain.find((r) => r.playerId === row.playerId)!.rankLabel);
    }

    // Group filter + search + you-pin all together, still with roundInfo intact.
    const youB = grouped[grouped.length - 1].playerId;
    const combined = buildLeaderboardRows(results, players, {
      holeCount: 18,
      roundInfo,
      groups,
      groupId: "gB",
      youPlayerId: youB,
    });
    expect(combined[0]).toMatchObject({
      playerId: youB,
      isYou: true,
      rankLabel: plain.find((r) => r.playerId === youB)!.rankLabel,
      r1: r1By[youB],
      today: todayBy[youB],
    });
  });
});

// AUG-253p: NET-INPUT ranking golden (pure model). `buildLeaderboardRows` ranks
// by whatever `total` the caller passes, so when the caller hands it NET rows
// (total/toPar already carrying net, as the net leaderboard produces from
// `calcNetStrokePlay`) the competition rank / `T` labels / tie flags follow the
// NET totals, independent of gross. This is net-INPUT ranking only — it ships NO
// Net toggle UI and NO Option C full-handicap index work (AUG-562). View-level
// net is covered by `scoresnap/tests/leaderboard-net.test.cjs`; this is the
// pure-model golden. Uses the module-level par-72 COURSE (unique 1..18 stroke
// index => net-supported; a full round allocates exactly `handicap` strokes, so
// net = gross - handicap for handicaps 0..18).
describe("buildLeaderboardRows ranks NET input totals (AUG-253p)", () => {
  // 16-player field engineered so net = gross - handicap REORDERS the board
  // versus gross and makes a three-way net tie at 72. Gross totals are all
  // distinct (gross ranks 1..16, no gross ties), so every tie / reorder below
  // can only come from the net totals.
  //   p0 72/0 ->72  p1 74/2 ->72*  p2 77/5 ->72*  p3 70/0 ->70
  //   p4 85/12->73  p5 88/14->74   p6 90/15->75   p7 76/0 ->76
  //   p8 95/18->77  p9 80/2 ->78   p10 83/4->79   p11 86/6->80
  //   p12 89/8->81  p13 92/10->82  p14 94/11->83  p15 96/12->84
  // (* the three-way tie; their gross is 72/74/77 — not tied in gross.)
  const FIELD: Array<[string, number, number]> = [
    ["p0", 72, 0], ["p1", 74, 2], ["p2", 77, 5], ["p3", 70, 0],
    ["p4", 85, 12], ["p5", 88, 14], ["p6", 90, 15], ["p7", 76, 0],
    ["p8", 95, 18], ["p9", 80, 2], ["p10", 83, 4], ["p11", 86, 6],
    ["p12", 89, 8], ["p13", 92, 10], ["p14", 94, 11], ["p15", 96, 12],
  ];

  function makePlayers(): Player[] {
    return FIELD.map(([id, gross, hcp], i) => ({ ...player(id, `Player ${i + 1}`, roundTo(gross)), handicap: hcp }));
  }

  // Project a net leaderboard into the plain StrokePlayResult shape the UI feeds
  // to buildLeaderboardRows: `total`/`toPar` carry the NET numbers, already
  // sorted by net total ascending (calcNetStrokePlay sorts; we keep that order).
  function netRows(players: Player[]): StrokePlayResult[] {
    return calcNetStrokePlay(players, COURSE).map((r) => {
      const net = r.net as NetBreakdown; // COURSE is net-supported in this fixture
      return { playerId: r.playerId, name: r.name, front: r.front, back: r.back, total: net.netTotal, toPar: net.netToPar };
    });
  }

  test("fixture sanity: net = gross - handicap, a 3-way net tie, and net reorders gross", () => {
    const players = makePlayers();
    const net = calcNetStrokePlay(players, COURSE);
    for (const r of net) {
      const [, gross, hcp] = FIELD.find(([id]) => id === r.playerId)!;
      expect((r.net as NetBreakdown).netTotal).toBe(gross - hcp);
    }
    const rows = netRows(players);
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.total, (counts.get(r.total) ?? 0) + 1);
    expect(counts.get(72)).toBe(3);
    expect([...counts.values()].filter((c) => c > 1)).toEqual([3]);
    const grossOrder = calcStrokePlay(players, COURSE).map((r) => r.playerId);
    expect(rows.map((r) => r.playerId)).not.toEqual(grossOrder);
  });

  test("16-player field: rank / rankLabel / tied follow the NET totals, not gross", () => {
    const players = makePlayers();
    const rows = netRows(players);
    const built = buildLeaderboardRows(rows, players, { holeCount: 18 });

    for (const row of built) {
      expect(row.rankLabel).toBe(refLabel(rows, row.total));
      expect(row.tied).toBe(rows.filter((x) => x.total === row.total).length > 1);
    }
    // The three net-72 players share rank 2 and read T2.
    const tieRows = built.filter((r) => r.total === 72);
    expect(tieRows.map((r) => r.playerId).sort()).toEqual(["p0", "p1", "p2"]);
    expect(tieRows.every((r) => r.rank === 2 && r.tied && r.rankLabel === "T2")).toBe(true);
    // Leader is the net-70 player; next distinct total is the T2 group, then rank
    // 5 — competition ranking on NET (1, T2, T2, T2, 5, ...), not 1..n.
    expect(built[0]).toMatchObject({ playerId: "p3", rank: 1, rankLabel: "1", tied: false });
    expect(built[4]).toMatchObject({ total: 73, rank: 5, rankLabel: "5" });

    // PROOF it is net, not gross: at least one player's rank differs between the
    // gross board and the net board; p1 is T2 in net but not in gross.
    const grossRows = buildLeaderboardRows(calcStrokePlay(players, COURSE), players, { holeCount: 18 });
    const grossRankById = Object.fromEntries(grossRows.map((r) => [r.playerId, r.rank]));
    const netRankById = Object.fromEntries(built.map((r) => [r.playerId, r.rank]));
    expect(Object.keys(netRankById).some((id) => netRankById[id] !== grossRankById[id])).toBe(true);
    expect(netRankById["p1"]).toBe(2);
    expect(grossRankById["p1"]).not.toBe(2);
  });

  test("query + youPlayerId preserve the NET field ranks (no renumber)", () => {
    const players = makePlayers();
    const rows = netRows(players);
    const full = buildLeaderboardRows(rows, players, { holeCount: 18 });
    const fieldRankById = Object.fromEntries(full.map((r) => [r.playerId, { rank: r.rank, label: r.rankLabel, tied: r.tied }]));

    const searched = buildLeaderboardRows(rows, players, { holeCount: 18, query: "Player 1" });
    expect(searched.length).toBeGreaterThan(0);
    for (const row of searched) {
      expect(row.rank).toBe(fieldRankById[row.playerId].rank);
      expect(row.rankLabel).toBe(fieldRankById[row.playerId].label);
      expect(row.tied).toBe(fieldRankById[row.playerId].tied);
    }

    // You-pin on one of the three net-tie players: floats to the top but keeps
    // rank 2 / T2 (the NET field rank); the rest keep their NET ranks and order.
    const pinned = buildLeaderboardRows(rows, players, { holeCount: 18, youPlayerId: "p1" });
    expect(pinned[0]).toMatchObject({ playerId: "p1", isYou: true, rank: 2, rankLabel: "T2", tied: true });
    expect(pinned.slice(1)).toEqual(full.filter((r) => r.playerId !== "p1"));
    for (const row of pinned) {
      expect(row.rank).toBe(fieldRankById[row.playerId].rank);
      expect(row.rankLabel).toBe(fieldRankById[row.playerId].label);
    }

    // query + youPlayerId together still keep the pinned player's NET field rank.
    const both = buildLeaderboardRows(rows, players, { holeCount: 18, query: "Player", youPlayerId: "p2" });
    expect(both[0]).toMatchObject({ playerId: "p2", isYou: true, rank: 2, rankLabel: "T2" });
    for (const row of both) {
      expect(row.rank).toBe(fieldRankById[row.playerId].rank);
    }
  });
});

// AUG-253q: THRU edge cases (pure model). Hardens the `computeThru` / `thru`
// contract so cell/matrix work (AUG-747/758) cannot regress on partial cards.
// THRU is driven purely by the player's `scores` and the `holeCount` argument:
// a hole counts as played when its score is > 0 (null/0/undefined = not played),
// only indices [0, holeCount) are inspected, 0 played => null, all holeCount
// played => "F". Adds NO tee-time field and NO UI (AUG-760 owns tee-time).
describe("computeThru / thru contract edge cases (AUG-253q)", () => {
  // Helper: run one player through the model and read back the single row's thru.
  function thruOf(scores: number[], holeCount: number): "F" | number | null {
    const p = player("x", "X", scores);
    const rows = buildLeaderboardRows(calcStrokePlay([p], sliceCourse(holeCount)), [p], { holeCount });
    return rows[0].thru;
  }
  // Course sized to `holeCount` so calcStrokePlay only grades real holes; THRU
  // itself is holeCount-driven and independent of this, but we keep the card honest.
  function sliceCourse(holeCount: number): Course {
    return { name: `C${holeCount}`, holes: COURSE.holes.slice(0, holeCount) };
  }

  test("(a) 0 holes scored -> thru is null", () => {
    expect(thruOf(Array(18).fill(0), 18)).toBe(null);
  });

  test("(b) 1..holeCount-1 holes scored -> thru is the count of holes played", () => {
    // 1 of 18, a middle count, and holeCount-1 of 18.
    expect(thruOf([4, ...Array(17).fill(0)], 18)).toBe(1);
    expect(thruOf([...Array(7).fill(4), ...Array(11).fill(0)], 18)).toBe(7);
    expect(thruOf([...Array(17).fill(4), 0], 18)).toBe(17);
    // A hole counts by having a score > 0, not by position: scattered scored
    // holes count how many were played, not the furthest index reached.
    expect(thruOf([4, 0, 4, 0, 4, ...Array(13).fill(0)], 18)).toBe(3);
  });

  test("(c) all holeCount holes scored -> 'F'", () => {
    expect(thruOf(Array(18).fill(4), 18)).toBe("F");
  });

  test("(d) scores longer than holeCount still 'F' (holes past holeCount are ignored)", () => {
    // 20 scored entries, holeCount 18 -> first 18 all played -> F, extras ignored.
    expect(thruOf(Array(20).fill(4), 18)).toBe("F");
    // And extra scored holes PAST holeCount never inflate a partial card to 'F':
    // 17 played within [0,18) plus holes 19 & 20 scored -> still a partial 17, not F.
    const scores = [...Array(17).fill(4), 0, 4, 4]; // indices 18,19 scored; index 17 = 0
    expect(scores.length).toBe(20);
    expect(thruOf(scores, 18)).toBe(17);
  });

  test("(e) player absent from players[] -> thru is null and no throw; ranking still computed", () => {
    // Results reference ids with no matching Player entry; computeThru(undefined)
    // must return null instead of throwing, and rank/label still come from totals.
    const results: StrokePlayResult[] = [
      { playerId: "ghost1", name: "G1", front: 0, back: 0, total: 70, toPar: -2 },
      { playerId: "ghost2", name: "G2", front: 0, back: 0, total: 72, toPar: 0 },
      { playerId: "ghost3", name: "G3", front: 0, back: 0, total: 72, toPar: 0 },
    ];
    let rows!: ReturnType<typeof buildLeaderboardRows>;
    expect(() => {
      rows = buildLeaderboardRows(results, [], { holeCount: 18 });
    }).not.toThrow();
    expect(rows.map((r) => r.thru)).toEqual([null, null, null]);
    // The missing-player case does not disturb competition ranking on the totals.
    expect(rows.map((r) => r.rankLabel)).toEqual(["1", "T2", "T2"]);
  });

  test("(f) 9 vs 18 holeCount on a 9-hole card: THRU follows the holeCount argument", () => {
    // Chosen contract (cited in PR body): THRU is holeCount-driven. A completed
    // 9-hole card graded with its real holeCount (9) reads 'F'. Grading the same
    // card with holeCount=18 reports a partial 9 (indices 9..17 are unscored),
    // NOT 'F' — callers must pass the course's hole count.
    const nineScored = [...Array(9).fill(4), ...Array(9).fill(0)];
    expect(thruOf(nineScored, 9)).toBe("F");
    expect(thruOf(nineScored, 18)).toBe(9);
  });

  test("existing 16-player tie golden stays green with THRU inputs omitted (results-only, thru defaults null)", () => {
    // No players[] passed -> every thru defaults to null, and the competition
    // ranking / T-labels on a multi-way tie are unchanged.
    const totals = [68, 70, 70, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82];
    const results: StrokePlayResult[] = totals.map((t, i) => ({
      playerId: `q${i}`,
      name: `Q${i}`,
      front: 0,
      back: 0,
      total: t,
      toPar: t - 72,
    }));
    const rows = buildLeaderboardRows(results, [], { holeCount: 18 });
    expect(rows.every((r) => r.thru === null)).toBe(true);
    expect(rows.slice(0, 5).map((r) => r.rankLabel)).toEqual(["1", "T2", "T2", "T2", "5"]);
    expect(rows.filter((r) => r.total === 70).every((r) => r.rank === 2 && r.tied)).toBe(true);
  });
});
