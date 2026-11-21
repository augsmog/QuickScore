// AUG-1263: the PRO badge on game info must not render while pro_enabled is off.
const fs = require('node:fs');
const ts = require('typescript');
const load = () => {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/services/entitlements.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports;
};
test('no PRO badge when pro is off, any game', () => {
  const e = load(); e.setProEnabled(false);
  for (const g of ['wolf', 'skins', 'stroke_play', 'nassau']) expect(e.showProBadge(g)).toBe(false);
});
test('PRO badge only on non-free games when pro is on', () => {
  const e = load(); e.setProEnabled(true);
  expect(e.showProBadge('wolf')).toBe(true);
  expect(e.showProBadge('stroke_play')).toBe(false);
});
test('game screen uses the gated helper, not raw FREE_GAME_IDS', () => {
  const src = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
  expect(src).toContain('showProBadge(selectedGame.id)');
  expect(src).not.toContain('!FREE_GAME_IDS.includes(selectedGame.id)');
});
