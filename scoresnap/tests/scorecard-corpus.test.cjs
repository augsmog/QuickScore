const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
// Compile pure TS in process: no native runtime, tsx subprocess, OCR or network.
function load(file, imports = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const parser = load('src/services/score-parser.ts');
let recognized;
const ml = load('src/services/ml-kit-ocr.ts', {
  './score-parser': parser,
  '@react-native-ml-kit/text-recognition': { recognize: async () => recognized },
});
const dir = path.join(__dirname, '../test-scorecards');
const fixtures = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
for (const fixture of fixtures) {
  const run = fixture.knownBug ? test.failing : test;
  run(`${fixture.id}${fixture.knownBug ? ` [${fixture.knownBug}]` : ''}`, () => {
    const rows = fixture.grid ?? parser.textToGrid(fixture.text);
    const actual = parser.parseScoreGrid(rows);
    expect({ ...actual, players: actual.players.map(({ name, scores }) => ({ name, scores })) }).toEqual(fixture.expected);
    if (fixture.expectedError) expect(actual.players).toHaveLength(0);
    for (const player of actual.players) {
      expect(player.confidence).toHaveLength(18);
      expect(player.confidence.every(c => Number.isFinite(c) && c >= 0 && c <= 1)).toBe(true);
      if (fixture.category === 'ocr-noise') expect(player.confidence).toEqual(Array(18).fill(0.55));
    }
  });
  test(`ML Kit synthetic geometry: ${fixture.id}`, async () => {
    const rows = fixture.grid ?? parser.textToGrid(fixture.text);
    // Reverse reading order, vary y within a row, include a frameless element.
    const elements = rows.flatMap((row, y) => row.map((text, x) => ({ text, frame: { left: x * 100, top: y * 40 + x % 2, height: 20 } }))).reverse();
    recognized = { text: 'synthetic', blocks: [{ lines: [{ elements: [...elements, {text:'ignored'}] }] }] };
    const actual = await ml.recognizeWithMLKit('synthetic://no-image');
    const expected = parser.parseScoreGrid(rows);
    expect(actual.players).toEqual(expected.players);
    expect(actual.parRow).toEqual(expected.parRow);
    expect(actual.averageConfidence).toBeGreaterThanOrEqual(0);
    expect(actual.averageConfidence).toBeLessThanOrEqual(1);
  });
}
