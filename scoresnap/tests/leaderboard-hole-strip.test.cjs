const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadTs(file) {
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = { exports: {} };
  new Function('module', 'exports', output)(loaded, loaded.exports);
  return loaded.exports;
}

const { lastThreePlayedHoleChips } = loadTs(path.join(__dirname, '../src/ui/leaderboard-hole-strip.ts'));

test('classifies birdie, par, bogey, and double-plus shapes and fills', () => {
  const chips = lastThreePlayedHoleChips([3, 4, 5, 6], [{ par: 4 }, { par: 4 }, { par: 4 }, { par: 4 }]);
  expect(chips.map(({ difference, shape, color, filled }) => ({ difference, shape, color, filled }))).toEqual([
    { difference: -1, shape: 'circle', color: 'primary', filled: true },
    { difference: 0, shape: 'circle', color: 'primary', filled: false },
    { difference: 1, shape: 'square', color: 'primary', filled: false },
    { difference: 2, shape: 'square', color: 'error', filled: true },
  ].slice(-3));
});

test.each([
  { score: 3, par: 4, shape: 'circle', color: 'primary', filled: true },
  { score: 4, par: 4, shape: 'circle', color: 'primary', filled: false },
  { score: 5, par: 4, shape: 'square', color: 'primary', filled: false },
  { score: 6, par: 4, shape: 'square', color: 'error', filled: true },
  { score: 7, par: 4, shape: 'square', color: 'error', filled: true },
])('maps score $score on par $par to $shape/$color/filled=$filled', ({ score, par, ...expected }) => {
  expect(lastThreePlayedHoleChips([score], [{ par }])).toMatchObject([{ score, ...expected }]);
});

test('partial rounds return only played chips and no placeholders', () => {
  const chips = lastThreePlayedHoleChips([4, 0, 5], [{ par: 4 }, { par: 3 }, { par: 4 }]);
  expect(chips).toHaveLength(2);
  expect(chips.map(({ index, score }) => ({ index, score }))).toEqual([{ index: 0, score: 4 }, { index: 2, score: 5 }]);
});
