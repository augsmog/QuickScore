import assert from 'node:assert/strict';
import { calcSkins } from '../../src/engine/calculators/skins';
import { calculateSettlement } from '../../src/engine/settlement';

// Mid-round regression: holes nobody has entered yet are not played, so they
// must not count as ties, add to the carryover pot, or appear as Push/Carry.
const course = { name: 'Midround', holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })) };
// Through 6 holes. H1 A wins outright, H2-H3 tie, H4 B wins, H5-H6 tie, H7-H18 unplayed.
const front = { A: [3, 4, 4, 5, 4, 4], B: [4, 4, 4, 3, 4, 4], C: [5, 4, 4, 5, 4, 4] };
const pad = (s: number[]) => [...s, ...Array(18 - s.length).fill(0)];
const players = Object.entries(front).map(([name, s]) => ({ id: name, name, handicap: 0, scores: pad(s) }));

for (const mode of ['net', 'gross'] as const) {
  const carry = calcSkins(players, course, true, mode);
  assert.equal(carry.skins.length, 6, `${mode} carry: only the 6 played holes are listed`);
  assert.deepEqual(carry.skins.map(s => s.winner), ['A', 'Carry', 'Carry', 'B', 'Carry', 'Carry'], `${mode} carry winners`);
  assert.equal(carry.remaining, 2, `${mode} carry: 2 skins carrying after H6 (not 14)`);
  assert.deepEqual(carry.totals, { A: 1, B: 3, C: 0 }, `${mode} carry totals`);

  const flat = calcSkins(players, course, false, mode);
  assert.equal(flat.skins.length, 6, `${mode} no-carry: no Push entries for unplayed holes`);
  assert.deepEqual(flat.skins.map(s => s.winner), ['A', 'Push', 'Push', 'B', 'Push', 'Push'], `${mode} no-carry winners`);
  assert.equal(flat.remaining, 0, `${mode} no-carry remaining`);
  assert.deepEqual(flat.totals, { A: 1, B: 1, C: 0 }, `${mode} no-carry totals`);

  // Nothing entered: no holes, no pot.
  const none = calcSkins(players.map(p => ({ ...p, scores: Array(18).fill(0) })), course, true, mode);
  assert.equal(none.skins.length, 0, `${mode}: empty card lists no holes`);
  assert.equal(none.remaining, 0, `${mode}: empty card carries nothing`);

  // Sparse / truncated score arrays mean unplayed too.
  const truncated = calcSkins(Object.entries(front).map(([name, s]) => ({ id: name, name, handicap: 0, scores: [...s] })), course, true, mode);
  assert.deepEqual(truncated, carry, `${mode}: truncated arrays match zero-padded`);

  // A skipped hole in the middle does not break or feed the carry chain.
  const gap = players.map(p => ({ ...p, scores: p.scores.map((s, i) => (i === 2 ? 0 : s)) }));
  const gapRes = calcSkins(gap, course, true, mode);
  assert.deepEqual(gapRes.skins.map(s => s.hole), [1, 2, 4, 5, 6], `${mode}: unplayed H3 skipped`);
  assert.equal(gapRes.totals.B, 2, `${mode}: B's H4 win collects only the H2 carry`);

  // Settlement agrees: carry pot from unplayed holes never pays out.
  const settlement = calculateSettlement(players, course, ['skins_carry'], 1, undefined, { skinsMode: mode });
  assert.equal(Object.values(settlement.netByPlayer).reduce((a, b) => a + b, 0), 0);
  assert.equal(settlement.netByPlayer.B, 3 - 4 / 3);
}

// Net strokes only apply to played holes: a 36-handicap who hasn't teed off on H7+ gets nothing there.
const hcp = [{ id: 'X', name: 'X', handicap: 36, scores: pad([5, 5]) }, { id: 'Y', name: 'Y', handicap: 0, scores: pad([4, 4]) }];
const net = calcSkins(hcp, course, true, 'net');
assert.equal(net.skins.length, 2);
assert.deepEqual(net.totals, { X: 2, Y: 0 });
assert.equal(net.remaining, 0);
console.log('skins mid-round regressions passed');
