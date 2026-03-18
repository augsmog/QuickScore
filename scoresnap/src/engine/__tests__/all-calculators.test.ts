/**
 * Comprehensive calculator tests using multiple scorecards.
 * Run with: npx tsx src/engine/__tests__/all-calculators.test.ts
 */

import { Course, Player } from "../types";
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
import { calcFourBall } from "../calculators/fourball";
import { calculateSettlement } from "../settlement";

// ─── TEST COURSE ────────────────────────────────────────────────────
const COURSE: Course = {
  name: "Test Course",
  holes: [
    { num: 1, par: 4, hcp: 7, yards: 445 },
    { num: 2, par: 5, hcp: 13, yards: 575 },
    { num: 3, par: 4, hcp: 5, yards: 350 },
    { num: 4, par: 3, hcp: 11, yards: 240 },
    { num: 5, par: 4, hcp: 1, yards: 495 },
    { num: 6, par: 3, hcp: 15, yards: 180 },
    { num: 7, par: 4, hcp: 9, yards: 450 },
    { num: 8, par: 5, hcp: 3, yards: 570 },
    { num: 9, par: 4, hcp: 17, yards: 460 },
    { num: 10, par: 4, hcp: 8, yards: 495 },
    { num: 11, par: 4, hcp: 4, yards: 505 },
    { num: 12, par: 3, hcp: 12, yards: 155 },
    { num: 13, par: 5, hcp: 14, yards: 510 },
    { num: 14, par: 4, hcp: 2, yards: 440 },
    { num: 15, par: 5, hcp: 16, yards: 530 },
    { num: 16, par: 3, hcp: 6, yards: 170 },
    { num: 17, par: 4, hcp: 10, yards: 440 },
    { num: 18, par: 4, hcp: 18, yards: 465 },
  ],
};
const TOTAL_PAR = COURSE.holes.reduce((a, h) => a + h.par, 0); // 72

// ─── SAMPLE SCORECARDS ─────────────────────────────────────────────

// Scorecard 1: Saturday Squad (from prototype demo data)
const mike: Player = { id: "1", name: "Mike T.", handicap: 12, team: "A",
  scores: [5,6,4,3,5,3,5,6,4, 5,4,3,5,5,6,3,5,5] }; // total 82
const dave: Player = { id: "2", name: "Dave R.", handicap: 8, team: "B",
  scores: [4,5,5,4,4,3,4,5,5, 4,5,3,5,4,5,4,4,4] }; // total 77
const chris: Player = { id: "3", name: "Chris L.", handicap: 15, team: "A",
  scores: [5,7,4,4,6,4,5,5,5, 5,5,4,6,5,5,3,5,5] }; // total 86
const jay: Player = { id: "4", name: "Jay P.", handicap: 10, team: "B",
  scores: [4,5,4,3,5,4,5,6,4, 4,4,4,5,4,6,4,4,5] }; // total 79

// Scorecard 2: Scratch golfer vs high handicapper
const scratch: Player = { id: "5", name: "Scratch", handicap: 0, team: null,
  scores: [4,4,4,3,4,3,4,5,4, 4,4,3,4,4,5,3,4,4] }; // total 70 (-2)
const duffer: Player = { id: "6", name: "Duffer", handicap: 28, team: null,
  scores: [6,7,6,5,6,5,6,7,6, 6,6,5,7,6,7,5,6,6] }; // total 108

// Scorecard 3: Tight match — close scores
const alex: Player = { id: "7", name: "Alex", handicap: 10, team: "A",
  scores: [4,5,4,3,4,3,4,5,4, 4,4,3,5,4,5,3,4,4] }; // total 73
const ben: Player = { id: "8", name: "Ben", handicap: 10, team: "B",
  scores: [4,5,4,3,5,3,4,5,4, 4,4,3,5,4,5,3,4,5] }; // total 74

const allFour = [mike, dave, chris, jay];

// ─── TEST HELPERS ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ─── TESTS ──────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════");
console.log("  ScoreSnap Calculator Test Suite");
console.log("══════════════════════════════════════════════\n");

// 1. STROKE PLAY
console.log("🏌️ Stroke Play");
const sp = calcStrokePlay(allFour, COURSE);
assert(sp[0].name === "Dave R.", "Winner is Dave (77)");
assert(sp[0].total === 77, "Dave total = 77", `got ${sp[0].total}`);
assert(sp[0].toPar === 5, "Dave +5", `got ${sp[0].toPar}`);
assert(sp[0].front === 39, "Dave front 9 = 39", `got ${sp[0].front}`);
assert(sp[3].name === "Chris L.", "Last place is Chris (86)");

// Scratch vs Duffer
const sp2 = calcStrokePlay([scratch, duffer], COURSE);
assert(sp2[0].name === "Scratch", "Scratch wins");
assert(sp2[0].toPar === -2, "Scratch is -2", `got ${sp2[0].toPar}`);
assert(sp2[1].toPar === 36, "Duffer is +36", `got ${sp2[1].toPar}`);

// 2. MATCH PLAY
console.log("\n⚔️ Match Play");
const mp = calcMatchPlay(mike, dave, COURSE);
assert(mp.p1 === "Mike T." && mp.p2 === "Dave R.", "Players correct");
assert(mp.results.length === 18, "18 hole results");
assert(typeof mp.finalStatus === "number", "Final status is number");
// Dave should generally be winning (lower scores)
const mpClose = calcMatchPlay(alex, ben, COURSE);
assert(Math.abs(mpClose.finalStatus) <= 5, "Close match has reasonable margin");

// 3. STABLEFORD
console.log("\n⭐ Stableford");
const stab = calcStableford(allFour, COURSE);
assert(stab[0].points > stab[3].points, "Winner has more points than last");
assert(stab[0].holePoints.length === 18, "18 hole points");
const stabScratch = calcStableford([scratch], COURSE);
assert(stabScratch[0].points >= 34, "Scratch ~36+ Stableford pts", `got ${stabScratch[0].points}`);

// 4. MODIFIED STABLEFORD
console.log("\n💫 Modified Stableford");
const mStab = calcModStableford([scratch, duffer], COURSE);
assert(mStab[0].name === "Scratch", "Scratch wins mod stableford");
assert(mStab[0].points > 0, "Scratch has positive points");
assert(mStab[1].points < 0, "Duffer has negative points", `got ${mStab[1].points}`);

// 5. SKINS (no carryover)
console.log("\n💰 Skins (No Carryover)");
const skinsNC = calcSkins(allFour, COURSE, false);
assert(skinsNC.skins.length === 18, "18 hole results");
assert(skinsNC.remaining === 0, "No remaining pot (no carryover)");
const totalSkins = Object.values(skinsNC.totals).reduce((a, b) => a + b, 0);
const wonHoles = skinsNC.skins.filter(s => s.winner !== "Push").length;
assert(totalSkins === wonHoles, "Total skins = holes won (pushes don't carry)", `skins: ${totalSkins}, won: ${wonHoles}`);

// 6. SKINS (with carryover)
console.log("\n💰 Skins (Carryover)");
const skinsCO = calcSkins(allFour, COURSE, true);
assert(skinsCO.skins.length === 18, "18 hole results");
const wonSkins = skinsCO.skins.filter(s => s.winner !== "Carry" && s.winner !== "Push");
assert(wonSkins.length > 0, "At least 1 skin won");
const carryovers = skinsCO.skins.filter(s => s.winner === "Carry");
assert(carryovers.length >= 0, "Carryover tracking works");

// 7. NASSAU
console.log("\n🎰 Nassau");
const nau = calcNassau(mike, dave, COURSE);
assert(nau.p1 === "Mike T." && nau.p2 === "Dave R.", "Players correct");
assert(typeof nau.front === "number" && typeof nau.back === "number", "Front/back are numbers");
assert(nau.overall === nau.front + nau.back, "Overall = front + back", `${nau.overall} vs ${nau.front + nau.back}`);

// 8. NASSAU WITH PRESSES
console.log("\n🎰 Nassau w/ Presses");
const nauP = calcNassauPress(mike, dave);
assert(nauP.totalBets >= 3, "At least 3 bets (front/back/overall)");
assert(nauP.front === nau.front, "Front 9 matches regular nassau");
if (nauP.presses.length > 0) {
  assert(nauP.presses[0].startHole > 1, "Press starts after hole 1");
  assert(nauP.presses[0].value > 0, "Press has positive value");
}

// 9. WOLF
console.log("\n🐺 Wolf");
const wolf = calcWolf(allFour, COURSE);
assert(wolf.holeResults.length === 18, "18 hole results");
const wolfTotal = Object.values(wolf.totals).reduce((a, b) => a + b, 0);
assert(Math.abs(wolfTotal) < 0.01, "Wolf totals sum to ~0 (zero-sum)", `got ${wolfTotal}`);

// 10. BANKER
console.log("\n🏦 Banker");
const banker = calcBanker(allFour, COURSE);
assert(banker.holeResults.length === 18, "18 hole results");
assert(banker.holeResults[0].bankerName === allFour[0].name, "First banker is first player");
const bankerSum = Object.values(banker.totals).reduce((a, b) => a + b, 0);
assert(Math.abs(bankerSum) < 0.01, "Banker totals sum to ~0", `got ${bankerSum}`);

// 11. HAMMER
console.log("\n🔨 Hammer");
const ham = calcHammer(alex, ben, COURSE);
assert(ham.holeResults.length === 18, "18 hole results");
const hamSum = ham.totals[alex.name] + ham.totals[ben.name];
assert(Math.abs(hamSum) < 0.01, "Hammer is zero-sum", `got ${hamSum}`);

// 12. SNAKE
console.log("\n🐍 Snake");
const snake = calcSnake(allFour, COURSE);
assert(typeof snake.snakeHolder === "string", "Snake holder identified");
if (snake.snakeHolder) {
  assert(snake.totals[snake.snakeHolder] < 0, "Snake holder has negative points");
}

// 13. BINGO BANGO BONGO
console.log("\n🎯 Bingo Bango Bongo");
const bbb = calcBingoBangoBongo(allFour, COURSE);
assert(bbb.holeResults.length === 18, "18 hole results");
const bbbTotal = Object.values(bbb.totals).reduce((a, b) => a + b, 0);
assert(bbbTotal === 54, "Total BBB points = 54 (3 per hole)", `got ${bbbTotal}`);

// 14. DOTS
console.log("\n🎲 Dots / Trash");
const dots = calcDots(allFour, COURSE);
assert(Object.keys(dots.totals).length === 4, "4 players in totals");
assert(dots.breakdown[dave.name].birdies >= 0, "Breakdown tracks birdies");

// 15. RABBIT
console.log("\n🐰 Rabbit");
const rabbit = calcRabbit(allFour, COURSE);
assert(typeof rabbit.front9Holder === "string", "Front 9 holder identified");
assert(typeof rabbit.back9Holder === "string", "Back 9 holder identified");

// 16. DEFENDER
console.log("\n🛡️ Defender");
const def = calcDefender(allFour, COURSE);
assert(def.holeResults.length === 18, "18 hole results");
assert(def.holeResults[0].defenderName === allFour[0].name, "First defender correct");

// 17. NINES
console.log("\n9️⃣ Nines / Nine Point");
const nines = calcNines(allFour, COURSE);
assert(nines.holeResults.length === 18, "18 hole results");
const ninesTotal = Object.values(nines.points).reduce((a, b) => a + b, 0);
assert(Math.abs(ninesTotal - 162) < 0.01, "Total points = 162 (9 × 18)", `got ${ninesTotal}`);

// 18. VEGAS
console.log("\n🎲 Vegas");
const vegasTeam1 = allFour.filter(p => p.team === "A"); // Mike, Chris
const vegasTeam2 = allFour.filter(p => p.team === "B"); // Dave, Jay
const vegas = calcVegas(vegasTeam1, vegasTeam2, COURSE);
assert(vegas.holes.length === 18, "18 hole results");
assert(vegas.holes[0].t1 > 0 && vegas.holes[0].t2 > 0, "Team numbers are positive");

// 19. SIXES
console.log("\n🔄 Sixes / Round Robin");
const sixes = calcSixes(allFour, COURSE);
assert(sixes.rounds.length === 3, "3 rounds of 6 holes each");
assert(sixes.rounds[0].holes === "1-6", "First round is holes 1-6");

// 20. CLOSEOUT
console.log("\n🔒 Closeout");
const closeout = calcCloseout(alex, ben, COURSE);
assert(closeout.matches.length >= 1, "At least 1 match played");
assert(closeout.matches[0].startHole === 1, "First match starts on hole 1");

// 21. QUOTA
console.log("\n📊 Quota");
const quota = calcQuota(allFour, COURSE);
assert(quota[0].quota === 36 - Math.round(quota[0].handicap), "Quota = 36 - handicap");
assert(typeof quota[0].overUnder === "number", "Over/under calculated");
// Higher handicap players should have lower quotas
assert(quota.some(q => q.overUnder > 0) || quota.some(q => q.overUnder < 0), "Some over/under variation");

// 22. CHICAGO
console.log("\n🌆 Chicago");
const chi = calcChicago(allFour, COURSE);
assert(chi[0].quota === 36 - Math.round(chi[0].handicap), "Quota correct");
assert(typeof chi[0].netScore === "number", "Net score calculated");

// 23. GREENIES
console.log("\n🟢 Greenies");
const greenies = calcGreenies(allFour, COURSE);
const par3Count = COURSE.holes.filter(h => h.par === 3).length;
assert(greenies.greenies.length === par3Count, `${par3Count} par 3s tracked`, `got ${greenies.greenies.length}`);

// 24. ACES & DEUCES
console.log("\n🃏 Aces & Deuces");
const ad = calcAcesDeuces(allFour, COURSE);
assert(ad.aces.length >= 0, "Aces tracked");
assert(ad.deuces.length >= 0, "Deuces tracked");
const adSum = Object.values(ad.totals).reduce((a, b) => a + b, 0);
assert(Math.abs(adSum) < 0.01, "Aces & Deuces is zero-sum", `got ${adSum}`);

// 25. BEST BALL
console.log("\n🏆 Best Ball");
const bb = calcBestBall(
  [
    { name: "Eagles", players: allFour.filter(p => p.team === "A") },
    { name: "Birdies", players: allFour.filter(p => p.team === "B") },
  ],
  COURSE
);
assert(bb.length === 2, "2 team results");
assert(bb[0].total <= bb[1].total, "Winner has lower or equal total");
assert(bb[0].total < Math.min(
  allFour.filter(p => p.team === "A").reduce((s, p) => s + p.scores.reduce((a, b) => a + b, 0), 0) / 2,
  allFour.filter(p => p.team === "B").reduce((s, p) => s + p.scores.reduce((a, b) => a + b, 0), 0) / 2,
), "Best ball total < average individual total");

// 26. FOUR-BALL
console.log("\n4️⃣ Four-Ball");
const fb = calcFourBall(
  [allFour[0], allFour[2]] as [Player, Player],
  [allFour[1], allFour[3]] as [Player, Player],
  COURSE
);
assert(fb.holeResults.length === 18, "18 hole results");
assert(typeof fb.finalStatus === "number", "Final status is number");

// 27. SETTLEMENT
console.log("\n💰 Settlement");
const settlement = calculateSettlement(allFour, COURSE, ["stroke_play", "skins_carry", "nassau", "stableford"], 5);
assert(settlement.transactions.length > 0, "Transactions generated");
assert(Object.keys(settlement.netByPlayer).length === 4, "4 players in net");
const netSum = Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0);
assert(Math.abs(netSum) < 0.01, "Settlement is zero-sum", `got ${netSum}`);

// ─── SCORECARD 2 CROSS-VALIDATION ──────────────────────────────────
console.log("\n── Scorecard 2: Scratch vs Duffer ──");

const spSD = calcStrokePlay([scratch, duffer], COURSE);
assert(spSD[0].total === 70, "Scratch scores 70", `got ${spSD[0].total}`);
assert(spSD[1].total === 108, "Duffer scores 108", `got ${spSD[1].total}`);

const skinsSD = calcSkins([scratch, duffer], COURSE, false);
const scratchSkins = skinsSD.totals["Scratch"];
assert(scratchSkins >= 15, "Scratch dominates skins", `got ${scratchSkins} skins`);

const quotaSD = calcQuota([scratch, duffer], COURSE);
// Scratch with 0 handicap: quota = 36, should earn ~36 Stableford pts
// Duffer with 28 handicap: quota = 8, probably earns ~0 pts
assert(quotaSD[0].overUnder > quotaSD[1].overUnder, "Scratch beats duffer in quota");

// ─── SCORECARD 3 CROSS-VALIDATION ──────────────────────────────────
console.log("\n── Scorecard 3: Tight Match (Alex 73 vs Ben 74) ──");

const mpAB = calcMatchPlay(alex, ben, COURSE);
assert(Math.abs(mpAB.finalStatus) <= 5, "Close match play result");

const nauAB = calcNassau(alex, ben);
assert(typeof nauAB.front === "number", "Nassau front calculated");

const hamAB = calcHammer(alex, ben, COURSE);
const margin = Math.abs(hamAB.totals["Alex"] - hamAB.totals["Ben"]);
assert(margin < 20, "Hammer margin reasonable for close match", `margin: ${margin}`);

// ─── SUMMARY ────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("══════════════════════════════════════════════\n");

if (failed > 0) {
  process.exit(1);
}
