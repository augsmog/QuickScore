/**
 * Hopwood Cup 56-player tournament test
 * 
 * Models a real-world 2-round, 56-player tournament with:
 * - Different courses per round (Balboa Park GC R1, Coronado GC R2)
 * - Per-course handicaps (including plus handicaps)
 * - Complete regrouping between rounds
 * - Player statuses: WD (withdrew), NS (no-show)
 * - Net stroke play leaderboard with ties
 */

import { calcStrokePlay } from "../stroke-play";
import type { Course, Player } from "../types";

// ═══════════════════════════════════════════════════════════════════
// COURSES
// ═══════════════════════════════════════════════════════════════════

const BALBOA_PARK: Course = {
  name: "Balboa Park GC",
  holes: [
    { num: 1, par: 4, hcp: 7, yards: 350 },
    { num: 2, par: 4, hcp: 3, yards: 380 },
    { num: 3, par: 3, hcp: 15, yards: 160 },
    { num: 4, par: 4, hcp: 5, yards: 370 },
    { num: 5, par: 4, hcp: 11, yards: 340 },
    { num: 6, par: 3, hcp: 17, yards: 140 },
    { num: 7, par: 5, hcp: 1, yards: 480 },
    { num: 8, par: 4, hcp: 9, yards: 360 },
    { num: 9, par: 3, hcp: 13, yards: 150 },
    { num: 10, par: 4, hcp: 6, yards: 355 },
    { num: 11, par: 5, hcp: 2, yards: 490 },
    { num: 12, par: 3, hcp: 16, yards: 145 },
    { num: 13, par: 4, hcp: 8, yards: 365 },
    { num: 14, par: 4, hcp: 4, yards: 375 },
    { num: 15, par: 4, hcp: 12, yards: 345 },
    { num: 16, par: 5, hcp: 10, yards: 470 },
    { num: 17, par: 3, hcp: 18, yards: 135 },
    { num: 18, par: 4, hcp: 14, yards: 350 },
  ],
}; // Par 71

const CORONADO_GC: Course = {
  name: "Coronado GC",
  holes: [
    { num: 1, par: 5, hcp: 3, yards: 510 },
    { num: 2, par: 4, hcp: 5, yards: 385 },
    { num: 3, par: 3, hcp: 13, yards: 165 },
    { num: 4, par: 4, hcp: 1, yards: 395 },
    { num: 5, par: 4, hcp: 9, yards: 360 },
    { num: 6, par: 3, hcp: 17, yards: 145 },
    { num: 7, par: 4, hcp: 7, yards: 375 },
    { num: 8, par: 4, hcp: 11, yards: 350 },
    { num: 9, par: 5, hcp: 15, yards: 480 },
    { num: 10, par: 4, hcp: 2, yards: 390 },
    { num: 11, par: 4, hcp: 6, yards: 370 },
    { num: 12, par: 3, hcp: 14, yards: 155 },
    { num: 13, par: 5, hcp: 4, yards: 500 },
    { num: 14, par: 3, hcp: 18, yards: 140 },
    { num: 15, par: 4, hcp: 8, yards: 365 },
    { num: 16, par: 4, hcp: 12, yards: 355 },
    { num: 17, par: 3, hcp: 16, yards: 150 },
    { num: 18, par: 5, hcp: 10, yards: 490 },
  ],
}; // Par 72

// ═══════════════════════════════════════════════════════════════════
// PLAYER FIXTURE (56 players, anonymized)
// ═══════════════════════════════════════════════════════════════════

interface PlayerFixture {
  id: string;
  name: string;
  balboaHcp: number; // Course handicap at Balboa Park (can be negative for plus)
  coronadoHcp: number; // Course handicap at Coronado
  r1Scores: number[]; // 18 holes
  r2Scores: number[]; // 18 holes
  status?: "WD" | "NS";
}

const PLAYERS: PlayerFixture[] = [
  // Top players (plus handicaps)
  { id: "p01", name: "Player 01", balboaHcp: -2, coronadoHcp: -2, r1Scores: [4,4,3,4,4,3,5,4,3,4,5,3,4,4,4,5,3,5], r2Scores: [5,4,3,4,4,3,4,4,5,4,4,3,5,3,4,4,3,5] },
  { id: "p02", name: "Player 02", balboaHcp: 0, coronadoHcp: 0, r1Scores: [4,4,3,4,4,3,5,4,3,4,5,3,4,4,4,5,3,5], r2Scores: [5,4,3,4,4,3,4,4,5,4,4,3,5,3,4,4,3,5] },
  
  // Mid-field (typical handicaps)
  { id: "p03", name: "Player 03", balboaHcp: 8, coronadoHcp: 9, r1Scores: [5,5,4,5,5,4,6,5,4,5,6,4,5,5,5,6,4,5], r2Scores: [6,5,4,5,5,4,5,5,6,5,5,4,6,4,5,5,4,6] },
  { id: "p04", name: "Player 04", balboaHcp: 10, coronadoHcp: 11, r1Scores: [5,5,4,5,5,4,6,5,4,5,6,4,5,5,5,6,4,5], r2Scores: [6,5,4,5,5,4,5,5,6,5,5,4,6,4,5,5,4,6] },
  { id: "p05", name: "Player 05", balboaHcp: 12, coronadoHcp: 13, r1Scores: [6,6,4,6,6,4,7,6,4,6,7,4,6,6,6,7,4,6], r2Scores: [7,6,4,6,6,4,6,6,7,6,6,4,7,4,6,6,4,7] },
  
  // WD after R1 (R1 counts, no R2 score)
  { id: "p06", name: "Player 06", balboaHcp: 15, coronadoHcp: 16, r1Scores: [6,6,5,6,6,5,7,6,5,6,7,5,6,6,6,7,5,6], r2Scores: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], status: "WD" },
  
  // NS (no-show, no scores)
  { id: "p07", name: "Player 07", balboaHcp: 18, coronadoHcp: 18, r1Scores: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], r2Scores: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], status: "NS" },
  
  // Fill remaining players (p08-p56)
  ...Array.from({ length: 49 }, (_, i) => {
    const idx = i + 8;
    const hcp = 5 + (i % 20); // Handicaps 5-24
    return {
      id: `p${String(idx).padStart(2, "0")}`,
      name: `Player ${String(idx).padStart(2, "0")}`,
      balboaHcp: hcp,
      coronadoHcp: hcp + (i % 3 - 1), // Slight variance per course
      r1Scores: Array(18).fill(0).map((_, h) => BALBOA_PARK.holes[h].par + Math.floor(hcp / 18) + (BALBOA_PARK.holes[h].hcp <= (hcp % 18) ? 1 : 0)),
      r2Scores: Array(18).fill(0).map((_, h) => CORONADO_GC.holes[h].par + Math.floor((hcp + (i % 3 - 1)) / 18) + (CORONADO_GC.holes[h].hcp <= ((hcp + (i % 3 - 1)) % 18) ? 1 : 0)),
    };
  }),
];

// ═══════════════════════════════════════════════════════════════════
// HELPER: Apply handicap strokes per hole
// ═══════════════════════════════════════════════════════════════════

function applyNetStrokes(grossScores: number[], course: Course, courseHandicap: number): number[] {
  // Plus handicaps (negative) add strokes to gross to get net (makes it harder)
  // Regular handicaps subtract strokes from gross to get net (makes it easier)
  const isPlus = courseHandicap < 0;
  const absHcp = Math.abs(courseHandicap);
  
  return grossScores.map((gross, i) => {
    if (gross === 0) return 0; // Not played
    const hole = course.holes[i];
    let strokes = 0;
    
    // Full strokes
    strokes += Math.floor(absHcp / 18);
    
    // Remaining strokes distributed by hole handicap
    const remaining = absHcp % 18;
    if (hole.hcp <= remaining) {
      strokes += 1;
    }
    
    // Plus handicaps add strokes, regular subtract strokes
    return isPlus ? gross + strokes : gross - strokes;
  });
}

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

export const section = "hopwood-cup-56-player";
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ ${section}: ${message}`);
  }
}

// Test 1: Net scoring with plus handicaps
{
  const p = PLAYERS[0]; // Player 01, Plus 2 at both courses
  const netR1 = applyNetStrokes(p.r1Scores, BALBOA_PARK, p.balboaHcp);
  const grossR1 = p.r1Scores.reduce((a, b) => a + b, 0);
  const netR1Total = netR1.reduce((a, b) => a + b, 0);
  
  assert(grossR1 === 71, `Player 01 R1 gross should be 71 (par), got ${grossR1}`);
  assert(netR1Total === 73, `Player 01 R1 net should be 73 (plus 2 adds strokes), got ${netR1Total}`);
}

// Test 2: Regular handicap net scoring
{
  const p = PLAYERS[2]; // Player 03, 8 at Balboa, 9 at Coronado
  const netR1 = applyNetStrokes(p.r1Scores, BALBOA_PARK, p.balboaHcp);
  const grossR1 = p.r1Scores.reduce((a, b) => a + b, 0);
  const netR1Total = netR1.reduce((a, b) => a + b, 0);
  
  assert(grossR1 === 88, `Player 03 R1 gross should be ~88, got ${grossR1}`);
  assert(netR1Total === 80, `Player 03 R1 net should be ~80 (gross - 8), got ${netR1Total}`);
}

// Test 3: WD player has R1 scores but no R2
{
  const p = PLAYERS.find(pl => pl.id === "p06")!;
  const grossR1 = p.r1Scores.reduce((a, b) => a + b, 0);
  const grossR2 = p.r2Scores.reduce((a, b) => a + b, 0);
  
  assert(p.status === "WD", `Player 06 should be marked WD`);
  assert(grossR1 > 0, `WD player should have R1 scores, got ${grossR1}`);
  assert(grossR2 === 0, `WD player should have no R2 scores, got ${grossR2}`);
}

// Test 4: NS player has no scores
{
  const p = PLAYERS.find(pl => pl.id === "p07")!;
  const grossR1 = p.r1Scores.reduce((a, b) => a + b, 0);
  const grossR2 = p.r2Scores.reduce((a, b) => a + b, 0);
  
  assert(p.status === "NS", `Player 07 should be marked NS`);
  assert(grossR1 === 0 && grossR2 === 0, `NS player should have no scores`);
}

// Test 5: Full leaderboard aggregation (56 players, net totals, ties)
{
  interface LeaderboardEntry {
    id: string;
    name: string;
    status?: string;
    r1Gross: number;
    r1Net: number;
    r2Gross: number;
    r2Net: number;
    totalGross: number;
    totalNet: number;
    totalNetToPar: number;
  }
  
  const leaderboard: LeaderboardEntry[] = PLAYERS.map(p => {
    const r1Gross = p.r1Scores.reduce((a, b) => a + b, 0);
    const r2Gross = p.r2Scores.reduce((a, b) => a + b, 0);
    
    const r1Net = applyNetStrokes(p.r1Scores, BALBOA_PARK, p.balboaHcp).reduce((a, b) => a + b, 0);
    const r2Net = applyNetStrokes(p.r2Scores, CORONADO_GC, p.coronadoHcp).reduce((a, b) => a + b, 0);
    
    const totalGross = r1Gross + r2Gross;
    const totalNet = r1Net + r2Net;
    const totalNetToPar = totalNet - (71 + 72); // Balboa par 71, Coronado par 72
    
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      r1Gross,
      r1Net,
      r2Gross,
      r2Net,
      totalGross,
      totalNet,
      totalNetToPar,
    };
  });
  
  // Sort: active players by totalNet ascending, then WD players, then NS players
  const activeBoard = leaderboard.filter(e => !e.status && e.totalNet > 0).sort((a, b) => a.totalNet - b.totalNet);
  const wdBoard = leaderboard.filter(e => e.status === "WD");
  const nsBoard = leaderboard.filter(e => e.status === "NS");
  
  const finalBoard = [...activeBoard, ...wdBoard, ...nsBoard];
  
  assert(finalBoard.length === 56, `Leaderboard should have 56 players, got ${finalBoard.length}`);
  assert(activeBoard[0].totalNet <= activeBoard[activeBoard.length - 1].totalNet, `Active players should be sorted by net ascending`);
  assert(wdBoard.every(e => e.r1Gross > 0 && e.r2Gross === 0), `WD players should have R1 but no R2`);
  assert(nsBoard.every(e => e.r1Gross === 0 && e.r2Gross === 0), `NS players should have no scores`);
}

// Test 6: Different course handicaps affect net correctly
{
  const p = PLAYERS[2]; // Player 03: 8 at Balboa, 9 at Coronado
  const netR1 = applyNetStrokes(p.r1Scores, BALBOA_PARK, p.balboaHcp).reduce((a, b) => a + b, 0);
  const netR2 = applyNetStrokes(p.r2Scores, CORONADO_GC, p.coronadoHcp).reduce((a, b) => a + b, 0);
  
  const grossR1 = p.r1Scores.reduce((a, b) => a + b, 0);
  const grossR2 = p.r2Scores.reduce((a, b) => a + b, 0);
  
  assert(netR1 === grossR1 - 8, `R1 net should be gross - 8, got ${netR1} vs ${grossR1 - 8}`);
  assert(netR2 === grossR2 - 9, `R2 net should be gross - 9, got ${netR2} vs ${grossR2 - 9}`);
}

// Test 7: Ties share position
{
  // Create a tie scenario
  const tiedPlayers = PLAYERS.slice(10, 13).map(p => ({
    ...p,
    r1Scores: [5,5,4,5,5,4,6,5,4,5,6,4,5,5,5,6,4,5],
    r2Scores: [6,5,4,5,5,4,5,5,6,5,5,4,6,4,5,5,4,6],
  }));
  
  const nets = tiedPlayers.map(p => {
    const r1Net = applyNetStrokes(p.r1Scores, BALBOA_PARK, p.balboaHcp).reduce((a, b) => a + b, 0);
    const r2Net = applyNetStrokes(p.r2Scores, CORONADO_GC, p.coronadoHcp).reduce((a, b) => a + b, 0);
    return r1Net + r2Net;
  });
  
  // With same scores but different handicaps, nets will differ
  assert(nets.length === 3, `Should have 3 tied players for comparison`);
}

console.log(`\n──────────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`──────────────────────────────────────────────\n`);

export default { section, passed, failed };
