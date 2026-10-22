/**
 * Per-Hole Progressive Calculator Test Suite
 * Verifies that ALL calculators produce correct intermediate results when
 * scores are entered progressively hole-by-hole, not just at the end of a round.
 *
 * Run with: npx tsx src/engine/__tests__/per-hole-progressive.test.ts
 */

import { Course, Player } from "../types";
import { calcStrokePlay } from "../calculators/stroke-play";
import { calcMatchPlay } from "../calculators/match-play";
import { calcStableford } from "../calculators/stableford";
import { calcSkins } from "../calculators/skins";
import { calcNassau } from "../calculators/nassau";
import { calcNassauPress } from "../calculators/nassau-press";
import { calcQuota } from "../calculators/quota";
import { calcBanker } from "../calculators/banker";
import { calcWolf } from "../calculators/wolf";
import { calcNines } from "../calculators/nines";
import { calcDots } from "../calculators/dots";

// ─── TEST HELPERS ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

function partialScores(fullScores: number[], throughHole: number): number[] {
  return fullScores.map((s, i) => (i < throughHole ? s : 0));
}

function playerThrough(base: Player, hole: number): Player {
  return { ...base, scores: partialScores(base.scores, hole) };
}

// ─── TEST COURSE ────────────────────────────────────────────────────

// Par layout matching user specification
const PAR = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]; // 72

const COURSE: Course = {
  name: "Progressive Test Course",
  holes: PAR.map((par, i) => ({
    num: i + 1,
    par,
    hcp: i + 1,
    yards: 400,
  })),
};

// ─── SHARED PLAYER DATA ─────────────────────────────────────────────

// Two players for Nassau / Match Play / Press tests
const P1_SCORES = [4, 4, 5, 3, 4, 3, 4, 5, 4, 5, 4, 3, 5, 5, 5, 3, 4, 4]; // 74
const P2_SCORES = [5, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 4, 4, 5, 3, 5, 5]; // 74

const P1_FULL: Player = {
  id: "p1",
  name: "Player1",
  handicap: 10,
  team: null,
  scores: P1_SCORES,
};

const P2_FULL: Player = {
  id: "p2",
  name: "Player2",
  handicap: 12,
  team: null,
  scores: P2_SCORES,
};

// Three players for Skins tests
const S1_SCORES = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]; // par on all holes
const S2_SCORES = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]; // identical to S1
const S3_SCORES = [3, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 5]; // wins hole 1, loses hole 18

const SKIN_P1: Player = { id: "s1", name: "Skin1", handicap: 5, team: null, scores: S1_SCORES };
const SKIN_P2: Player = { id: "s2", name: "Skin2", handicap: 5, team: null, scores: S2_SCORES };
const SKIN_P3: Player = { id: "s3", name: "Skin3", handicap: 5, team: null, scores: S3_SCORES };

// Four players for Nines / Banker / Wolf
const FOUR_P1: Player = { id: "f1", name: "Alpha", handicap: 8, team: null, scores: [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4] };
const FOUR_P2: Player = { id: "f2", name: "Bravo", handicap: 10, team: null, scores: [5, 4, 4, 3, 4, 3, 4, 5, 4, 4, 5, 3, 5, 4, 5, 3, 4, 4] };
const FOUR_P3: Player = { id: "f3", name: "Charlie", handicap: 12, team: null, scores: [4, 5, 5, 3, 4, 3, 4, 5, 4, 4, 4, 4, 5, 4, 5, 3, 4, 4] };
const FOUR_P4: Player = { id: "f4", name: "Delta", handicap: 14, team: null, scores: [4, 5, 4, 4, 4, 3, 4, 5, 4, 4, 4, 3, 5, 5, 5, 3, 4, 4] };

// ═══════════════════════════════════════════════════════════════════
// TEST SECTIONS
// ═══════════════════════════════════════════════════════════════════

// ─── 1. STROKE PLAY PROGRESSIVE ────────────────────────────────────
section("1. Stroke Play Progressive");
{
  // After 1 hole
  const r1 = calcStrokePlay([playerThrough(P1_FULL, 1)], COURSE);
  assert(r1[0].front === 4, "SP after 1: front=4", `got ${r1[0].front}`);
  assert(r1[0].back === 0, "SP after 1: back=0", `got ${r1[0].back}`);
  assert(r1[0].total === 4, "SP after 1: total=4", `got ${r1[0].total}`);

  // After 5 holes: sum of P1 holes 1-5 = 4+4+5+3+4 = 20
  const r5 = calcStrokePlay([playerThrough(P1_FULL, 5)], COURSE);
  assert(r5[0].front === 20, "SP after 5: front=20", `got ${r5[0].front}`);
  assert(r5[0].back === 0, "SP after 5: back=0", `got ${r5[0].back}`);
  assert(r5[0].total === 20, "SP after 5: total=20", `got ${r5[0].total}`);

  // After 9 holes: front complete = 4+4+5+3+4+3+4+5+4 = 36
  const r9 = calcStrokePlay([playerThrough(P1_FULL, 9)], COURSE);
  assert(r9[0].front === 36, "SP after 9: front=36", `got ${r9[0].front}`);
  assert(r9[0].back === 0, "SP after 9: back=0", `got ${r9[0].back}`);
  assert(r9[0].total === 36, "SP after 9: total=36", `got ${r9[0].total}`);

  // After 14 holes: front=36, back=5+4+3+5+5 = 22
  const r14 = calcStrokePlay([playerThrough(P1_FULL, 14)], COURSE);
  assert(r14[0].front === 36, "SP after 14: front=36", `got ${r14[0].front}`);
  assert(r14[0].back === 22, "SP after 14: back=22", `got ${r14[0].back}`);
  assert(r14[0].total === 58, "SP after 14: total=58", `got ${r14[0].total}`);

  // After 18 holes: front=36, back=5+4+3+5+5+5+3+4+4 = 38, total=74
  const r18 = calcStrokePlay([P1_FULL], COURSE);
  assert(r18[0].front === 36, "SP after 18: front=36", `got ${r18[0].front}`);
  assert(r18[0].back === 38, "SP after 18: back=38", `got ${r18[0].back}`);
  assert(r18[0].total === 74, "SP after 18: total=74", `got ${r18[0].total}`);
}

// ─── 2. NASSAU FRONT/BACK/OVERALL PROGRESSIVE ─────────────────────
section("2. Nassau Front/Back/Overall Progressive");
{
  // Work through hole-by-hole:
  // H1: P1=4<P2=5 -> P1 wins -> front=+1
  // H2: P1=4<P2=5 -> P1 wins -> front=+2
  // H3: P1=5>P2=4 -> P2 wins -> front=+1
  // H4-H9: all ties -> front stays +1
  // H10: P1=5>P2=4 -> P2 wins -> back=-1
  // H11: tie -> back=-1
  // H12: tie -> back=-1
  // H13: P1=5>P2=4 -> P2 wins -> back=-2
  // H14: P1=5>P2=4 -> P2 wins -> back=-3
  // H15: tie -> back=-3
  // H16: tie -> back=-3
  // H17: P1=4<P2=5 -> P1 wins -> back=-2
  // H18: P1=4<P2=5 -> P1 wins -> back=-1
  // Overall: +1 + (-1) = 0

  const expectedFront = [1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const expectedBack  = [0, 0, 0, 0, 0, 0, 0, 0, 0,-1,-1,-1,-2,-3,-3,-3,-2,-1];

  for (let h = 1; h <= 18; h++) {
    const r = calcNassau(playerThrough(P1_FULL, h), playerThrough(P2_FULL, h));
    assert(
      r.front === expectedFront[h - 1],
      `Nassau after ${h}: front=${expectedFront[h - 1]}`,
      `got ${r.front}`
    );
    assert(
      r.back === expectedBack[h - 1],
      `Nassau after ${h}: back=${expectedBack[h - 1]}`,
      `got ${r.back}`
    );
    assert(
      r.overall === expectedFront[h - 1] + expectedBack[h - 1],
      `Nassau after ${h}: overall=${expectedFront[h - 1] + expectedBack[h - 1]}`,
      `got ${r.overall}`
    );
  }
}

// ─── 3. NASSAU PRESS TRIGGER DETECTION ─────────────────────────────
section("3. Nassau Press Trigger Detection");
{
  // Front 9 press:
  // After H1: front=+1, no press yet
  const r1 = calcNassauPress(playerThrough(P1_FULL, 1), playerThrough(P2_FULL, 1));
  assert(r1.front === 1, "Press after H1: front=1", `got ${r1.front}`);
  assert(r1.presses.length === 0, "Press after H1: no presses", `got ${r1.presses.length}`);

  // After H2: front=+2, press triggers on front (starting hole 3)
  // With partial scores through H2, remaining holes are 0 vs 0 = ties
  // frontPressActive from i=1, pressStatus accumulates from H2 onward
  // H2 itself: P1=4<P2=5 -> pressStatus=+1, then H3-H9 all 0v0 ties -> pressStatus=+1
  const r2 = calcNassauPress(playerThrough(P1_FULL, 2), playerThrough(P2_FULL, 2));
  assert(r2.front === 2, "Press after H2: front=2", `got ${r2.front}`);
  assert(r2.presses.length === 1, "Press after H2: 1 press triggered", `got ${r2.presses.length}`);
  if (r2.presses.length > 0) {
    assert(r2.presses[0].startHole === 3, "Press after H2: press starts at hole 3", `got ${r2.presses[0].startHole}`);
    assert(r2.presses[0].winner === "Player1", "Press after H2: P1 winning press", `got ${r2.presses[0].winner}`);
  }

  // After H3: press still active, P2 won H3 so press status changes
  // frontPressStatus: H2=+1, H3: P1=5>P2=4 -> -1 -> net=0, then H4-H9 ties -> 0
  // pressStatus=0 means press is NOT added (code: if frontPressStatus !== 0)
  const r3 = calcNassauPress(playerThrough(P1_FULL, 3), playerThrough(P2_FULL, 3));
  assert(r3.front === 1, "Press after H3: front=1", `got ${r3.front}`);
  // Press is active but status is 0, so it won't appear in results
  assert(r3.presses.length === 0, "Press after H3: press tied (not in results)", `got ${r3.presses.length}`);

  // Full front 9: front=+1, press was active but ended tied
  const r9 = calcNassauPress(playerThrough(P1_FULL, 9), playerThrough(P2_FULL, 9));
  assert(r9.front === 1, "Press after H9: front=1", `got ${r9.front}`);
  assert(r9.back === 0, "Press after H9: back=0", `got ${r9.back}`);

  // Back 9 press detection:
  // H10: P2 wins -> back=-1
  // H11-12: ties -> back=-1
  // H13: P2 wins -> back=-2 -> press triggers (backPressStart=13)
  // Then with full data through 18:
  // H13: P2 wins in press -> pressStatus=-1
  // H14: P2 wins -> pressStatus=-2
  // H15-16: ties -> pressStatus=-2
  // H17: P1 wins -> pressStatus=-1
  // H18: P1 wins -> pressStatus=0
  // pressStatus=0 -> not added to presses
  const r18 = calcNassauPress(P1_FULL, P2_FULL);
  assert(r18.front === 1, "Press full: front=1", `got ${r18.front}`);
  assert(r18.back === -1, "Press full: back=-1", `got ${r18.back}`);
  assert(r18.overall === 0, "Press full: overall=0", `got ${r18.overall}`);

  // Verify back press with partial data through H14 (back=-3, press should be active with P2 winning)
  const r14 = calcNassauPress(playerThrough(P1_FULL, 14), playerThrough(P2_FULL, 14));
  assert(r14.back === -3, "Press after H14: back=-3", `got ${r14.back}`);
  // backPressStart=13 (i=12, so start=13), H13: pressStatus=-1, H14: pressStatus=-2
  // Then H15-H18 are 0v0 ties -> pressStatus stays -2
  assert(r14.presses.length === 1, "Press after H14: 1 back press", `got ${r14.presses.length}`);
  if (r14.presses.length > 0) {
    assert(r14.presses[0].winner === "Player2", "Press after H14: P2 winning back press", `got ${r14.presses[0].winner}`);
  }
}

// ─── 4. SKINS CARRYOVER PROGRESSIVE ───────────────────────────────
section("4. Skins Carryover Progressive");
{
  // S1 and S2 have identical scores; S3 differs on holes 1 (3 vs 4) and 18 (5 vs 4)
  // With carryover:
  // H1: S3=3 is the outright low (S1=4, S2=4, S3=3) -> S3 wins 1 skin, pot=0
  // H2-H17: all three have identical scores -> carry every hole
  // H18: S1=4, S2=4, S3=5 -> S1 and S2 tie at 4, no outright winner -> carry

  // After H1: S3 won outright, 1 skin. Remaining carryover = 0.
  const r1 = calcSkins(
    [playerThrough(SKIN_P1, 1), playerThrough(SKIN_P2, 1), playerThrough(SKIN_P3, 1)],
    COURSE,
    true
  );
  assert(r1.skins[0].winner === "Skin3", "Skins carry H1: Skin3 wins", `got ${r1.skins[0].winner}`);
  assert(r1.skins[0].value === 1, "Skins carry H1: value=1", `got ${r1.skins[0].value}`);
  assert(r1.totals["Skin3"] === 1, "Skins carry H1: Skin3 total=1", `got ${r1.totals["Skin3"]}`);

  // After H2: H1 won by S3 (pot resets).
  // H2: S1=5, S2=5, S3=5 -> all tied -> carry. remaining=1
  const r2 = calcSkins(
    [playerThrough(SKIN_P1, 2), playerThrough(SKIN_P2, 2), playerThrough(SKIN_P3, 2)],
    COURSE,
    true
  );
  assert(r2.skins[0].winner === "Skin3", "Skins carry H1-2: H1 Skin3 wins", `got ${r2.skins[0].winner}`);
  assert(r2.skins[1].winner === "Carry", "Skins carry H1-2: H2 carry", `got ${r2.skins[1].winner}`);
  // H3-H18 are unplayed and do not add to the pot.
  assert(r2.remaining === 1, "Skins carry after H2: remaining=1", `got ${r2.remaining}`);

  // After H4: H1 won by S3 (pot=0), H2 carry (pot=1), H3 carry (pot=2), H4 carry (pot=3)
  // All scores identical on H2-H4 -> 3 carries in a row
  // H5-H18 are unplayed and do not add to the pot. Remaining = 3.
  const r4 = calcSkins(
    [playerThrough(SKIN_P1, 4), playerThrough(SKIN_P2, 4), playerThrough(SKIN_P3, 4)],
    COURSE,
    true
  );
  assert(r4.skins[0].winner === "Skin3", "Skins carry H1-4: H1 won by Skin3", `got ${r4.skins[0].winner}`);
  assert(r4.skins[1].winner === "Carry", "Skins carry H1-4: H2 carry", `got ${r4.skins[1].winner}`);
  assert(r4.skins[2].winner === "Carry", "Skins carry H1-4: H3 carry", `got ${r4.skins[2].winner}`);
  assert(r4.skins[3].winner === "Carry", "Skins carry H1-4: H4 carry", `got ${r4.skins[3].winner}`);

  assert(r4.remaining === 3, "Skins carry after H4: remaining=3", `got ${r4.remaining}`);

  // Full round: H1 won by S3 (1 skin). H2-H17 all tied (carry). H18: S1=4,S2=4,S3=5 -> S1&S2 tie -> carry.
  // Remaining = 17
  const rFull = calcSkins([SKIN_P1, SKIN_P2, SKIN_P3], COURSE, true);
  assert(rFull.totals["Skin3"] === 1, "Skins carry full: Skin3=1", `got ${rFull.totals["Skin3"]}`);
  assert(rFull.totals["Skin1"] === 0, "Skins carry full: Skin1=0", `got ${rFull.totals["Skin1"]}`);
  assert(rFull.remaining === 17, "Skins carry full: remaining=17", `got ${rFull.remaining}`);
}

// ─── 5. STABLEFORD PROGRESSIVE ────────────────────────────────────
section("5. Stableford Progressive");
{
  // Design a player with known per-hole results vs par:
  // Par:   [4, 5, 4, 3, 4, 3, 4, 5, 4, ...]
  // Score: [2, 4, 4, 3, 5, 5, 4, 5, 4, ...] (eagle, birdie, par, par, bogey, dbl, par, par, par)
  // Points: 4, 3, 2, 2, 1, 0, 2, 2, 2 = 18 for front 9
  const stablefordScores = [2, 4, 4, 3, 5, 5, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];
  // Back 9 all par relative to course par -> all 2 pts each = 18
  const stbPlayer: Player = {
    id: "stb1",
    name: "StbPlayer",
    handicap: 0,
    team: null,
    scores: stablefordScores,
  };

  const expectedPts = [4, 3, 2, 2, 1, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];

  // Verify cumulative points after each hole
  // Unplayed holes contribute no points.
  for (let h = 1; h <= 18; h++) {
    const r = calcStableford([playerThrough(stbPlayer, h)], COURSE);
    // Verify each played hole has the correct points
    for (let k = 0; k < h; k++) {
      assert(
        r[0].holePoints[k] === expectedPts[k],
        `Stableford H${k + 1} (through ${h}): ${expectedPts[k]}pts`,
        `got ${r[0].holePoints[k]}`
      );
    }
  }

  // Verify full round totals
  const rFull = calcStableford([stbPlayer], COURSE);
  const totalExpected = expectedPts.reduce((a, b) => a + b, 0); // 32
  assert(rFull[0].points === totalExpected, `Stableford full total=${totalExpected}`, `got ${rFull[0].points}`);
}

// ─── 6. MATCH PLAY PROGRESSIVE STATUS ──────────────────────────────
section("6. Match Play Progressive Status");
{
  // Hole-by-hole status for P1 vs P2:
  // H1: P1=4<P2=5 -> +1
  // H2: P1=4<P2=5 -> +2
  // H3: P1=5>P2=4 -> +1
  // H4: tie -> +1
  // H5: tie -> +1
  // H6: tie -> +1
  // H7: tie -> +1
  // H8: tie -> +1
  // H9: tie -> +1
  // H10: P1=5>P2=4 -> 0
  // H11: tie -> 0
  // H12: tie -> 0
  // H13: P1=5>P2=4 -> -1
  // H14: P1=5>P2=4 -> -2
  // H15: tie -> -2
  // H16: tie -> -2
  // H17: P1=4<P2=5 -> -1
  // H18: P1=4<P2=5 -> 0
  const expectedStatus = [1, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, -1, -2, -2, -2, -1, 0];

  for (let h = 1; h <= 18; h++) {
    const r = calcMatchPlay(
      playerThrough(P1_FULL, h),
      playerThrough(P2_FULL, h),
      COURSE
    );
    // Status after hole h is at index h-1 in results
    // But with partial scores, holes after h are 0 vs 0 = ties, so status stays the same
    // We check status at the last played hole (index h-1)
    assert(
      r.results[h - 1].status === expectedStatus[h - 1],
      `Match Play after H${h}: status=${expectedStatus[h - 1]}`,
      `got ${r.results[h - 1].status}`
    );
  }

  // Final status should be 0 (all square)
  const rFull = calcMatchPlay(P1_FULL, P2_FULL, COURSE);
  assert(rFull.finalStatus === 0, "Match Play final: all square (0)", `got ${rFull.finalStatus}`);
}

// ─── 7. QUOTA PROGRESSIVE ──────────────────────────────────────────
section("7. Quota Progressive");
{
  // Player with handicap 10: quota = 36 - 10 = 26
  // Use P1 scores vs PAR. Points per played hole:
  // H1: 4 vs par 4 = par = 2pts
  // H2: 4 vs par 5 = birdie = 3pts
  // H3: 5 vs par 4 = bogey = 1pt
  // H4: 3 vs par 3 = par = 2pts
  // H5: 4 vs par 4 = par = 2pts
  // H6: 3 vs par 3 = par = 2pts
  // H7: 4 vs par 4 = par = 2pts
  // H8: 5 vs par 5 = par = 2pts
  // H9: 4 vs par 4 = par = 2pts
  // (Back 9)
  // H10: 5 vs par 4 = bogey = 1pt
  // H11: 4 vs par 4 = par = 2pts
  // H12: 3 vs par 3 = par = 2pts
  // H13: 5 vs par 5 = par = 2pts
  // H14: 5 vs par 4 = bogey = 1pt
  // H15: 5 vs par 5 = par = 2pts
  // H16: 3 vs par 3 = par = 2pts
  // H17: 4 vs par 4 = par = 2pts
  // H18: 4 vs par 4 = par = 2pts
  const p1Pts = [2, 3, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2]; // sum = 34

  const quota = 36 - Math.round(P1_FULL.handicap); // 26

  // Only played holes contribute toward the unchanged quota.
  for (const h of [1, 5, 9, 14, 18]) {
    const r = calcQuota([playerThrough(P1_FULL, h)], COURSE);
    const playedPts = p1Pts.slice(0, h).reduce((a, b) => a + b, 0);
    const expectedPoints = playedPts;
    const expectedOverUnder = expectedPoints - quota;

    assert(r[0].quota === quota, `Quota after H${h}: quota=26`, `got ${r[0].quota}`);
    assert(r[0].points === expectedPoints, `Quota after H${h}: points=${expectedPoints}`, `got ${r[0].points}`);
    assert(r[0].overUnder === expectedOverUnder, `Quota after H${h}: overUnder=${expectedOverUnder}`, `got ${r[0].overUnder}`);
  }
}

// ─── 8. SKINS NO-CARRY PROGRESSIVE ────────────────────────────────
section("8. Skins No-Carry Progressive");
{
  // Without carryover, ties are "Push"
  // H1: S3=3 wins outright (S1=4, S2=4) -> S3 wins
  // H2-H17: all tied -> Push
  // H18: S1=4, S2=4, S3=5 -> S1 and S2 tie -> Push (no outright winner)

  // After H1: S3 won
  const r1 = calcSkins(
    [playerThrough(SKIN_P1, 1), playerThrough(SKIN_P2, 1), playerThrough(SKIN_P3, 1)],
    COURSE,
    false
  );
  assert(r1.skins[0].winner === "Skin3", "Skins no-carry H1: Skin3 wins", `got ${r1.skins[0].winner}`);
  assert(r1.totals["Skin3"] === 1, "Skins no-carry H1: total=1", `got ${r1.totals["Skin3"]}`);
  assert(r1.totals["Skin1"] === 0, "Skins no-carry H1: Skin1=0", `got ${r1.totals["Skin1"]}`);

  // After H5: H1 won by S3, H2-H4 Push (0,0,0 ties), H5 Push
  // But H2 through H5 with partial: H2 all 5s (tie), H3-H5 have real scores (all identical) -> Push
  const r5 = calcSkins(
    [playerThrough(SKIN_P1, 5), playerThrough(SKIN_P2, 5), playerThrough(SKIN_P3, 5)],
    COURSE,
    false
  );
  assert(r5.totals["Skin3"] === 1, "Skins no-carry H5: Skin3 still=1", `got ${r5.totals["Skin3"]}`);
  assert(r5.totals["Skin1"] === 0, "Skins no-carry H5: Skin1=0", `got ${r5.totals["Skin1"]}`);
  assert(r5.totals["Skin2"] === 0, "Skins no-carry H5: Skin2=0", `got ${r5.totals["Skin2"]}`);
  // Verify push count: H2-H5 are pushes (4 pushes)
  let pushCount = 0;
  for (let i = 1; i < 5; i++) {
    if (r5.skins[i].winner === "Push") pushCount++;
  }
  assert(pushCount === 4, "Skins no-carry H5: 4 pushes on H2-H5", `got ${pushCount}`);

  // Full round
  const rFull = calcSkins([SKIN_P1, SKIN_P2, SKIN_P3], COURSE, false);
  assert(rFull.totals["Skin3"] === 1, "Skins no-carry full: Skin3=1", `got ${rFull.totals["Skin3"]}`);
  assert(rFull.remaining === 0, "Skins no-carry full: remaining=0", `got ${rFull.remaining}`);
  // Count pushes: H2-H17 are ties (pushes), H18 is also a push (S1=S2=4, S3=5, min is 4, two winners -> push)
  let fullPushCount = 0;
  for (const s of rFull.skins) {
    if (s.winner === "Push") fullPushCount++;
  }
  assert(fullPushCount === 17, "Skins no-carry full: 17 pushes", `got ${fullPushCount}`);
}

// ─── 9. BANKER PER-HOLE ROTATION ──────────────────────────────────
section("9. Banker Per-Hole Rotation");
{
  const fourPlayers = [FOUR_P1, FOUR_P2, FOUR_P3, FOUR_P4];

  // Verify banker rotation and zero-sum after each number of holes
  for (const h of [1, 4, 9, 18]) {
    const players = fourPlayers.map((p) => playerThrough(p, h));
    const r = calcBanker(players, COURSE);

    // Banker rotates: hole 1 = P1 (idx 0), hole 2 = P2 (idx 1), etc.
    for (let i = 0; i < h; i++) {
      assert(
        r.holeResults[i].bankerName === fourPlayers[i % 4].name,
        `Banker H${i + 1}: banker=${fourPlayers[i % 4].name}`,
        `got ${r.holeResults[i].bankerName}`
      );
    }

    // Totals should be zero-sum
    const totalSum = Object.values(r.totals).reduce((a, b) => a + b, 0);
    assert(
      Math.abs(totalSum) < 0.001,
      `Banker after H${h}: zero-sum`,
      `got sum=${totalSum}`
    );
  }

  // Full round: verify all 18 hole results exist
  const rFull = calcBanker(fourPlayers, COURSE);
  assert(rFull.holeResults.length === 18, "Banker full: 18 hole results", `got ${rFull.holeResults.length}`);
}

// ─── 10. WOLF PER-HOLE ─────────────────────────────────────────────
section("10. Wolf Per-Hole");
{
  const fourPlayers = [FOUR_P1, FOUR_P2, FOUR_P3, FOUR_P4];

  // Full round: verify all 18 holes processed
  const rFull = calcWolf(fourPlayers, COURSE);
  assert(rFull.holeResults.length === 18, "Wolf full: 18 hole results", `got ${rFull.holeResults.length}`);

  // Totals should be zero-sum
  const totalSum = Object.values(rFull.totals).reduce((a, b) => a + b, 0);
  assert(
    Math.abs(totalSum) < 0.001,
    "Wolf full: totals zero-sum",
    `got sum=${totalSum}`
  );

  // Verify wolf rotates correctly
  assert(rFull.holeResults[0].wolfName === "Alpha", "Wolf H1: Alpha is wolf", `got ${rFull.holeResults[0].wolfName}`);
  assert(rFull.holeResults[1].wolfName === "Bravo", "Wolf H2: Bravo is wolf", `got ${rFull.holeResults[1].wolfName}`);
  assert(rFull.holeResults[2].wolfName === "Charlie", "Wolf H3: Charlie is wolf", `got ${rFull.holeResults[2].wolfName}`);
  assert(rFull.holeResults[3].wolfName === "Delta", "Wolf H4: Delta is wolf", `got ${rFull.holeResults[3].wolfName}`);
  assert(rFull.holeResults[4].wolfName === "Alpha", "Wolf H5: Alpha again", `got ${rFull.holeResults[4].wolfName}`);

  // Progressive: verify zero-sum holds at intermediate points
  for (const h of [4, 8, 12]) {
    const players = fourPlayers.map((p) => playerThrough(p, h));
    const r = calcWolf(players, COURSE);
    const sum = Object.values(r.totals).reduce((a, b) => a + b, 0);
    assert(Math.abs(sum) < 0.001, `Wolf after H${h}: zero-sum`, `got sum=${sum}`);
  }
}

// ─── 11. NINES PER-HOLE DISTRIBUTION ──────────────────────────────
section("11. Nines Per-Hole Distribution");
{
  const fourPlayers = [FOUR_P1, FOUR_P2, FOUR_P3, FOUR_P4];

  // After each hole, 9 points should be distributed (or split)
  // Running total = 9 * holes_played
  for (const h of [1, 3, 6, 9, 12, 18]) {
    const players = fourPlayers.map((p) => playerThrough(p, h));
    const r = calcNines(players, COURSE);

    // Check that 9 points were distributed on each played hole
    for (let i = 0; i < h; i++) {
      const holeTotal = Object.values(r.holeResults[i].allocation).reduce((a, b) => a + b, 0);
      assert(
        Math.abs(holeTotal - 9) < 0.01,
        `Nines H${i + 1} (through ${h}): 9pts distributed`,
        `got ${holeTotal}`
      );
    }

    // Running total across all players = 9 * holes_played
    // (unplayed holes with 0 scores: all four players have 0, so all tied -> each gets 2.25 -> 9 total)
    const runningTotal = Object.values(r.points).reduce((a, b) => a + b, 0);
    assert(
      Math.abs(runningTotal - 9 * 18) < 0.01,
      `Nines after H${h}: total points=${9 * 18}`,
      `got ${runningTotal}`
    );
  }

  // Verify specific distribution on H1:
  // Scores: Alpha=4, Bravo=5, Charlie=4, Delta=4 -> Alpha/Charlie/Delta tie at 4, Bravo=5
  // Three tied at rank 0: share (5+3+1)/3 = 3, Bravo at rank 3: gets 0
  const r1 = calcNines(
    fourPlayers.map((p) => playerThrough(p, 1)),
    COURSE
  );
  assert(
    Math.abs(r1.holeResults[0].allocation["Alpha"] - 3) < 0.01,
    "Nines H1: Alpha=3",
    `got ${r1.holeResults[0].allocation["Alpha"]}`
  );
  assert(
    Math.abs(r1.holeResults[0].allocation["Bravo"] - 0) < 0.01,
    "Nines H1: Bravo=0",
    `got ${r1.holeResults[0].allocation["Bravo"]}`
  );
}

// ─── 12. DOTS PROGRESSIVE ──────────────────────────────────────────
section("12. Dots Progressive");
{
  // Design a player with clear results:
  // Par:   [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]
  // Score: [3, 4, 4, 3, 5, 5, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]
  //         B  B  P  P  Bo D  P  P  P  P  P  P  P  P  P  P  P  P
  // Dots:  +2 +2 +1 +1  0 -1 +1 +1 +1 +1 +1 +1 +1 +1 +1 +1 +1 +1 = 17
  const dotsScores = [3, 4, 4, 3, 5, 5, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];
  const dotsPlayer: Player = {
    id: "dots1",
    name: "DotsGuy",
    handicap: 0,
    team: null,
    scores: dotsScores,
  };

  // We need at least 2 players for dots
  const dotsPlayer2: Player = {
    id: "dots2",
    name: "DotsGal",
    handicap: 0,
    team: null,
    scores: PAR.slice(), // plays exactly par on every hole
  };

  const expectedDots = [2, 2, 1, 1, 0, -1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

  // Check progressive dot accumulation
  // Unplayed holes contribute no dots.
  for (const h of [1, 4, 6, 9, 18]) {
    const r = calcDots(
      [playerThrough(dotsPlayer, h), playerThrough(dotsPlayer2, h)],
      COURSE
    );
    // Total for played holes only
    const playedDots = expectedDots.slice(0, h).reduce((a, b) => a + b, 0);
    assert(
      r.totals["DotsGuy"] === playedDots,
      `Dots after H${h}: total=${playedDots}`,
      `got ${r.totals["DotsGuy"]}`
    );
  }

  // Full round verification
  const rFull = calcDots([dotsPlayer, dotsPlayer2], COURSE);
  assert(rFull.totals["DotsGuy"] === 17, "Dots full: DotsGuy=17", `got ${rFull.totals["DotsGuy"]}`);
  assert(rFull.breakdown["DotsGuy"].birdies === 2, "Dots full: 2 birdies", `got ${rFull.breakdown["DotsGuy"].birdies}`);
  assert(rFull.breakdown["DotsGuy"].pars === 14, "Dots full: 14 pars", `got ${rFull.breakdown["DotsGuy"].pars}`);
  assert(rFull.breakdown["DotsGuy"].bogeys === 1, "Dots full: 1 bogey", `got ${rFull.breakdown["DotsGuy"].bogeys}`);
  assert(rFull.breakdown["DotsGuy"].doubles === 1, "Dots full: 1 double", `got ${rFull.breakdown["DotsGuy"].doubles}`);

  // DotsGal played par on every hole -> 18 pars -> 18 dots
  assert(rFull.totals["DotsGal"] === 18, "Dots full: DotsGal=18", `got ${rFull.totals["DotsGal"]}`);
}

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════
section("SUMMARY");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);

if (failed > 0) {
  console.log(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll tests passed.");
}
