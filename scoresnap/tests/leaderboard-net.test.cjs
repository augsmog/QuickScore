const fs = require('fs');
const ts = require('typescript');

// AUG-246a: pure Option-A net leaderboard ranking helper. Math only, no UI.
// Load the real TS modules in-process (transpile + wire deps) so the tests run
// anywhere, including read-only/no-subprocess sandboxes. ../types is type-only
// (erased), so it resolves to an empty object.
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
const { calcNetStrokePlay } = net;
const { calcStrokePlay } = stroke;

const par4x18 = {
  name: 'Test',
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })),
};

test('2 players: net ranking applies entered course handicap and re-sorts', () => {
  const players = [
    { id: 'a', name: 'A', handicap: 0, scores: Array(18).fill(5) },  // gross 90, net 90
    { id: 'b', name: 'B', handicap: 18, scores: Array(18).fill(5) }, // gross 90, net 72
  ];
  const res = calcNetStrokePlay(players, par4x18);
  expect(res).toHaveLength(2);
  // sorted by net total ascending: B (72) before A (90)
  expect(res[0].playerId).toBe('b');
  expect(res[0].net.netTotal).toBe(72);
  expect(res[0].net.strokesReceived).toBe(18);
  expect(res[0].net.netToPar).toBe(0);
  expect(res[0].total).toBe(90); // gross shape preserved
  expect(res[1].playerId).toBe('a');
  expect(res[1].net.netTotal).toBe(90);
  expect(res[1].net.strokesReceived).toBe(0);
});

test('16 players: ranked strictly by net total', () => {
  // handicap k (0..15), all pars: strokesReceived = k, net = 72 - k
  const players = Array.from({ length: 16 }, (_, k) => ({
    id: 'p' + k, name: 'P' + k, handicap: k, scores: Array(18).fill(4),
  }));
  const hcpById = new Map(players.map((p) => [p.id, p.handicap]));
  const res = calcNetStrokePlay(players, par4x18);
  expect(res).toHaveLength(16);
  for (const r of res) {
    const hcp = hcpById.get(r.playerId);
    expect(r.net.strokesReceived).toBe(hcp);
    expect(r.net.netTotal).toBe(72 - hcp);
    expect(r.total).toBe(72); // gross unchanged for everyone
  }
  // ascending net total => descending handicap
  expect(hcpById.get(res[0].playerId)).toBe(15);
  expect(res[0].net.netTotal).toBe(57);
  expect(hcpById.get(res[15].playerId)).toBe(0);
  expect(res[15].net.netTotal).toBe(72);
  for (let i = 1; i < res.length; i++) {
    expect(res[i].net.netTotal).toBeGreaterThanOrEqual(res[i - 1].net.netTotal);
  }
});

test('handicap 27 (two strokes on the hardest nine) and plus handicap -2 (strokes back)', () => {
  const players = [
    { id: 'h27', name: 'H27', handicap: 27, scores: Array(18).fill(4) },
    { id: 'hm2', name: 'HM2', handicap: -2, scores: Array(18).fill(4) },
  ];
  const res = calcNetStrokePlay(players, par4x18);
  const h27 = res.find((r) => r.playerId === 'h27');
  const hm2 = res.find((r) => r.playerId === 'hm2');
  expect(h27.net.strokesReceived).toBe(27);
  expect(h27.net.netTotal).toBe(45);
  expect(h27.net.netToPar).toBe(-27);
  // plus handicap adds strokes (gives them back) on the easiest holes
  expect(hm2.net.strokesReceived).toBe(-2);
  expect(hm2.net.netTotal).toBe(74);
  expect(hm2.net.netToPar).toBe(2);
  // sorted ascending: 27 handicap (45) before plus handicap (74)
  expect(res[0].playerId).toBe('h27');
  expect(res[1].playerId).toBe('hm2');
});

test('per-course handicap entry overrides the base handicap', () => {
  const players = [
    { id: 'a', name: 'A', handicap: 0, courseHandicaps: { Test: 18 }, scores: Array(18).fill(5) },
  ];
  const res = calcNetStrokePlay(players, par4x18);
  expect(res[0].net.strokesReceived).toBe(18); // uses 18, not base 0
  expect(res[0].net.netTotal).toBe(72);
});

test('partial round (thru 9): only played holes count for strokes, net and par', () => {
  const scores = Array(18).fill(0);
  for (let i = 0; i < 9; i++) scores[i] = 4; // holes 1-9 only
  const players = [{ id: 'a', name: 'A', handicap: 18, scores }];
  const res = calcNetStrokePlay(players, par4x18);
  expect(res[0].total).toBe(36);             // gross front nine
  expect(res[0].net.strokesReceived).toBe(9); // 1 stroke on each of 9 played holes
  expect(res[0].net.netTotal).toBe(27);
  expect(res[0].net.netToPar).toBe(-9);       // vs par of played holes only
});

test('tie: equal net totals stay adjacent in the gross (stable) order', () => {
  const players = [
    { id: 'a', name: 'A', handicap: 0, scores: Array(18).fill(4) },  // gross 72, net 72
    { id: 'b', name: 'B', handicap: 18, scores: Array(18).fill(5) }, // gross 90, net 72
  ];
  const res = calcNetStrokePlay(players, par4x18);
  expect(res[0].net.netTotal).toBe(72);
  expect(res[1].net.netTotal).toBe(72);
  // same net total = same rank: stable sort keeps gross order (A gross 72 before B gross 90)
  expect(res[0].playerId).toBe('a');
  expect(res[1].playerId).toBe('b');
});

test('unsupported courses return net: unavailable rather than a number', () => {
  const players = [{ id: 'a', name: 'A', handicap: 18, scores: Array(18).fill(4) }];
  // 9-hole course
  const nine = { name: 'Nine', holes: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })) };
  const resNine = calcNetStrokePlay(players, nine);
  expect(resNine[0].net).toBe('unavailable');
  expect(typeof resNine[0].total).toBe('number'); // gross shape still present
  // 18 holes but a hole is missing hcp
  const missing = { name: 'Missing', holes: par4x18.holes.map((h, i) => (i === 5 ? { num: h.num, par: 4 } : h)) };
  expect(calcNetStrokePlay(players, missing)[0].net).toBe('unavailable');
  // 18 holes but a duplicate stroke index (two hcp 1, no hcp 18)
  const dup = { name: 'Dup', holes: par4x18.holes.map((h, i) => (i === 17 ? { ...h, hcp: 1 } : h)) };
  expect(calcNetStrokePlay(players, dup)[0].net).toBe('unavailable');
  // 18 holes but an out-of-range stroke index
  const bad = { name: 'Bad', holes: par4x18.holes.map((h, i) => (i === 0 ? { ...h, hcp: 19 } : h)) };
  expect(calcNetStrokePlay(players, bad)[0].net).toBe('unavailable');
});

test('calcStrokePlay output is unchanged and players are not mutated', () => {
  const players = [
    { id: 'a', name: 'A', handicap: 0, scores: Array(18).fill(4) },
    { id: 'b', name: 'B', handicap: 18, scores: Array(18).fill(5) },
  ];
  const snapshot = JSON.stringify(players);
  const grossBefore = calcStrokePlay(players, par4x18);
  calcNetStrokePlay(players, par4x18);
  const grossAfter = calcStrokePlay(players, par4x18);
  expect(grossAfter).toEqual(grossBefore);
  expect(JSON.stringify(players)).toBe(snapshot); // pure: no mutation
  expect('net' in grossAfter[0]).toBe(false);      // gross result has no net field
});
