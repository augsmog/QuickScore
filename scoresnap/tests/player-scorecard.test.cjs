const fs = require('fs');
const ts = require('typescript');

// AUG-705a: pure data layer for the player full-round scorecard (tap a
// leaderboard row). Covers gross hole-by-hole, partial-round blanks, a 9-hole
// course, net values + a net-unavailable course, a plus-handicap player, and
// front/back/total over played holes only. Loads the real TS modules in-process
// (transpile + wire deps) so it runs in a read-only/no-subprocess sandbox,
// matching tests/leaderboard-view.test.cjs.
function load(path, deps) {
  const m = { exports: {} };
  const src = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', src)(
    (id) => {
      if (id in deps) return deps[id];
      throw new Error('unresolved import: ' + id);
    },
    m,
    m.exports,
  );
  return m.exports;
}

const stroke = load('src/engine/calculators/stroke-play.ts', { '../types': {} });
const skins = load('src/engine/calculators/skins.ts', { '../types': {} });
const net = load('src/engine/calculators/net-stroke-play.ts', {
  '../types': {},
  './skins': skins,
  './stroke-play': stroke,
});
const card = load('src/engine/calculators/player-scorecard.ts', {
  '../types': {},
  './skins': skins,
  './net-stroke-play': net,
});
const { buildPlayerScorecard } = card;

// 18-hole course, every hole par 4, stroke indexes 1..18.
const par4x18 = {
  name: 'Test18',
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })),
};
// 9-hole course, par 4.
const nine = {
  name: 'Nine',
  holes: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })),
};
// Non-18-hole course => net unavailable (per net-stroke-play.netSupported).
const notNetCourse = nine;

const full18 = Array.from({ length: 18 }, () => 4); // even par 72

test('full 18-hole gross round: per-hole, nines and total', () => {
  const p = { id: 'a', name: 'Ann', handicap: 0, scores: full18.map((s, i) => (i === 0 ? 6 : 4)) };
  const sc = buildPlayerScorecard(p, par4x18);
  expect(sc.holes).toHaveLength(18);
  expect(sc.holesPlayed).toBe(18);
  // Hole 1 is a double (6 on a par 4): strokes 6, toPar +2.
  expect(sc.holes[0]).toMatchObject({ num: 1, par: 4, strokes: 6, toPar: 2 });
  expect(sc.holes[1]).toMatchObject({ num: 2, par: 4, strokes: 4, toPar: 0 });
  // Front = 9 holes: 6 + 8*4 = 38, par 36, toPar +2. Back = 36 even.
  expect(sc.front).toMatchObject({ strokes: 38, par: 36, toPar: 2 });
  expect(sc.back).toMatchObject({ strokes: 36, par: 36, toPar: 0 });
  expect(sc.total).toMatchObject({ strokes: 74, par: 72, toPar: 2 });
});

test('partial round: unplayed holes are blank and summaries use played holes only', () => {
  // Only the first 3 holes played (all pars).
  const scores = Array.from({ length: 18 }, (_, i) => (i < 3 ? 4 : 0));
  const p = { id: 'b', name: 'Bob', handicap: 0, scores };
  const sc = buildPlayerScorecard(p, par4x18);
  expect(sc.holesPlayed).toBe(3);
  expect(sc.holes[2]).toMatchObject({ num: 3, strokes: 4, toPar: 0 });
  // Unplayed hole 4 is blank.
  expect(sc.holes[3]).toMatchObject({ num: 4, par: 4, strokes: null, toPar: null, net: null });
  // Front summary covers the 3 played holes only, not all nine.
  expect(sc.front).toMatchObject({ strokes: 12, par: 12, toPar: 0 });
  expect(sc.back).toMatchObject({ strokes: 0, par: 0, toPar: 0 });
  expect(sc.total).toMatchObject({ strokes: 12, par: 12, toPar: 0 });
});

test('9-hole course: 9 holes, empty back nine', () => {
  const p = { id: 'c', name: 'Cy', handicap: 0, scores: Array.from({ length: 9 }, () => 4) };
  const sc = buildPlayerScorecard(p, nine);
  expect(sc.holes).toHaveLength(9);
  expect(sc.holesPlayed).toBe(9);
  expect(sc.front).toMatchObject({ strokes: 36, par: 36, toPar: 0 });
  expect(sc.back).toMatchObject({ strokes: 0, par: 0, toPar: 0 });
  expect(sc.total).toMatchObject({ strokes: 36, par: 36, toPar: 0 });
  // 9-hole course is not net-rankable.
  expect(sc.netAvailable).toBe(false);
});

test('net values on a net-rankable course: 18-handicap gets one shot per hole', () => {
  // handicap 18 => 1 stroke on every hole. Gross 72 (all 4s) => net 54.
  const p = { id: 'd', name: 'Dot', handicap: 18, scores: full18 };
  const sc = buildPlayerScorecard(p, par4x18);
  expect(sc.netAvailable).toBe(true);
  // Each hole: gross 4, net 3.
  expect(sc.holes[0]).toMatchObject({ strokes: 4, net: 3 });
  expect(sc.holes[17]).toMatchObject({ strokes: 4, net: 3 });
  expect(sc.front.net).toBe(27);
  expect(sc.back.net).toBe(27);
  expect(sc.total.net).toBe(54);
});

test('net unavailable (non-18 course): every net field is null', () => {
  const p = { id: 'e', name: 'Ed', handicap: 18, scores: Array.from({ length: 9 }, () => 4) };
  const sc = buildPlayerScorecard(p, notNetCourse);
  expect(sc.netAvailable).toBe(false);
  expect(sc.holes.every((h) => h.net === null)).toBe(true);
  expect(sc.front.net).toBeNull();
  expect(sc.total.net).toBeNull();
});

test('plus-handicap player gives strokes back (net above gross)', () => {
  // handicap -2 => strokes received on the two hardest holes are -1 each
  // (plus player owes strokes), so net total > gross total.
  const p = { id: 'f', name: 'Flo', handicap: -2, scores: full18 };
  const sc = buildPlayerScorecard(p, par4x18);
  expect(sc.netAvailable).toBe(true);
  // Net total should exceed gross total (72) for a plus handicap.
  expect(sc.total.net).toBeGreaterThan(sc.total.strokes);
  expect(sc.total.strokes).toBe(72);
});
