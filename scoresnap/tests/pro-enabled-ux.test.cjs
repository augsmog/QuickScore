const fs = require('node:fs');
const ts = require('typescript');

function load(path) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', source)(id => {
    if (id === '../ui/paywall-copy') return {};
    throw new Error(`Unexpected dependency: ${id}`);
  }, module, module.exports);
  return module.exports;
}

const entitlements = load('src/services/entitlements.ts');
const scan = fs.readFileSync('app/scan/index.tsx', 'utf8');
const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');

test.each([false, true])('Scan Pro affordances and route guard follow pro_enabled=%s', enabled => {
  entitlements.setProEnabled(enabled);
  expect(scan).toContain('import { proEnabled } from "../../src/services/entitlements";');
  expect(scan).toContain('{proIsEnabled && !isPro && (');
  expect(scan).toContain('{proIsEnabled && phase === "paywall" && (');
  expect(entitlements.proEnabled()).toBe(enabled);
  expect(entitlements.scanAllowance('free', new Date('2026-11-10T12:00:00Z')).limit)
    .toBe(enabled ? 3 : Infinity);
});

test.each([false, true])('Home game CTA cannot route to the Pro paywall when pro_enabled=%s', enabled => {
  entitlements.setProEnabled(enabled);
  expect(home).toContain('if (proEnabled() && !canUseGame(selectedGame.id, tier))');
  expect(home).toContain('{proEnabled() && !canUseGame(selectedGame.id, tier) ? "Try Pro with" : "Play"}');
  expect(entitlements.proEnabled()).toBe(enabled);
  expect(entitlements.canUseGame('skins', 'free')).toBe(enabled ? false : true);
});
