const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync('src/ui/hole-nav.ts', 'utf8');
const moduleRecord = { exports: {} };
new Function('module', 'exports', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(moduleRecord, moduleRecord.exports);
const { playersNeedingPar, allScoredOnHole } = moduleRecord.exports;

const players = (...scores) => scores.map((s, i) => ({ id: `p${i}`, scores: [s] }));

test('playersNeedingPar finds every player with no score (or 0) on the current hole', () => {
  const found = playersNeedingPar(players(4, 0, 5), 1);
  expect(found.map((p) => p.id)).toEqual(['p1']);
});

test('playersNeedingPar is empty once every player has a score', () => {
  expect(playersNeedingPar(players(3, 4, 5), 1)).toEqual([]);
});

test('allScoredOnHole agrees with playersNeedingPar', () => {
  expect(allScoredOnHole(players(4, 0), 1)).toBe(false);
  expect(allScoredOnHole(players(4, 4), 1)).toBe(true);
});
