// AUG-278c (TD readiness G2, parent AUG-278 / root AUG-497 SS-GTM): deterministic
// automated evidence that a scored 56-player, multi-group tournament leaderboard
// ranks by total with correct tie labels. The pre-existing E2E
// `scoresnap/e2e/hopwood-cup-56-player.mjs` only asserts the empty state
// ("No scores yet"); this Jest unit closes the "no automated evidence of a
// *scored* 56-player leaderboard" gap by running the real engine
// (`calcStrokePlay` -> `buildLeaderboardRows`) on a seeded 56-player field
// across 14 groups and asserting ranks, ties, totals, THRU and group mapping.
//
// Path chosen: (b) Jest unit. It is deterministic, runs in the Jest CI lane with
// no simulator/EAS build, and exercises exactly the ranking+totals code paths
// G2 is about. The E2E empty-state assertion is intentionally left untouched.

import { calcStrokePlay } from "../calculators/stroke-play";
import { buildLeaderboardRows, LeaderboardGroup } from "../leaderboard-rows";
import type { Course, Player } from "../types";

// Jest supplies these globals at runtime; the repo intentionally omits @types/jest.
declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: any;

// Par-72 course; 18 holes so a full round yields THRU "F".
const COURSE: Course = {
  name: "Readiness GC",
  holes: Array.from({ length: 18 }, (_, i) => ({
    num: i + 1,
    par: 4,
    hcp: i + 1,
    yards: 350,
  })),
};

// 18-hole gross scores whose strokes sum exactly to `total` (so calcStrokePlay
// returns `total`). `total === 0` means a no-show: all 18 holes blank.
function roundTo(total: number): number[] {
  if (total <= 0) return Array(18).fill(0);
  const scores = Array(18).fill(4); // base 72
  let delta = total - 72;
  let i = 0;
  // Guard against infinite loops; 18 holes with strokes >= 1 span 18..infinity.
  let safety = 0;
  while (delta !== 0 && safety < 10000) {
    if (delta > 0) {
      scores[i] += 1;
      delta -= 1;
    } else if (scores[i] > 1) {
      scores[i] -= 1;
      delta += 1;
    }
    i = (i + 1) % 18;
    safety++;
  }
  return scores;
}

const FIELD = 56;
const GROUP_SIZE = 4; // 56 players / 4 = 14 groups

function pid(i: number): string {
  return `p${String(i).padStart(2, "0")}`;
}

// Deterministic gross total per 1-based player index:
//   p01            -> no-show (all zeros, total 0)
//   p02, p03       -> 72 each (a deliberate tie)
//   p04..p56       -> 70 + i (all distinct, strictly increasing)
function totalFor(i: number): number {
  if (i === 1) return 0;
  if (i === 3) return 72; // tie with p02 (which is 70 + 2 = 72)
  return 70 + i;
}

// 56 players; group gN holds players (4N-3 .. 4N).
const PLAYERS: Player[] = Array.from({ length: FIELD }, (_, idx) => {
  const i = idx + 1;
  return {
    id: pid(i),
    name: `Player ${String(i).padStart(2, "0")}`,
    handicap: 0,
    scores: roundTo(totalFor(i)),
  };
});

const GROUPS: LeaderboardGroup[] = Array.from({ length: FIELD / GROUP_SIZE }, (_, g) => ({
  id: `g${g + 1}`,
  players: Array.from({ length: GROUP_SIZE }, (_, k) => ({ id: pid(g * GROUP_SIZE + k + 1) })),
}));

function groupIdForPlayer(i: number): string {
  return `g${Math.ceil(i / GROUP_SIZE)}`;
}

describe("AUG-278c G2: scored 56-player multi-group leaderboard", () => {
  const results = calcStrokePlay(PLAYERS, COURSE);
  const rows = buildLeaderboardRows(results, PLAYERS, { holeCount: 18, groups: GROUPS });
  const byId = new Map(rows.map((r) => [r.playerId, r]));

  test("fixture is a 56-player field across 14 groups of 4", () => {
    expect(PLAYERS).toHaveLength(56);
    expect(GROUPS).toHaveLength(14);
    expect(GROUPS.every((g) => g.players.length === 4)).toBe(true);
    // Every player belongs to exactly one group.
    const grouped = new Set(GROUPS.flatMap((g) => g.players.map((p) => p.id)));
    expect(grouped.size).toBe(56);
  });

  test("leaderboard carries all 56 players", () => {
    expect(rows).toHaveLength(56);
  });

  test("totals equal the seeded gross strokes for every player", () => {
    for (let i = 1; i <= FIELD; i++) {
      const row = byId.get(pid(i))!;
      expect(row.total).toBe(totalFor(i));
    }
    // Spot-check a mid-field value explicitly so the total->row wiring is pinned.
    expect(byId.get("p10")!.total).toBe(80);
  });

  test("scored field is ranked by total ascending", () => {
    const totals = rows.map((r) => r.total);
    for (let k = 1; k < totals.length; k++) {
      expect(totals[k]).toBeGreaterThanOrEqual(totals[k - 1]);
    }
  });

  test("deliberate tie (p02, p03 both 72) shares the competition rank and a T-label", () => {
    const p2 = byId.get("p02")!;
    const p3 = byId.get("p03")!;
    expect(p2.total).toBe(72);
    expect(p3.total).toBe(72);
    expect(p2.tied).toBe(true);
    expect(p3.tied).toBe(true);
    expect(p2.rank).toBe(p3.rank);
    expect(p2.rankLabel).toBe(`T${p2.rank}`);
    expect(p3.rankLabel).toBe(`T${p3.rank}`);
  });

  test("the distinct total after a tie skips the shared positions (1,2,2,4 rule)", () => {
    // Field sorted ascending: p01 (0) first, then the 72-tie (p02,p03), then p04 (74)...
    const tiedRank = byId.get("p02")!.rank;
    const p4 = byId.get("p04")!; // next distinct total (74)
    expect(p4.total).toBe(74);
    expect(p4.tied).toBe(false);
    expect(p4.rank).toBe(tiedRank + 2); // two players shared `tiedRank`, so the next skips 2
    expect(p4.rankLabel).toBe(`${p4.rank}`);
  });

  test("a player with no scores is included at total 0 (current behaviour, documented)", () => {
    // Current product behaviour: `calcStrokePlay` returns a no-score player with
    // total 0, and `buildLeaderboardRows` ranks the field by total ascending, so a
    // no-show (p01) sorts to the top with rank 1 and THRU null. The leaderboard
    // screen (app/contest/[id]/index.tsx) gates the *whole* board on `hasScores`
    // but does not drop individual no-score players from a field that has any
    // scores. This is asserted — not treated as a bug fix — to document G2's
    // current edge behaviour; a change to drop/not-rank no-shows would be a
    // separate shared-engine ticket.
    const noShow = byId.get("p01")!;
    expect(noShow.total).toBe(0);
    expect(noShow.thru).toBeNull();
    expect(noShow.rank).toBe(1);
    expect(noShow.tied).toBe(false);
    expect(rows[0].playerId).toBe("p01");
  });

  test("scored players show THRU 'F' for a completed 18-hole round", () => {
    // Every scored player played all 18 holes, so THRU is "F"; the no-show is null.
    for (let i = 2; i <= FIELD; i++) {
      expect(byId.get(pid(i))!.thru).toBe("F");
    }
    expect(byId.get("p01")!.thru).toBeNull();
  });

  test("each row carries its group id for the multi-group view", () => {
    for (let i = 1; i <= FIELD; i++) {
      expect(byId.get(pid(i))!.groupId).toBe(groupIdForPlayer(i));
    }
  });

  test("group filter keeps real field ranks for one group's players", () => {
    // g2 holds p05..p08. Filtering by group must not renumber: each kept row
    // keeps the rank it had in the full 56-player field.
    const g2Rows = buildLeaderboardRows(results, PLAYERS, {
      holeCount: 18,
      groups: GROUPS,
      groupId: "g2",
    });
    expect(g2Rows.map((r) => r.playerId)).toEqual(["p05", "p06", "p07", "p08"]);
    for (const r of g2Rows) {
      expect(r.rank).toBe(byId.get(r.playerId)!.rank);
      expect(r.groupId).toBe("g2");
    }
  });
});
