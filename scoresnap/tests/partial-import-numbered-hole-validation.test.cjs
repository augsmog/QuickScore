const fs = require('node:fs'), ts = require('typescript');
const m = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/engine/contest-validation.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText)(id => id === './contest-results' ? { scopedAuxiliary: () => ({}) } : {}, m, m.exports);
const { validateStartSlots, validateScoreWrite, validateAuxiliaryWrite } = m.exports;
const fixture = () => ({ id: 'c', status: 'active', course: { name: 'Back nine', holes: Array.from({ length: 9 }, (_, i) => ({ num: i + 10, par: i === 2 ? 3 : 4 })) }, groups: [{ id: 'g', startSlot: { hole: 10 }, players: ['A', 'B', 'C', 'D'].map(id => ({ id, handicap: 8, scores: Array(9).fill(0) })) }], gameConfig: { rulesVersion: 1, inputRulesVersion: 1 } });
test('numbered course membership validates starts and score writes, rejecting ordinal-only holes', () => {
    const c = fixture();
    expect(() => validateStartSlots(c)).not.toThrow();
    expect(() => validateScoreWrite(c, 'g', 'A', 12, 3)).not.toThrow();
    expect(() => validateScoreWrite(c, 'g', 'A', 1, 3)).toThrow();
    c.groups[0].startSlot.hole = 1;
    expect(() => validateStartSlots(c)).toThrow();
});
test('side-game declarations and par checks use course positions for numbered back-nine holes', () => {
    const c = fixture();
    expect(() => validateAuxiliaryWrite(c, 'g', 'greenies', 12, 'A')).not.toThrow();
    expect(() => validateAuxiliaryWrite(c, 'g', 'greenies', 10, 'A')).toThrow();
    const bisque = { beforePlay: true, strokes: { A: 0, B: 0, C: 0, D: 0 } };
    expect(() => validateAuxiliaryWrite(c, 'g', 'bisque', 12, bisque)).not.toThrow();
    c.groups[0].players[0].scores[2] = 3;
    expect(() => validateAuxiliaryWrite(c, 'g', 'bisque', 12, bisque)).toThrow(/before playing/);
    expect(() => validateAuxiliaryWrite(c, 'g', 'wolf', 12, { partnerId: 'B', isLoneWolf: false, beforePlay: true })).toThrow(/after scoring/);
});
