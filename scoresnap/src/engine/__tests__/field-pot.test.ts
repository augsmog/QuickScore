/** Run: npx tsx src/engine/__tests__/field-pot.test.ts */
import { Player } from "../types";
import { calcFieldPot } from "../field-pot";

let passed = 0, failed = 0;
function assert(c: boolean, n: string) { if (c) passed++; else { failed++; console.log("FAIL:", n); } }

const mk = (id: string, scores: number[], handicap = 0): Player => ({ id, name: id, handicap, scores });
const flat = (n: number) => Array(18).fill(n);
const withBack = (front: number, back: number) => [...Array(9).fill(front), ...Array(9).fill(back)];

// winner take all, gross
let r = calcFieldPot([mk("a", flat(4)), mk("b", flat(5)), mk("c", flat(6))], { entryFeeCents: 2000, basis: "gross" });
assert(r.potCents === 6000 && r.payouts[0].playerId === "a" && r.payouts[0].payoutCents === 6000, "winner takes all");
assert(r.payouts[1].payoutCents === 0, "loser gets 0");

// net basis changes winner
r = calcFieldPot([mk("a", flat(4), 0), mk("b", flat(5), 20)], { entryFeeCents: 1000 });
assert(r.payouts[0].playerId === "b", "net: handicap flips winner (90-20=70 < 72)");

// payout split 60/40, rake
r = calcFieldPot([mk("a", flat(4)), mk("b", flat(5)), mk("c", flat(6)), mk("d", flat(7))],
  { entryFeeCents: 2500, rakeCents: 1000, payoutPercents: [60, 40], basis: "gross" });
assert(r.potCents === 9000 && r.payouts[0].payoutCents === 5400 && r.payouts[1].payoutCents === 3600, "60/40 after rake");

// scorecard playoff breaks tie on back 9
r = calcFieldPot([mk("a", withBack(5, 4)), mk("b", withBack(4, 5))], { entryFeeCents: 1000, basis: "gross" });
assert(r.payouts[0].playerId === "a" && r.payouts[0].payoutCents === 2000, "back-9 playoff");

// split rule: tie shares places 1+2
r = calcFieldPot([mk("a", withBack(5, 4)), mk("b", withBack(4, 5)), mk("c", flat(6))],
  { entryFeeCents: 1000, payoutPercents: [60, 40], basis: "gross", tieRule: "split" });
assert(r.payouts[0].payoutCents === 1500 && r.payouts[1].payoutCents === 1500 && r.payouts[0].place === 1 && r.payouts[1].place === 1, "split tie shares places");
assert(r.warnings.length === 1, "split warns");

// unbreakable tie with odd cent: invariant holds
r = calcFieldPot([mk("a", flat(4)), mk("b", flat(4)), mk("c", flat(4))], { entryFeeCents: 1000, basis: "gross" });
assert(r.payouts.reduce((s, p) => s + p.payoutCents, 0) === 3000 && r.payouts.every((p) => p.payoutCents === 1000), "3-way tie even");
r = calcFieldPot([mk("a", flat(4)), mk("b", flat(4))], { entryFeeCents: 1001, basis: "gross" });
assert(r.payouts.reduce((s, p) => s + p.payoutCents, 0) === 2002, "odd cents conserved");

// incomplete excluded; empty field
r = calcFieldPot([mk("a", flat(4)), mk("b", [...Array(17).fill(4), 0])], { entryFeeCents: 1000, basis: "gross" });
assert(r.potCents === 1000 && r.payouts.length === 1 && r.warnings.length === 1, "incomplete excluded");
assert(calcFieldPot([], { entryFeeCents: 1000 }).payouts.length === 0, "empty field");

// invalid config
let threw = false; try { calcFieldPot([], { entryFeeCents: 1000, payoutPercents: [50, 40] }); } catch { threw = true; }
assert(threw, "bad percents throws");

console.log(`field-pot: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
