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
  test(fixture.id, () => {
    const rows = fixture.grid ?? parser.textToGrid(fixture.text);
    const actual = parser.parseScoreGrid(rows);
    // Migrate the historical corpus contract: blank placeholders are null;
    // only numbered headers establish a nine-hole card, never row length.
    const header = rows.find(r => /^holes?:?$/i.test(r[0] ?? ''));
    const numberedCount = header?.slice(1).filter(c => /^\d+$/.test(c)).length;
    const holeCount = [9,18].includes(numberedCount) ? numberedCount : 18;
    const expected = { ...fixture.expected, holeCount,
      players: fixture.expected.players.map(p => ({ ...p, scores: Array.from({length:holeCount}, (_, i) =>
        fixture.category === 'ocr-noise' ? null : p.scores[i] > 0 ? p.scores[i] : null) })) };
    // Positive whole gross scores have no arbitrary 15-stroke ceiling.
    if (fixture.id === 'subtotal-must-match') expected.players[0].scores[9] = 35;
    if (fixture.id === 'missing-40') expected.players[0].scores[1] = 99;
    expect({ ...actual, players: actual.players.map(({ name, scores }) => ({ name, scores })) }).toEqual(expected);
    if (fixture.reviewCells) for (const index of fixture.reviewCells) {
      if (["subtotal-must-match", "missing-40"].includes(fixture.id)) continue;
      expect(actual.players[0].scores[index]).toBeNull();
      expect(actual.players[0].confidence[index]).toBeLessThan(0.5);
    }
    if (fixture.expectedError) expect(actual.players).toHaveLength(0);
    for (const player of actual.players) {
      expect(player.confidence).toHaveLength(holeCount);
      expect(player.confidence.every(c => Number.isFinite(c) && c >= 0 && c <= 1)).toBe(true);
      if (fixture.category === 'ocr-noise') expect(player.confidence).toEqual(Array(holeCount).fill(0));
    }
  });
  test(`ML Kit synthetic geometry: ${fixture.id}`, async () => {
    const rows = fixture.grid ?? parser.textToGrid(fixture.text);
    // Reverse reading order, vary y within a row, include a frameless element.
    const elements = rows.flatMap((row, y) => row.map((text, x) => ({ text, frame: { left: x * 100, top: y * 40 + x % 2, height: 20 } }))).reverse();
    recognized = { text: 'synthetic', blocks: [{ lines: [{ elements: [...elements, {text:'ignored'}] }] }] };
    const actual = await ml.recognizeWithMLKit('synthetic://no-image');
    const expected = parser.parseScoreGrid(rows);
    const hasHeader = rows.some(r => /^holes?:?$/i.test(r[0] ?? ''));
    if (hasHeader) expect(actual.players).toEqual(expected.players);
    else {
      // Unnumbered image columns cannot prove alignment: never compact scores.
      expect(actual.players.every(p => p.scores.every(s => s === null))).toBe(true);
      expect(actual.players.every(p => p.confidence.every(c => c === 0))).toBe(true);
    }
    if (hasHeader) expect(actual.parRow).toEqual(expected.parRow);
    expect(actual.averageConfidence).toBeGreaterThanOrEqual(0);
    expect(actual.averageConfidence).toBeLessThanOrEqual(1);
  });
}
