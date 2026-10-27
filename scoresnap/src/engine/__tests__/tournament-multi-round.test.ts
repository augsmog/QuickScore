/**
 * Multi-round tournament tests
 * Verifies that scores aggregate correctly across rounds, groups can change between rounds,
 * and leaderboards show cumulative totals.
 * Run with: npx tsx src/engine/__tests__/tournament-multi-round.test.ts
 */

import { Course, Player } from "../types";
import { calcStrokePlay } from "../calculators/stroke-play";
import { calcScopedSkins } from "../calculators/skins";
import { ContestGroup, RoundInfo } from "../../stores/contest-store";

// ─── TEST HELPERS ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ─── TEST COURSE ───────────────────────────────────────────────────
const COURSE: Course = {
  name: "Test Course",
  holes: Array.from({ length: 18 }, (_, i) => ({
    num: i + 1,
    par: i % 3 === 0 ? 5 : i % 3 === 1 ? 3 : 4,
    hcp: i + 1,
    yards: 400,
  })),
};

// Helper to create a player with scores
function makePlayer(id: string, name: string, handicap: number, scores: number[]): Player {
  return { id, name, handicap, scores, team: null };
}

// Helper to calculate total strokes
function totalStrokes(player: Player): number {
  return player.scores.reduce((a, b) => a + b, 0);
}

console.log("\n══════════════════════════════════════════════");
console.log("  Tournament Multi-Round Tests");
console.log("══════════════════════════════════════════════\n");
// ═══════════════════════════════════════════════════════════════════
// TOURNAMENT: 2-ROUND AGGREGATION
// ═══════════════════════════════════════════════════════════════════
section("🏆 2-Round Tournament: Score Aggregation");

{
  // Round 1: 4 players, 2 groups
  const round1Groups: ContestGroup[] = [
    {
      id: "g1",
      name: "Group 1",
      players: [
        makePlayer("p1", "Alice", 10, [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]), // 72
        makePlayer("p2", "Bob", 15, [5, 6, 5, 4, 5, 4, 5, 6, 5, 5, 5, 4, 6, 5, 6, 4, 5, 5]),    // 90
      ],
    },
    {
      id: "g2",
      name: "Group 2",
      players: [
        makePlayer("p3", "Charlie", 5, [4, 4, 4, 3, 4, 3, 4, 4, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4]),  // 68
        makePlayer("p4", "Dana", 20, [6, 7, 6, 5, 6, 5, 6, 7, 6, 6, 6, 5, 7, 6, 7, 5, 6, 6]),   // 108
      ],
    },
  ];

  // Round 2: different groups (Alice with Charlie, Bob with Dana)
  const round2Groups: ContestGroup[] = [
    {
      id: "g3",
      name: "Group 1",
      players: [
        makePlayer("p1", "Alice", 10, [5, 5, 5, 3, 5, 3, 5, 5, 5, 5, 5, 3, 5, 5, 5, 3, 5, 5]),  // 82
        makePlayer("p3", "Charlie", 5, [4, 4, 4, 3, 4, 3, 4, 4, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4]),   // 68
      ],
    },
    {
      id: "g4",
      name: "Group 2",
      players: [
        makePlayer("p2", "Bob", 15, [5, 5, 5, 4, 5, 4, 5, 5, 5, 5, 5, 4, 5, 5, 5, 4, 5, 5]),     // 86
        makePlayer("p4", "Dana", 20, [6, 6, 6, 5, 6, 5, 6, 6, 6, 6, 6, 5, 6, 6, 6, 5, 6, 6]),    // 104
      ],
    },
  ];

  const rounds: RoundInfo[] = [
    { id: "r1", number: 1, name: "Round 1", date: "2026-10-26", groups: round1Groups },
    { id: "r2", number: 2, name: "Round 2", date: "2026-10-27", groups: round2Groups },
  ];

  // Aggregate scores across rounds
  const playerTotals = new Map<string, number>();
  for (const round of rounds) {
    for (const group of round.groups) {
      for (const player of group.players) {
        const current = playerTotals.get(player.id) || 0;
        playerTotals.set(player.id, current + totalStrokes(player));
      }
    }
  }

  assert(playerTotals.get("p1") === 154, "T1: Alice cumulative total 154", `got ${playerTotals.get("p1")}`);
  assert(playerTotals.get("p2") === 176, "T1: Bob cumulative total 176", `got ${playerTotals.get("p2")}`);
  assert(playerTotals.get("p3") === 136, "T1: Charlie cumulative total 136", `got ${playerTotals.get("p3")}`);
  assert(playerTotals.get("p4") === 212, "T1: Dana cumulative total 212", `got ${playerTotals.get("p4")}`);

  // Verify Charlie (p3) leads
  const sorted = Array.from(playerTotals.entries()).sort((a, b) => a[1] - b[1]);
  assert(sorted[0][0] === "p3", "T1: Charlie leads tournament");
  assert(sorted[1][0] === "p1", "T1: Alice second place");
}

// ═══════════════════════════════════════════════════════════════════
// TOURNAMENT: 16 PLAYERS, 3 ROUNDS
// ═══════════════════════════════════════════════════════════════════
section("🏆 16-Player, 3-Round Tournament");

{
  // Create 16 players
  const players = Array.from({ length: 16 }, (_, i) => {
    const id = `p${i + 1}`;
    const name = `Player ${i + 1}`;
    const handicap = i;
    const scores = Array(18).fill(4); // Everyone shoots par 72
    return makePlayer(id, name, handicap, scores);
  });

  // Round 1: 4 groups of 4
  const round1Groups: ContestGroup[] = [
    { id: "r1g1", name: "Group 1", players: players.slice(0, 4) },
    { id: "r1g2", name: "Group 2", players: players.slice(4, 8) },
    { id: "r1g3", name: "Group 3", players: players.slice(8, 12) },
    { id: "r1g4", name: "Group 4", players: players.slice(12, 16) },
  ];

  // Round 2: reshuffle - player 1 with 5, 9, 13
  const round2Groups: ContestGroup[] = [
    { id: "r2g1", name: "Group 1", players: [players[0], players[4], players[8], players[12]] },
    { id: "r2g2", name: "Group 2", players: [players[1], players[5], players[9], players[13]] },
    { id: "r2g3", name: "Group 3", players: [players[2], players[6], players[10], players[14]] },
    { id: "r2g4", name: "Group 4", players: [players[3], players[7], players[11], players[15]] },
  ];

  // Round 3: another reshuffle
  const round3Groups: ContestGroup[] = [
    { id: "r3g1", name: "Group 1", players: [players[0], players[1], players[2], players[3]] },
    { id: "r3g2", name: "Group 2", players: [players[4], players[5], players[6], players[7]] },
    { id: "r3g3", name: "Group 3", players: [players[8], players[9], players[10], players[11]] },
    { id: "r3g4", name: "Group 4", players: [players[12], players[13], players[14], players[15]] },
  ];

  const rounds: RoundInfo[] = [
    { id: "r1", number: 1, name: "Round 1", date: "2026-10-26", groups: round1Groups },
    { id: "r2", number: 2, name: "Round 2", date: "2026-10-27", groups: round2Groups },
    { id: "r3", number: 3, name: "Round 3", date: "2026-10-28", groups: round3Groups },
  ];

  // Verify each player appears exactly once per round
  for (let roundIdx = 0; roundIdx < rounds.length; roundIdx++) {
    const round = rounds[roundIdx];
    const playerIds = new Set<string>();
    for (const group of round.groups) {
      for (const player of group.players) {
        assert(!playerIds.has(player.id), `T2: No duplicate players in Round ${roundIdx + 1}`);
        playerIds.add(player.id);
      }
    }
    assert(playerIds.size === 16, `T2: All 16 players in Round ${roundIdx + 1}`, `got ${playerIds.size}`);
  }

  // Aggregate totals: everyone shot 72 per round = 216 total
  const playerTotals = new Map<string, number>();
  for (const round of rounds) {
    for (const group of round.groups) {
      for (const player of group.players) {
        const current = playerTotals.get(player.id) || 0;
        playerTotals.set(player.id, current + totalStrokes(player));
      }
    }
  }

  assert(playerTotals.size === 16, "T2: All 16 players have cumulative totals");
  for (const [playerId, total] of playerTotals.entries()) {
    assert(total === 216, `T2: ${playerId} total 216`, `got ${total}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TOURNAMENT: MISSING HOLES & EDITS
// ═══════════════════════════════════════════════════════════════════
section("🏆 Tournament with Missing Holes");

{
  // Round 1: Alice plays all 18, Bob missing hole 5
  const round1Groups: ContestGroup[] = [
    {
      id: "g1",
      name: "Group 1",
      players: [
        makePlayer("p1", "Alice", 10, [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]),
        makePlayer("p2", "Bob", 15, [5, 6, 5, 4, 0, 4, 5, 6, 5, 5, 5, 4, 6, 5, 6, 4, 5, 5]), // hole 5 = 0
      ],
    },
  ];

  // Round 2: both play all holes
  const round2Groups: ContestGroup[] = [
    {
      id: "g2",
      name: "Group 1",
      players: [
        makePlayer("p1", "Alice", 10, [4, 4, 4, 3, 4, 3, 4, 4, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4]),
        makePlayer("p2", "Bob", 15, [5, 5, 5, 4, 5, 4, 5, 5, 5, 5, 5, 4, 5, 5, 5, 4, 5, 5]),
      ],
    },
  ];

  const rounds: RoundInfo[] = [
    { id: "r1", number: 1, name: "Round 1", groups: round1Groups },
    { id: "r2", number: 2, name: "Round 2", groups: round2Groups },
  ];

  const playerTotals = new Map<string, number>();
  for (const round of rounds) {
    for (const group of round.groups) {
      for (const player of group.players) {
        const current = playerTotals.get(player.id) || 0;
        // Count only non-zero scores
        const roundTotal = player.scores.reduce((sum, score) => sum + (score > 0 ? score : 0), 0);
        playerTotals.set(player.id, current + roundTotal);
      }
    }
  }

  assert(playerTotals.get("p1") === 140, "T3: Alice total with no missing holes", `got ${playerTotals.get("p1")}`);
  assert(playerTotals.get("p2") === 171, "T3: Bob total with R1 missing hole", `got ${playerTotals.get("p2")}`);
}

section("🏆 Tournament with Mid-Round Edit");

{
  // Initial Round 1 scores
  let round1Groups: ContestGroup[] = [
    {
      id: "g1",
      name: "Group 1",
      players: [
        makePlayer("p1", "Alice", 10, [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]), // 72
      ],
    },
  ];

  // Edit: Alice's hole 5 was actually a 6, not a 4
  round1Groups[0].players[0].scores[4] = 6; // Now 74

  const round2Groups: ContestGroup[] = [
    {
      id: "g2",
      name: "Group 1",
      players: [
        makePlayer("p1", "Alice", 10, [4, 4, 4, 3, 4, 3, 4, 4, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4]), // 68
      ],
    },
  ];

  const rounds: RoundInfo[] = [
    { id: "r1", number: 1, name: "Round 1", groups: round1Groups },
    { id: "r2", number: 2, name: "Round 2", groups: round2Groups },
  ];

  const playerTotals = new Map<string, number>();
  for (const round of rounds) {
    for (const group of round.groups) {
      for (const player of group.players) {
        const current = playerTotals.get(player.id) || 0;
        playerTotals.set(player.id, current + totalStrokes(player));
      }
    }
  }

  assert(playerTotals.get("p1") === 142, "T4: Edited score reflected in cumulative", `got ${playerTotals.get("p1")}`);
}

// ═══════════════════════════════════════════════════════════════════
// TOURNAMENT: GAME MODE COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════
section("🏆 Tournament Game Mode Support");

{
  // Verify stroke play, skins, and other calculators work with tournament players
  const round1Players = [
    makePlayer("p1", "Alice", 10, [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]),
    makePlayer("p2", "Bob", 15, [5, 6, 5, 4, 5, 4, 5, 6, 5, 5, 5, 4, 6, 5, 6, 4, 5, 5]),
  ];

  // Stroke play
  const strokeResults = calcStrokePlay(round1Players, COURSE);
  assert(strokeResults.length === 2, "T5: Stroke play works with tournament players");
  assert(strokeResults[0].total === 72, "T5: Stroke play calculates correctly");
  assert(strokeResults[1].total === 90, "T5: Stroke play second player correct");

  // Skins - use calcScopedSkins which handles groups
  const skinsGroup = [{name: "Group 1", players: round1Players}];
  const skinsResults = calcScopedSkins(skinsGroup, COURSE, false, { skinsMode: "net", skinsScope: "field" });
  assert(skinsResults[0].result.totals !== undefined, "T5: Skins calculates for tournament");
  assert(typeof skinsResults[0].result.totals["Alice"] === "number", "T5: Skins produces numeric totals");
}

// ═══════════════════════════════════════════════════════════════════
// TOURNAMENT: DAILY & CUMULATIVE WITH TIES
// ═══════════════════════════════════════════════════════════════════
section("🏆 Tournament Daily Totals & Ties");

{
  // Day 1: Alice 72, Bob 72 (tied)
  const day1Groups: ContestGroup[] = [
    {
      id: "g1",
      name: "Group 1",
      players: [
        makePlayer("p1", "Alice", 10, [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]),
        makePlayer("p2", "Bob", 15, [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]),
      ],
    },
  ];

  // Day 2: Alice 68, Bob 70
  const day2Groups: ContestGroup[] = [
    {
      id: "g2",
      name: "Group 1",
      players: [
        makePlayer("p1", "Alice", 10, [4, 4, 4, 3, 4, 3, 4, 4, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4]),
        makePlayer("p2", "Bob", 15, [4, 4, 4, 3, 4, 3, 4, 4, 4, 4, 4, 3, 4, 4, 5, 3, 5, 4]),
      ],
    },
  ];

  const rounds: RoundInfo[] = [
    { id: "r1", number: 1, name: "Day 1", date: "2026-10-26", groups: day1Groups },
    { id: "r2", number: 2, name: "Day 2", date: "2026-10-27", groups: day2Groups },
  ];

  // Day 1 tied
  const day1Totals = new Map<string, number>();
  for (const group of rounds[0].groups) {
    for (const player of group.players) {
      day1Totals.set(player.id, totalStrokes(player));
    }
  }
  assert(day1Totals.get("p1") === 72, "T6: Day 1 Alice tied at 72");
  assert(day1Totals.get("p2") === 72, "T6: Day 1 Bob tied at 72");

  // Cumulative: Alice wins
  const cumulativeTotals = new Map<string, number>();
  for (const round of rounds) {
    for (const group of round.groups) {
      for (const player of group.players) {
        const current = cumulativeTotals.get(player.id) || 0;
        cumulativeTotals.set(player.id, current + totalStrokes(player));
      }
    }
  }
  assert(cumulativeTotals.get("p1") === 140, "T6: Alice cumulative 140");
  assert(cumulativeTotals.get("p2") === 142, "T6: Bob cumulative 142");

  const sorted = Array.from(cumulativeTotals.entries()).sort((a, b) => a[1] - b[1]);
  assert(sorted[0][0] === "p1", "T6: Alice wins overall");
}

// ─── RESULTS ────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`──────────────────────────────────────────────\n`);

process.exit(failed > 0 ? 1 : 0);
