const fs = require('fs');
const ts = require('typescript');

// AUG-246c: screen-logic for the Leaderboard Gross/Net toggle. Covers default
// Gross, Net ordering for a 2- and 16-player fixture, and that an unsupported
// (non-18-hole) course withholds the Net option. Loads the real TS modules
// in-process (transpile + wire deps) so it runs in a read-only/no-subprocess
// sandbox, matching tests/leaderboard-net.test.cjs.
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
const view = load('src/engine/calculators/leaderboard-view.ts', {
  '../types': {},
  './stroke-play': stroke,
  './net-stroke-play': net,
});
const { buildLeaderboard } = view;
const { calcStrokePlay } = stroke;

const par4x18 = {
  name: 'Test',
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })),
};
const nine = {
  name: 'Nine',
  holes: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })),
};
// A full 18-hole round of all 4s = gross 72.
const round = (over = 0) => Array.from({ length: 18 }, (_, i) => (i === 0 ? 4 + over : 4));

test('default Gross: rows identical to calcStrokePlay and net offered', () => {
  const players = [
    { id: 'a', name: 'Ann', handicap: 0, scores: round(2) },   // gross 74
    { id: 'b', name: 'Bob', handicap: 18, scores: round(0) },  // gross 72
  ];
  const v = buildLeaderboard(players, par4x18, 'gross');
  expect(v.mode).toBe('gross');
  expect(v.netAvailable).toBe(true);
  expect(v.rows).toEqual(calcStrokePlay(players, par4x18));
  // Gross order: Bob (72) before Ann (74).
  expect(v.rows.map((r) => r.playerId)).toEqual(['b', 'a']);
});

test('Net (2 players): re-sorts by net total and surfaces net in total/toPar', () => {
  const players = [
    { id: 'a', name: 'Ann', handicap: 0, scores: round(2) },   // gross 74, net 74
    { id: 'b', name: 'Bob', handicap: 18, scores: round(0) },  // gross 72, net 54
  ];
  const v = buildLeaderboard(players, par4x18, 'net');
  expect(v.mode).toBe('net');
  // Bob gets 18 strokes -> net 54, well ahead of Ann's net 74.
  expect(v.rows.map((r) => r.playerId)).toEqual(['b', 'a']);
  const bob = v.rows[0];
  expect(bob.net.netTotal).toBe(54);
  expect(bob.total).toBe(bob.net.netTotal); // net surfaced in the gross slot
  expect(bob.toPar).toBe(bob.net.netToPar);
  // par of played holes = 72, so net to-par = 54 - 72 = -18.
  expect(bob.toPar).toBe(-18);
});

test('Net (16 players): ordered ascending by net total', () => {
  // Everyone shoots gross 90 (18 over). Handicaps 0..15 -> net 90..75, so a
  // higher handicap ranks better. Expect order by descending handicap.
  const players = Array.from({ length: 16 }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    handicap: i,
    scores: Array.from({ length: 18 }, () => 5), // gross 90 for all
  }));
  const v = buildLeaderboard(players, par4x18, 'net');
  expect(v.mode).toBe('net');
  const nets = v.rows.map((r) => r.net.netTotal);
  for (let i = 1; i < nets.length; i++) {
    expect(nets[i]).toBeGreaterThanOrEqual(nets[i - 1]);
  }
  // Highest handicap (15) first, lowest (0) last.
  expect(v.rows[0].playerId).toBe('p15');
  expect(v.rows[nets.length - 1].playerId).toBe('p0');
});

test('unavailable course: no Net option, gross shown even if net requested', () => {
  const players = [
    { id: 'a', name: 'Ann', handicap: 0, scores: Array.from({ length: 9 }, () => 4) },
    { id: 'b', name: 'Bob', handicap: 18, scores: Array.from({ length: 9 }, () => 4) },
  ];
  const v = buildLeaderboard(players, nine, 'net');
  expect(v.netAvailable).toBe(false);
  expect(v.mode).toBe('gross');
  expect(v.rows).toEqual(calcStrokePlay(players, nine));
});
