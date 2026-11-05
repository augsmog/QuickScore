const { execFileSync } = require('node:child_process');

// AUG-246a: pure Option-A net leaderboard ranking helper. Math only, no UI.
// Each case runs the real TS helper via tsx so we test shipped code, not a copy.
const run = (body) =>
  execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const { calcNetStrokePlay } = await import('./src/engine/calculators/net-stroke-play.ts').then(m => m.default ?? m);
      const { calcStrokePlay } = await import('./src/engine/calculators/stroke-play.ts').then(m => m.default ?? m);
      const par4x18 = { name: 'Test', holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })) };
      ${body}
    `],
    { stdio: 'pipe' },
  );

test('2 players: net ranking applies entered course handicap and re-sorts', () => {
  run(`
    const players = [
      { id: 'a', name: 'A', handicap: 0, scores: Array(18).fill(5) },  // gross 90, net 90
      { id: 'b', name: 'B', handicap: 18, scores: Array(18).fill(5) }, // gross 90, net 72
    ];
    const res = calcNetStrokePlay(players, par4x18);
    assert.equal(res.length, 2);
    // sorted by net total ascending: B (72) before A (90)
    assert.equal(res[0].playerId, 'b');
    assert.equal(res[0].net.netTotal, 72);
    assert.equal(res[0].net.strokesReceived, 18);
    assert.equal(res[0].net.netToPar, 0);
    assert.equal(res[0].total, 90); // gross shape preserved
    assert.equal(res[1].playerId, 'a');
    assert.equal(res[1].net.netTotal, 90);
    assert.equal(res[1].net.strokesReceived, 0);
  `);
});

test('16 players: ranked strictly by net total', () => {
  run(`
    // handicap k (0..15), all pars: strokesReceived = k, net = 72 - k
    const players = Array.from({ length: 16 }, (_, k) => ({
      id: 'p' + k, name: 'P' + k, handicap: k, scores: Array(18).fill(4),
    }));
    const hcpById = new Map(players.map(p => [p.id, p.handicap]));
    const res = calcNetStrokePlay(players, par4x18);
    assert.equal(res.length, 16);
    for (let i = 0; i < res.length; i++) {
      const hcp = hcpById.get(res[i].playerId);
      assert.equal(res[i].net.strokesReceived, hcp);
      assert.equal(res[i].net.netTotal, 72 - hcp);
      assert.equal(res[i].total, 72); // gross unchanged for everyone
    }
    // ascending net total => descending handicap
    assert.equal(hcpById.get(res[0].playerId), 15);
    assert.equal(res[0].net.netTotal, 57);
    assert.equal(hcpById.get(res[15].playerId), 0);
    assert.equal(res[15].net.netTotal, 72);
    for (let i = 1; i < res.length; i++) {
      assert.ok(res[i].net.netTotal >= res[i - 1].net.netTotal);
    }
  `);
});

test('handicap 27 (two strokes on the hardest nine) and plus handicap -2 (strokes back)', () => {
  run(`
    const players = [
      { id: 'h27', name: 'H27', handicap: 27, scores: Array(18).fill(4) },
      { id: 'hm2', name: 'HM2', handicap: -2, scores: Array(18).fill(4) },
    ];
    const res = calcNetStrokePlay(players, par4x18);
    const h27 = res.find(r => r.playerId === 'h27');
    const hm2 = res.find(r => r.playerId === 'hm2');
    assert.equal(h27.net.strokesReceived, 27);
    assert.equal(h27.net.netTotal, 45);
    assert.equal(h27.net.netToPar, -27);
    // plus handicap adds strokes (gives them back) on the easiest holes
    assert.equal(hm2.net.strokesReceived, -2);
    assert.equal(hm2.net.netTotal, 74);
    assert.equal(hm2.net.netToPar, 2);
    // sorted ascending: 27 handicap (45) before plus handicap (74)
    assert.equal(res[0].playerId, 'h27');
    assert.equal(res[1].playerId, 'hm2');
  `);
});

test('per-course handicap entry overrides the base handicap', () => {
  run(`
    const players = [
      { id: 'a', name: 'A', handicap: 0, courseHandicaps: { Test: 18 }, scores: Array(18).fill(5) },
    ];
    const res = calcNetStrokePlay(players, par4x18);
    assert.equal(res[0].net.strokesReceived, 18); // uses 18, not base 0
    assert.equal(res[0].net.netTotal, 72);
  `);
});

test('partial round (thru 9): only played holes count for strokes, net and par', () => {
  run(`
    const scores = Array(18).fill(0);
    for (let i = 0; i < 9; i++) scores[i] = 4; // holes 1-9 only
    const players = [{ id: 'a', name: 'A', handicap: 18, scores }];
    const res = calcNetStrokePlay(players, par4x18);
    assert.equal(res[0].total, 36);            // gross front nine
    assert.equal(res[0].net.strokesReceived, 9); // 1 stroke on each of 9 played holes
    assert.equal(res[0].net.netTotal, 27);
    assert.equal(res[0].net.netToPar, -9);      // vs par of played holes only
  `);
});

test('tie: equal net totals stay adjacent in the gross (stable) order', () => {
  run(`
    const players = [
      { id: 'a', name: 'A', handicap: 0, scores: Array(18).fill(4) },  // gross 72, net 72
      { id: 'b', name: 'B', handicap: 18, scores: Array(18).fill(5) }, // gross 90, net 72
    ];
    const res = calcNetStrokePlay(players, par4x18);
    assert.equal(res[0].net.netTotal, 72);
    assert.equal(res[1].net.netTotal, 72);
    // same net total = same rank: stable sort keeps gross order (A gross 72 before B gross 90)
    assert.equal(res[0].playerId, 'a');
    assert.equal(res[1].playerId, 'b');
  `);
});

test('unsupported courses return net: unavailable rather than a number', () => {
  run(`
    const players = [{ id: 'a', name: 'A', handicap: 18, scores: Array(18).fill(4) }];
    // 9-hole course
    const nine = { name: 'Nine', holes: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })) };
    let res = calcNetStrokePlay(players, nine);
    assert.equal(res[0].net, 'unavailable');
    assert.equal(typeof res[0].total, 'number'); // gross shape still present
    // 18 holes but a hole is missing hcp
    const missing = { name: 'Missing', holes: par4x18.holes.map((h, i) => i === 5 ? { num: h.num, par: 4 } : h) };
    assert.equal(calcNetStrokePlay(players, missing)[0].net, 'unavailable');
    // 18 holes but a duplicate stroke index (two hcp 1, no hcp 18)
    const dup = { name: 'Dup', holes: par4x18.holes.map((h, i) => i === 17 ? { ...h, hcp: 1 } : h) };
    assert.equal(calcNetStrokePlay(players, dup)[0].net, 'unavailable');
    // 18 holes but an out-of-range stroke index
    const bad = { name: 'Bad', holes: par4x18.holes.map((h, i) => i === 0 ? { ...h, hcp: 19 } : h) };
    assert.equal(calcNetStrokePlay(players, bad)[0].net, 'unavailable');
  `);
});

test('calcStrokePlay output is unchanged and players are not mutated', () => {
  run(`
    const players = [
      { id: 'a', name: 'A', handicap: 0, scores: Array(18).fill(4) },
      { id: 'b', name: 'B', handicap: 18, scores: Array(18).fill(5) },
    ];
    const snapshot = JSON.stringify(players);
    const grossBefore = calcStrokePlay(players, par4x18);
    calcNetStrokePlay(players, par4x18);
    const grossAfter = calcStrokePlay(players, par4x18);
    assert.deepEqual(grossBefore, grossAfter);
    assert.equal(JSON.stringify(players), snapshot); // pure: no mutation
    assert.ok(!('net' in grossAfter[0]));            // gross result has no net field
  `);
});
