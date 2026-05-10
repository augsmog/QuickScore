/**
 * Comprehensive Scorecard Tests
 * Run with: npx tsx src/engine/__tests__/comprehensive-scorecard-tests.ts
 *
 * Standalone test runner — no Jest, uses console.log assertions.
 */

import { calcStrokePlay } from "../calculators/stroke-play";
import { calcMatchPlay } from "../calculators/match-play";
import { calcStableford } from "../calculators/stableford";
import { calcModStableford } from "../calculators/mod-stableford";
import { calcSkins } from "../calculators/skins";
import { calcNassau } from "../calculators/nassau";
import { calcNassauPress } from "../calculators/nassau-press";
import { calcWolf } from "../calculators/wolf";
import { calcBanker } from "../calculators/banker";
import { calcHammer } from "../calculators/hammer";
import { calcSnake } from "../calculators/snake";
import { calcBingoBangoBongo } from "../calculators/bingo-bango-bongo";
import { calcDots } from "../calculators/dots";
import { calcRabbit } from "../calculators/rabbit";
import { calcDefender } from "../calculators/defender";
import { calcNines } from "../calculators/nines";
import { calcVegas } from "../calculators/vegas";
import { calcSixes } from "../calculators/sixes";
import { calcCloseout } from "../calculators/closeout";
import { calcQuota } from "../calculators/quota";
import { calcChicago } from "../calculators/chicago";
import { calcGreenies } from "../calculators/greenies";
import { calcAcesDeuces } from "../calculators/aces-deuces";
import { calcBestBall } from "../calculators/best-ball";
import { calcScramble } from "../calculators/scramble";
import { calcShamble } from "../calculators/shamble";
import { calcAlternateShot } from "../calculators/alternate-shot";
import { calcChapman } from "../calculators/chapman";
import { calcFourBall } from "../calculators/fourball";
import { calculateSettlement } from "../settlement";
import { Player, Course, GameType } from "../types";

// ═══════════════════════════════════════════════════════════════════
// TEST INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${testName}${details ? ` — ${details}` : ""}`);
  }
}

function assertClose(actual: number, expected: number, tolerance: number, testName: string) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${testName} — expected ~${expected}, got ${actual} (diff=${diff})`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TEST COURSE — Realistic par-72 layout
// ═══════════════════════════════════════════════════════════════════

const testCourse: Course = {
  name: "Pinehurst Test CC",
  holes: [
    { num: 1, par: 4, hcp: 7, yards: 410 },
    { num: 2, par: 4, hcp: 11, yards: 385 },
    { num: 3, par: 3, hcp: 15, yards: 175 },
    { num: 4, par: 5, hcp: 1, yards: 530 },
    { num: 5, par: 4, hcp: 3, yards: 440 },
    { num: 6, par: 3, hcp: 17, yards: 155 },
    { num: 7, par: 4, hcp: 9, yards: 395 },
    { num: 8, par: 5, hcp: 5, yards: 510 },
    { num: 9, par: 4, hcp: 13, yards: 370 },
    { num: 10, par: 4, hcp: 8, yards: 420 },
    { num: 11, par: 3, hcp: 16, yards: 165 },
    { num: 12, par: 5, hcp: 2, yards: 545 },
    { num: 13, par: 4, hcp: 6, yards: 430 },
    { num: 14, par: 4, hcp: 10, yards: 380 },
    { num: 15, par: 4, hcp: 4, yards: 445 },
    { num: 16, par: 3, hcp: 18, yards: 145 },
    { num: 17, par: 4, hcp: 12, yards: 400 },
    { num: 18, par: 5, hcp: 14, yards: 520 },
  ],
};

const coursePar = testCourse.holes.reduce((s, h) => s + h.par, 0); // 72

// ═══════════════════════════════════════════════════════════════════
// PLAYER PROFILES (43 players with varying handicaps)
// ═══════════════════════════════════════════════════════════════════

function makePlayer(id: string, name: string, handicap: number, scores: number[], team?: string): Player {
  return { id, name, handicap, scores, team: team || null };
}

// Plus handicap players (scratch or better)
const scratch = makePlayer("p1", "Tiger", 0, [4, 4, 3, 4, 4, 3, 4, 5, 4, 4, 3, 4, 4, 4, 4, 3, 4, 5]); // 70, -2
const plusTwo = makePlayer("p2", "Rory", -2, [3, 4, 3, 4, 4, 3, 4, 4, 4, 4, 3, 4, 3, 4, 4, 3, 4, 4]); // 66, -6
const plusThree = makePlayer("p3", "Scottie", -3, [4, 3, 3, 4, 4, 2, 4, 5, 3, 4, 3, 4, 4, 3, 4, 3, 4, 4]); // 65, -7

// Low single-digit handicaps
const hdcp2 = makePlayer("p4", "Brooks", 2, [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5]); // 72
const hdcp5 = makePlayer("p5", "Jordan", 5, [4, 5, 3, 5, 5, 3, 4, 5, 4, 5, 3, 5, 4, 4, 5, 3, 4, 5]); // 76
const hdcp7 = makePlayer("p6", "Collin", 7, [5, 4, 4, 5, 5, 3, 5, 5, 4, 5, 3, 5, 5, 4, 5, 3, 5, 5]); // 80
const hdcp8 = makePlayer("p7", "Viktor", 8, [5, 5, 3, 5, 5, 4, 4, 6, 4, 5, 4, 5, 5, 4, 5, 3, 5, 5]); // 82

// Mid handicaps
const hdcp10 = makePlayer("p8", "Matt", 10, [5, 5, 4, 5, 5, 4, 5, 5, 5, 5, 4, 6, 5, 5, 5, 3, 5, 5]); // 86
const hdcp12 = makePlayer("p9", "Xander", 12, [5, 5, 4, 6, 5, 4, 5, 6, 5, 5, 4, 6, 5, 5, 5, 4, 5, 6]); // 90
const hdcp14 = makePlayer("p10", "Tommy", 14, [5, 5, 4, 6, 6, 4, 5, 6, 5, 6, 4, 6, 5, 5, 6, 4, 5, 6]); // 93
const hdcp15 = makePlayer("p11", "Max", 15, [6, 5, 4, 6, 6, 4, 5, 6, 5, 6, 4, 6, 6, 5, 6, 4, 5, 6]); // 95
const hdcp18 = makePlayer("p12", "Patrick", 18, [6, 5, 5, 6, 6, 4, 6, 6, 5, 6, 5, 6, 6, 6, 6, 4, 5, 7]); // 100

// High handicaps
const hdcp20 = makePlayer("p13", "Sam", 20, [6, 6, 5, 7, 6, 5, 6, 6, 6, 6, 5, 7, 6, 6, 6, 5, 6, 6]); // 106
const hdcp22 = makePlayer("p14", "Rickie", 22, [6, 6, 5, 7, 6, 5, 6, 7, 6, 7, 5, 7, 6, 6, 7, 5, 6, 7]); // 110
const hdcp25 = makePlayer("p15", "Phil", 25, [7, 6, 5, 7, 7, 5, 6, 7, 6, 7, 5, 7, 7, 6, 7, 5, 7, 7]); // 114
const hdcp28 = makePlayer("p16", "Bubba", 28, [7, 7, 6, 7, 7, 5, 7, 7, 6, 7, 6, 8, 7, 7, 7, 5, 7, 7]); // 120
const hdcp30 = makePlayer("p17", "John", 30, [7, 7, 6, 8, 7, 6, 7, 7, 7, 7, 6, 8, 7, 7, 7, 6, 7, 7]); // 124
const hdcp32 = makePlayer("p18", "Ernie", 32, [8, 7, 6, 8, 7, 6, 7, 8, 7, 8, 6, 8, 7, 7, 8, 6, 7, 8]); // 131

// Additional players for large groups
const hdcp35 = makePlayer("p19", "Kevin", 35, [8, 7, 7, 8, 8, 6, 8, 8, 7, 8, 6, 8, 8, 7, 8, 6, 8, 8]); // 136
const hdcp40 = makePlayer("p20", "Mike", 40, [8, 8, 7, 9, 8, 7, 8, 8, 8, 8, 7, 9, 8, 8, 8, 7, 8, 9]); // 143
const hdcp45 = makePlayer("p21", "Dave", 45, [9, 8, 8, 9, 9, 7, 9, 9, 8, 9, 7, 9, 9, 8, 9, 7, 9, 9]); // 152
const hdcp50 = makePlayer("p22", "Bill", 50, [9, 9, 8, 10, 9, 8, 9, 10, 9, 9, 8, 10, 9, 9, 9, 8, 9, 10]); // 162

// More specific-use profiles
const bogeyGolfer = makePlayer("p23", "BogeyBob", 18, [5, 5, 4, 6, 5, 4, 5, 6, 5, 5, 4, 6, 5, 5, 5, 4, 5, 6]); // 90
const streaky = makePlayer("p24", "StreakySteve", 10, [3, 7, 3, 7, 3, 7, 3, 7, 3, 3, 7, 3, 7, 3, 7, 3, 7, 3]); // 86 (wild swings)
const steadyEddie = makePlayer("p25", "SteadyEddie", 10, [5, 5, 4, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5]); // 86 (all bogeys/pars)
const backNine = makePlayer("p26", "BackNineBen", 12, [6, 6, 5, 7, 6, 5, 6, 7, 6, 4, 3, 5, 4, 4, 4, 3, 4, 4]); // front60+back35=95... rough calc
const frontNine = makePlayer("p27", "FrontNineFred", 12, [4, 4, 3, 5, 4, 3, 4, 5, 4, 6, 5, 7, 6, 6, 6, 5, 6, 6]); // front36+back53=89

// Team-assigned players
const teamAp1 = makePlayer("t1", "Alice", 8, [5, 4, 3, 5, 5, 3, 5, 5, 4, 5, 3, 5, 5, 4, 5, 3, 5, 5], "TeamA");
const teamAp2 = makePlayer("t2", "Adam", 10, [5, 5, 4, 5, 5, 4, 5, 6, 5, 5, 4, 6, 5, 5, 5, 4, 5, 5], "TeamA");
const teamBp1 = makePlayer("t3", "Beth", 9, [5, 5, 4, 5, 5, 4, 4, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 6], "TeamB");
const teamBp2 = makePlayer("t4", "Brad", 12, [5, 5, 4, 6, 5, 4, 5, 6, 5, 6, 4, 6, 5, 5, 6, 4, 5, 6], "TeamB");

// 4-player group for Nines/Wolf/Vegas/Sixes
const fourA = makePlayer("f1", "Alpha", 5, [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 5]); // 73
const fourB = makePlayer("f2", "Bravo", 8, [5, 4, 4, 5, 5, 3, 5, 5, 4, 5, 4, 5, 5, 4, 5, 3, 5, 5]); // 80
const fourC = makePlayer("f3", "Charlie", 12, [5, 5, 4, 6, 5, 4, 5, 6, 5, 5, 4, 6, 5, 5, 5, 4, 5, 6]); // 90
const fourD = makePlayer("f4", "Delta", 15, [6, 5, 5, 6, 6, 4, 6, 6, 5, 6, 5, 6, 6, 5, 6, 4, 6, 6]); // 99

// All-same scores (edge case for ties)
const tiedA = makePlayer("e1", "Tied1", 10, [5, 5, 4, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5]); // 86
const tiedB = makePlayer("e2", "Tied2", 10, [5, 5, 4, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5]); // 86
const tiedC = makePlayer("e3", "Tied3", 10, [5, 5, 4, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5]); // 86
const tiedD = makePlayer("e4", "Tied4", 10, [5, 5, 4, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5]); // 86

// Plus handicap players for quota/chicago edge cases
const plusHandicapA = makePlayer("ph1", "PlusAlpha", -2, [4, 3, 3, 4, 4, 3, 4, 4, 4, 3, 3, 4, 4, 3, 4, 3, 4, 4]); // 65
const plusHandicapB = makePlayer("ph2", "PlusBeta", -3, [3, 4, 3, 4, 4, 2, 4, 4, 4, 4, 3, 4, 4, 3, 4, 3, 4, 4]); // 65

// Additional filler for 43+ total
const filler1 = makePlayer("x1", "Extra1", 16, [6, 5, 5, 6, 6, 4, 6, 6, 5, 6, 5, 6, 6, 5, 6, 5, 6, 6]); // 100
const filler2 = makePlayer("x2", "Extra2", 19, [6, 6, 5, 7, 6, 5, 6, 7, 6, 6, 5, 7, 6, 6, 6, 5, 6, 7]); // 108
const filler3 = makePlayer("x3", "Extra3", 21, [7, 6, 5, 7, 7, 5, 7, 7, 6, 7, 5, 7, 7, 6, 7, 5, 7, 7]); // 114

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  COMPREHENSIVE SCORECARD TESTS");
console.log("══════════════════════════════════════════════════════════════\n");

// ─── STROKE PLAY ─────────────────────────────────────────────────
console.log("─── STROKE PLAY ───");

{
  const results = calcStrokePlay([scratch, hdcp5, hdcp10, hdcp15], testCourse);
  assert(results[0].name === "Tiger", "Stroke play: lowest total wins");
  assert(results[0].total === 70, "Stroke play: Tiger shoots 70");
  assert(results[0].toPar === -2, "Stroke play: Tiger is -2");
  assert(results.length === 4, "Stroke play: all 4 players scored");
}

{
  const results = calcStrokePlay([plusTwo, plusThree], testCourse);
  assert(results[0].name === "Scottie", "Stroke play: plus handicap player lowest score wins");
  assert(results[0].toPar < 0, "Stroke play: plus-3 handicap shoots under par");
}

{
  const results = calcStrokePlay([tiedA, tiedB], testCourse);
  assert(results[0].total === results[1].total, "Stroke play: tie produces equal totals");
}

{
  // Team stroke play via best ball
  const results = calcBestBall(
    [
      { name: "TeamA", players: [teamAp1, teamAp2] },
      { name: "TeamB", players: [teamBp1, teamBp2] },
    ],
    testCourse
  );
  assert(results.length === 2, "Best ball team stroke: 2 teams scored");
  assert(results[0].total <= results[1].total, "Best ball team stroke: sorted by total");
}

// ─── MATCH PLAY ──────────────────────────────────────────────────
console.log("\n─── MATCH PLAY ───");

{
  const result = calcMatchPlay(scratch, hdcp10, testCourse);
  assert(result.finalStatus > 0, "Match play: better player wins");
  assert(result.p1 === "Tiger", "Match play: p1 name correct");
  assert(result.results.length === 18, "Match play: 18 hole results");
}

{
  const result = calcMatchPlay(tiedA, tiedB, testCourse);
  assert(result.finalStatus === 0, "Match play: identical scores = all square");
}

{
  const result = calcMatchPlay(plusTwo, plusThree, testCourse);
  assert(typeof result.finalStatus === "number", "Match play: plus handicap players produce valid result");
}

{
  // Match play hole-by-hole status tracking
  const result = calcMatchPlay(scratch, hdcp5, testCourse);
  let statusCorrect = true;
  for (let i = 0; i < 18; i++) {
    const expected = result.results.slice(0, i + 1).reduce((acc, r) => {
      if (r.p1Score < r.p2Score) return acc + 1;
      if (r.p2Score < r.p1Score) return acc - 1;
      return acc;
    }, 0);
    if (result.results[i].status !== expected) statusCorrect = false;
  }
  assert(statusCorrect, "Match play: running status accumulates correctly");
}

// ─── SKINS ───────────────────────────────────────────────────────
console.log("\n─── SKINS ───");

{
  const result = calcSkins([scratch, hdcp5, hdcp10], testCourse, false);
  assert(result.skins.length === 18, "Skins (no carry): 18 hole results");
  const totalAwarded = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assert(result.remaining === 0, "Skins (no carry): nothing remaining");
  const holesWon = result.skins.filter(s => s.winner !== "Push").length;
  assert(totalAwarded === holesWon, "Skins (no carry): total skins = holes won outright");
}

{
  const result = calcSkins([scratch, hdcp5, hdcp10], testCourse, true);
  assert(result.skins.length === 18, "Skins (carryover): 18 hole results");
  const totalAwarded = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assert(totalAwarded + result.remaining === 18, "Skins (carryover): awarded + remaining = 18");
}

{
  // All tied scores — no skins awarded
  const result = calcSkins([tiedA, tiedB, tiedC], testCourse, false);
  const totalAwarded = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assert(totalAwarded === 0, "Skins: all-tied scores = zero skins awarded");
}

{
  // Carryover with all ties — all 18 remain
  const result = calcSkins([tiedA, tiedB, tiedC], testCourse, true);
  assert(result.remaining === 18, "Skins (carryover): all-tied = 18 remaining");
}

// ─── NASSAU ──────────────────────────────────────────────────────
console.log("\n─── NASSAU ───");

{
  const result = calcNassau(scratch, hdcp10);
  assert(result.p1 === "Tiger", "Nassau: p1 name correct");
  assert(result.front > 0, "Nassau: better player wins front");
  assert(result.back > 0, "Nassau: better player wins back");
  assert(result.overall === result.front + result.back, "Nassau: overall = front + back");
}

{
  const result = calcNassau(tiedA, tiedB);
  assert(result.front === 0, "Nassau: tied scores = 0 front");
  assert(result.back === 0, "Nassau: tied scores = 0 back");
  assert(result.overall === 0, "Nassau: tied scores = 0 overall");
}

// ─── NASSAU PRESS ────────────────────────────────────────────────
console.log("\n─── NASSAU PRESS ───");

{
  const result = calcNassauPress(scratch, hdcp15);
  assert(result.totalBets >= 3, "Nassau press: at least 3 bets (front/back/overall)");
  assert(result.presses.length >= 0, "Nassau press: presses array exists");
  if (Math.abs(result.front) >= 2 || Math.abs(result.back) >= 2) {
    assert(result.presses.length > 0, "Nassau press: dominant player triggers press");
  }
}

{
  const result = calcNassauPress(scratch, hdcp10);
  const pressesValid = result.presses.every(p => p.startHole >= 1 && p.endHole <= 18);
  assert(pressesValid, "Nassau press: all press holes within valid range");
}

// ─── WOLF ────────────────────────────────────────────────────────
console.log("\n─── WOLF ───");

{
  const result = calcWolf([fourA, fourB, fourC, fourD], testCourse);
  assert(result.holeResults.length === 18, "Wolf: 18 hole results");
  const totalPoints = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assertClose(totalPoints, 0, 0.01, "Wolf: totals sum to zero (zero-sum)");
}

{
  const result = calcWolf([fourA, fourB, fourC], testCourse);
  assert(result.holeResults.length === 0, "Wolf: <4 players returns empty results");
}

{
  const result = calcWolf([fourA, fourB, fourC, fourD], testCourse);
  assert(result.totals["Alpha"] >= result.totals["Delta"], "Wolf: better player tends to win more");
}

// ─── VEGAS ───────────────────────────────────────────────────────
console.log("\n─── VEGAS ───");

{
  const result = calcVegas([teamAp1, teamAp2], [teamBp1, teamBp2], testCourse);
  assert(result.holes.length === 18, "Vegas: 18 hole results");
  const validNums = result.holes.every(h => h.t1 >= 10 && h.t2 >= 10);
  assert(validNums, "Vegas: all team numbers are 2-digit (>=10)");
}

{
  const result = calcVegas([teamAp1, teamAp2], [teamBp1, teamBp2], testCourse);
  const properOrder = result.holes.every(h => {
    const t1d1 = Math.floor(h.t1 / 10);
    const t1d2 = h.t1 % 10;
    const t2d1 = Math.floor(h.t2 / 10);
    const t2d2 = h.t2 % 10;
    return t1d1 <= t1d2 && t2d1 <= t2d2;
  });
  assert(properOrder, "Vegas: scores ordered low-high in team numbers");
}

{
  const sameA: Player = { ...tiedA, team: "T1" };
  const sameB: Player = { ...tiedB, team: "T1" };
  const sameC: Player = { ...tiedC, team: "T2" };
  const sameD: Player = { ...tiedD, team: "T2" };
  const result = calcVegas([sameA, sameB], [sameC, sameD], testCourse);
  const allZero = result.holes.every(h => h.diff === 0);
  assert(allZero, "Vegas: identical scores produce 0 diff on every hole");
}

// ─── NINES / DOTS ────────────────────────────────────────────────
console.log("\n─── NINES / DOTS ───");

{
  const result = calcNines([fourA, fourB, fourC, fourD], testCourse);
  const totalPts = Object.values(result.points).reduce((a, b) => a + b, 0);
  assertClose(totalPts, 162, 0.01, "Nines: total points = 162 (9 per hole × 18)");
  assert(result.holeResults.length === 18, "Nines: 18 hole results");
}

{
  const result = calcNines([tiedA, tiedB, tiedC, tiedD], testCourse);
  const totalPts = Object.values(result.points).reduce((a, b) => a + b, 0);
  assertClose(totalPts, 162, 0.01, "Nines (all tied): total still = 162");
  assertClose(result.points["Tied1"], 40.5, 0.01, "Nines (all tied): each player gets 40.5 (2.25/hole)");
  assertClose(result.points["Tied2"], 40.5, 0.01, "Nines (all tied): Tied2 gets 40.5");
  assertClose(result.points["Tied3"], 40.5, 0.01, "Nines (all tied): Tied3 gets 40.5");
  assertClose(result.points["Tied4"], 40.5, 0.01, "Nines (all tied): Tied4 gets 40.5");
}

{
  const result = calcDots([scratch, hdcp5, hdcp10], testCourse);
  assert(result.totals["Tiger"] > result.totals["Matt"], "Dots: better player has more dots");
  for (const name of ["Tiger", "Jordan", "Matt"]) {
    const bd = result.breakdown[name];
    const expected = bd.birdies * 2 + bd.pars * 1 + bd.bogeys * 0 + bd.doubles * -1;
    assert(result.totals[name] === expected, `Dots: ${name} breakdown matches total`);
  }
}

// ─── STABLEFORD ──────────────────────────────────────────────────
console.log("\n─── STABLEFORD ───");

{
  const results = calcStableford([scratch, hdcp5, hdcp10, hdcp15], testCourse);
  assert(results[0].points >= results[1].points, "Stableford: sorted by points descending");
  assert(results[0].holePoints.length === 18, "Stableford: 18 hole points");
  const tigerResult = results.find(r => r.name === "Tiger")!;
  assert(tigerResult.points >= 36, "Stableford: Tiger (70) gets ≥36 points");
}

{
  const results = calcModStableford([scratch, hdcp5, hdcp10], testCourse);
  assert(results[0].points >= results[1].points, "Mod Stableford: sorted descending");
  const modResults = calcModStableford([scratch, streaky], testCourse);
  const streakyResult = modResults.find(r => r.name === "StreakySteve")!;
  assert(streakyResult.holePoints.some(p => p > 0), "Mod Stableford: streaky player has positive holes");
  assert(streakyResult.holePoints.some(p => p < 0), "Mod Stableford: streaky player has negative holes");
}

{
  const results = calcStableford([plusTwo, plusThree, scratch], testCourse);
  assert(results[0].points > 36, "Stableford: plus handicap player scores well above 36");
}

// ─── QUOTA / CHICAGO ─────────────────────────────────────────────
console.log("\n─── QUOTA / CHICAGO ───");

{
  const results = calcQuota([hdcp10, hdcp15, hdcp20], testCourse);
  const matt = results.find(r => r.name === "Matt")!;
  assert(matt.quota === 26, "Quota: Matt (hdcp 10) has quota of 26");
  const max = results.find(r => r.name === "Max")!;
  assert(max.quota === 21, "Quota: Max (hdcp 15) has quota of 21");
}

{
  const results = calcQuota([plusHandicapA, hdcp10], testCourse);
  const plusResult = results.find(r => r.name === "PlusAlpha")!;
  assert(plusResult.quota === 38, "Quota: +2 handicap has quota of 38 (36 - (-2))");
}

{
  const results = calcChicago([hdcp10, hdcp15, plusHandicapA], testCourse);
  const plusResult = results.find(r => r.name === "PlusAlpha")!;
  assert(plusResult.quota === 38, "Chicago: +2 handicap quota = 38");
  assert(plusResult.netScore === plusResult.grossPoints - 38, "Chicago: net = gross - quota");
}

{
  const results = calcChicago([scratch, hdcp10, hdcp20], testCourse);
  assert(results[0].netScore >= results[1].netScore, "Chicago: sorted by netScore descending");
}

// ─── RABBIT ──────────────────────────────────────────────────────
console.log("\n─── RABBIT ───");

{
  const result = calcRabbit([scratch, hdcp5, hdcp10, hdcp15], testCourse);
  const totalNet = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assert(totalNet === 0, "Rabbit: totals sum to zero");
  assert(typeof result.front9Holder === "string", "Rabbit: front9Holder is a string");
  assert(typeof result.back9Holder === "string", "Rabbit: back9Holder is a string");
}

{
  const result = calcRabbit([tiedA, tiedB, tiedC], testCourse);
  assert(result.front9Holder === "", "Rabbit (all tied): no front holder");
  assert(result.back9Holder === "", "Rabbit (all tied): no back holder");
}

{
  const result = calcRabbit([scratch, hdcp15], testCourse);
  if (result.front9Holder === "Tiger") {
    assert(result.totals["Tiger"] > 0, "Rabbit: holder has positive total");
    assert(result.totals["Max"] < 0, "Rabbit: non-holder has negative total");
  }
}

// ─── BINGO BANGO BONGO ───────────────────────────────────────────
console.log("\n─── BINGO BANGO BONGO ───");

{
  const result = calcBingoBangoBongo([scratch, hdcp5, hdcp10], testCourse);
  const totalPts = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assert(totalPts === 54, "BBB: total points = 54 (3 per hole × 18)");
  assert(result.holeResults.length === 18, "BBB: 18 hole results");
}

{
  const result = calcBingoBangoBongo([fourA, fourB, fourC, fourD], testCourse);
  const allAssigned = result.holeResults.every(h => h.bingo && h.bango && h.bongo);
  assert(allAssigned, "BBB: every hole has all 3 points assigned");
}

// ─── SNAKE ───────────────────────────────────────────────────────
console.log("\n─── SNAKE ───");

{
  const result = calcSnake([scratch, hdcp5, hdcp10, hdcp15], testCourse);
  const totalNet = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assert(totalNet === 0, "Snake: totals sum to zero");
  if (result.snakeHolder) {
    assert(typeof result.snakeHolder === "string", "Snake: snake holder is a string");
  }
}

{
  const result = calcSnake([scratch, scratch], testCourse);
  const tigerThreePutts = result.events.filter(e => e.playerName === "Tiger");
  assert(tigerThreePutts.length === 0, "Snake: scratch player has no detected 3-putts");
}

// ─── BANKER ──────────────────────────────────────────────────────
console.log("\n─── BANKER ───");

{
  const result = calcBanker([scratch, hdcp5, hdcp10], testCourse);
  assert(result.holeResults.length === 18, "Banker: 18 hole results");
  const totalNet = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assertClose(totalNet, 0, 0.01, "Banker: totals sum to zero");
  assert(result.holeResults[0].bankerName === "Tiger", "Banker: hole 1 banker is first player");
  assert(result.holeResults[1].bankerName === "Jordan", "Banker: hole 2 banker is second player");
  assert(result.holeResults[2].bankerName === "Matt", "Banker: hole 3 banker is third player");
}

// ─── HAMMER ──────────────────────────────────────────────────────
console.log("\n─── HAMMER ───");

{
  const result = calcHammer(scratch, hdcp15, testCourse);
  assert(result.holeResults.length === 18, "Hammer: 18 hole results");
  const totalNet = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assert(totalNet === 0, "Hammer: totals sum to zero");
  assert(result.totals["Tiger"] > 0, "Hammer: better player has positive total");
}

{
  const result = calcHammer(tiedA, tiedB, testCourse);
  const pushes = result.holeResults.filter(h => h.winnerName === "Push");
  assert(pushes.length === 18, "Hammer (all tied): all 18 holes are pushes");
}

// ─── CLOSEOUT ────────────────────────────────────────────────────
console.log("\n─── CLOSEOUT ───");

{
  const result = calcCloseout(scratch, hdcp15, testCourse);
  assert(result.matches.length >= 1, "Closeout: at least 1 match");
  const totalNet = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assert(totalNet > 0, "Closeout: at least one match was won");
}

{
  const result = calcCloseout(tiedA, tiedB, testCourse);
  assert(result.matches.length === 0, "Closeout (all tied): no matches closed out");
}

// ─── SIXES / ROUND ROBIN ─────────────────────────────────────────
console.log("\n─── SIXES / ROUND ROBIN ───");

{
  const result = calcSixes([fourA, fourB, fourC, fourD], testCourse);
  assert(result.rounds.length === 3, "Sixes: 3 rounds (6-hole segments)");
  const totalNet = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assert(totalNet === 0, "Sixes: totals sum to zero");
}

{
  const result = calcSixes([tiedA, tiedB, tiedC, tiedD], testCourse);
  const totalNet = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assert(totalNet === 0, "Sixes (all tied): totals = 0");
  const allTied = result.rounds.every(r => r.winner === "tie");
  assert(allTied, "Sixes (all tied): all rounds are ties");
}

// ─── GREENIES ────────────────────────────────────────────────────
console.log("\n─── GREENIES ───");

{
  const result = calcGreenies([scratch, hdcp5, hdcp10], testCourse);
  const par3Count = testCourse.holes.filter(h => h.par === 3).length;
  assert(result.greenies.length === par3Count, `Greenies: ${par3Count} par-3 holes checked`);
  const allNonNeg = Object.values(result.totals).every(v => v >= 0);
  assert(allNonNeg, "Greenies: all totals non-negative");
}

// ─── ACES & DEUCES ───────────────────────────────────────────────
console.log("\n─── ACES & DEUCES ───");

{
  const result = calcAcesDeuces([scratch, hdcp10, hdcp20], testCourse);
  const totalNet = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assert(totalNet === 0, "Aces & Deuces: totals sum to zero");
  assert(result.aces.some(a => a.playerName === "Tiger"), "Aces & Deuces: Tiger has aces (birdies)");
  const tigerDeuces = result.deuces.filter(d => d.playerName === "Tiger");
  assert(tigerDeuces.length === 0, "Aces & Deuces: Tiger has no deuces");
}

// ─── TEAM FORMATS ────────────────────────────────────────────────
console.log("\n─── TEAM FORMATS ───");

{
  const results = calcBestBall(
    [
      { name: "TeamA", players: [teamAp1, teamAp2] },
      { name: "TeamB", players: [teamBp1, teamBp2] },
    ],
    testCourse
  );
  assert(results[0].total <= results[1].total, "Best Ball: winner has lower total");
  const t1IndividualMin = Math.min(
    teamAp1.scores.reduce((a, b) => a + b, 0),
    teamAp2.scores.reduce((a, b) => a + b, 0)
  );
  assert(results.find(r => r.name === "TeamA")!.total <= t1IndividualMin,
    "Best Ball: team score ≤ best individual");
}

{
  const teamScoreA = [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5]; // 72
  const teamScoreB = [4, 4, 3, 5, 5, 3, 4, 5, 4, 5, 4, 5, 5, 4, 5, 3, 5, 5]; // 78
  const results = calcScramble(
    [
      { name: "Eagles", score: teamScoreA },
      { name: "Hawks", score: teamScoreB },
    ],
    testCourse
  );
  assert(results[0].name === "Eagles", "Scramble: lower score team wins");
  assert(results[0].total === 72, "Scramble: Eagles shoot 72");
}

{
  const results = calcShamble(
    [
      { name: "TeamA", players: [teamAp1, teamAp2] },
      { name: "TeamB", players: [teamBp1, teamBp2] },
    ],
    testCourse
  );
  assert(results.length === 2, "Shamble: 2 team results");
  assert(results[0].total <= results[1].total, "Shamble: sorted by total");
}

{
  const result = calcFourBall([teamAp1, teamAp2], [teamBp1, teamBp2], testCourse);
  assert(result.holeResults.length === 18, "Four-Ball: 18 hole results");
  assert(typeof result.finalStatus === "number", "Four-Ball: finalStatus is number");
}

{
  const results = calcAlternateShot(
    [
      { name: "Pair1", score: [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5] },
      { name: "Pair2", score: [5, 5, 4, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5, 5, 5, 4, 5, 5] },
    ],
    testCourse
  );
  assert(results[0].name === "Pair1", "Alternate Shot: lower score wins");
}

{
  const results = calcChapman(
    [
      { name: "PairX", score: [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5] },
      { name: "PairY", score: [5, 4, 4, 5, 5, 4, 5, 6, 5, 5, 4, 6, 5, 5, 5, 4, 5, 6] },
    ],
    testCourse
  );
  assert(results[0].name === "PairX", "Chapman: lower score wins");
}

// ─── DEFENDER ────────────────────────────────────────────────────
console.log("\n─── DEFENDER ───");

{
  const result = calcDefender([scratch, hdcp5, hdcp10], testCourse);
  assert(result.holeResults.length === 18, "Defender: 18 hole results");
  const totalNet = Object.values(result.totals).reduce((a, b) => a + b, 0);
  assertClose(totalNet, 0, 0.01, "Defender: totals sum to zero");
  assert(result.holeResults[0].defenderName === "Tiger", "Defender: hole 1 defender is player 1");
  assert(result.holeResults[1].defenderName === "Jordan", "Defender: hole 2 defender is player 2");
}

// ─── SETTLEMENT ACCURACY ─────────────────────────────────────────
console.log("\n─── SETTLEMENT ACCURACY ───");

{
  const settlement = calculateSettlement([scratch, hdcp5, hdcp10, hdcp15], testCourse, ["stroke_play"], 5);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (stroke play): net amounts sum to zero");
  assert(settlement.transactions.length > 0, "Settlement (stroke play): transactions generated");
}

{
  const settlement = calculateSettlement([scratch, hdcp10], testCourse, ["match_play"], 10);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (match play): net amounts sum to zero");
}

{
  const settlement = calculateSettlement([scratch, hdcp5, hdcp10], testCourse, ["skins"], 5);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (skins): net amounts sum to zero");
}

{
  const settlement = calculateSettlement([scratch, hdcp10], testCourse, ["nassau"], 5);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (nassau): net amounts sum to zero");
}

{
  const settlement = calculateSettlement([fourA, fourB, fourC, fourD], testCourse, ["nines"], 1);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (nines): net amounts sum to zero");
}

{
  const vegasPlayers: Player[] = [
    { ...teamAp1, team: "V1" },
    { ...teamAp2, team: "V1" },
    { ...teamBp1, team: "V2" },
    { ...teamBp2, team: "V2" },
  ];
  const settlement = calculateSettlement(vegasPlayers, testCourse, ["vegas"], 1);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (vegas): net amounts sum to zero");
}

{
  const settlement = calculateSettlement(
    [scratch, hdcp5, hdcp10, hdcp15],
    testCourse,
    ["stroke_play", "skins", "stableford"],
    5
  );
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (multi-game): net amounts sum to zero");
}

{
  const settlement = calculateSettlement([scratch, hdcp10, hdcp20], testCourse, ["aces_deuces"], 2);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (aces_deuces): net amounts sum to zero");
}

{
  const settlement = calculateSettlement([scratch, hdcp5, hdcp10], testCourse, ["dots"], 1);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (dots): net amounts sum to zero");
}

{
  const settlement = calculateSettlement([scratch, hdcp5, hdcp10, hdcp15], testCourse, ["rabbit"], 5);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (rabbit): net amounts sum to zero");
}

{
  const bbPlayers: Player[] = [
    { ...teamAp1, team: "BB1" },
    { ...teamAp2, team: "BB1" },
    { ...teamBp1, team: "BB2" },
    { ...teamBp2, team: "BB2" },
  ];
  const settlement = calculateSettlement(bbPlayers, testCourse, ["best_ball"], 10);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (best_ball): net amounts sum to zero");
}

{
  const settlement = calculateSettlement([tiedA, tiedB], testCourse, ["match_play"], 10);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assert(netSum === 0, "Settlement (tied match play): no money changes hands");
  assert(settlement.transactions.length === 0, "Settlement (tied match): 0 transactions");
}

{
  const settlement = calculateSettlement([scratch, hdcp15], testCourse, ["closeout"], 5);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (closeout): net amounts sum to zero");
}

{
  const settlement = calculateSettlement([fourA, fourB, fourC, fourD], testCourse, ["wolf"], 2);
  const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
  assertClose(netSum, 0, 0.01, "Settlement (wolf): net amounts sum to zero");
}

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log("══════════════════════════════════════════════════════════════\n");

if (failed > 0) {
  process.exit(1);
}
