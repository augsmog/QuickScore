// AUG-817 / AUG-823: the reversible pro_enabled flag. Proves both directions on the real
// entitlement policy and through the real scan-store:
//  - flag OFF (shipped default): SnapScore Pro dormant, every former paid gate open, no 3-scan cap.
//  - flag ON: current Pro-enabled contract unchanged (free gated), and Tournament Director still works.
// tierFromCustomerInfo() must stay raw under both so purchase/restore keep reflecting the real
// App Store entitlement. The flag is a mutable seam (setProEnabled) read only through the policy
// module; the EXPO_PUBLIC env read lives in src/config/pro-membership.ts and is covered separately.
// Each entitlements() load is a fresh module instance (default OFF), so tests are hermetic.
const fs = require('fs'), ts = require('typescript');
const read = p => fs.readFileSync(p, 'utf8');
function load(p, deps = {}) {
  const m = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(read(p), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText)(id => { if (id in deps) return deps[id]; throw new Error(id); }, m, m.exports);
  return m.exports;
}
const entitlements = proEnabled => {
  const e = load('src/services/entitlements.ts');
  e.setProEnabled(proEnabled);
  return e;
};
const scanStore = e => load('src/stores/scan-store.ts', {
  '../services/entitlements': e,
  './persisted-keys': load('src/stores/persisted-keys.ts'),
  zustand: require('zustand'),
  'zustand/middleware': { persist: f => f, createJSONStorage: () => ({}) },
  '@react-native-async-storage/async-storage': {},
}).useScanStore;

const MULTI_GROUP = { groups: [{}, {}] };
const MULTI_ROUND = { rounds: [{}, {}] };

test('fresh entitlements module defaults to Pro dormant (flag OFF) without any wiring', () => {
  const e = load('src/services/entitlements.ts');
  expect(e.proEnabled()).toBe(false);
  expect(e.resolveTier('free')).toBe('td');
});

describe('flag OFF (shipped default: Pro dormant, all former paid features free)', () => {
  test('every gate opens on a fresh free account', () => {
    const e = entitlements(false);
    expect(e.proEnabled()).toBe(false);
    // resolver opens everything to td so neither a Pro nor a TD paywall can appear
    expect(e.resolveTier('free')).toBe('td');
    expect(e.resolveTier('pro')).toBe('td');
    expect(e.resolveTier('td')).toBe('td');
    // every former paid gate is now free for a 'free' subscription state
    expect(e.canUseGame('skins', 'free')).toBe(true);
    for (const id of e.FREE_GAMES) expect(e.canUseGame(id, 'free')).toBe(true);
    expect(e.canSeeSettlement('free')).toBe(true);
    expect(e.canSeeStats('free')).toBe(true);
    expect(e.canHostTournament(MULTI_GROUP, 'free')).toBe(true);
    expect(e.canHostTournament(MULTI_ROUND, 'free')).toBe(true);
    expect(e.canPublishHostedContest(MULTI_GROUP, 'free')).toBe(true);
    expect(e.scanAllowance('free', new Date(2026, 9, 31)).limit).toBe(Infinity);
    expect(e.defaultRoundGames('free')).toEqual(['stroke_play', 'skins']);
    // purchase/restore integrity: tierFromCustomerInfo still reports the real (raw) entitlement
    expect(e.tierFromCustomerInfo({ entitlements: { active: {} } })).toBe('free');
    expect(e.tierFromCustomerInfo({ entitlements: { active: { 'SnapScore TD': {} } } })).toBe('td');
  });

  test('fresh free account scans are unlimited end-to-end through the real scan-store', () => {
    const s = scanStore(entitlements(false));
    expect(s.getState().tier).toBe('free'); // store keeps the raw authoritative tier
    s.getState().setTier('free');
    expect(s.getState().tier).toBe('free');
    expect(s.getState().getRemainingFreeScans()).toBe(Infinity);
    expect(s.getState().canScan()).toBe(true);
    for (let i = 0; i < 10; i++) expect(s.getState().useScan()).toBe(true);
    expect(s.getState().canScan()).toBe(true);
  });
});

describe('flag ON (Pro enabled: current contract unchanged, TD intact)', () => {
  test('free is gated exactly as before', () => {
    const e = entitlements(true);
    expect(e.proEnabled()).toBe(true);
    expect(e.resolveTier('free')).toBe('free');
    expect(e.resolveTier('pro')).toBe('pro');
    expect(e.canUseGame('skins', 'free')).toBe(false);
    for (const id of e.FREE_GAMES) expect(e.canUseGame(id, 'free')).toBe(true);
    expect(e.canSeeSettlement('free')).toBe(false);
    expect(e.canSeeStats('free')).toBe(false);
    expect(e.canHostTournament(MULTI_GROUP, 'free')).toBe(false);
    expect(e.canHostTournament(MULTI_ROUND, 'free')).toBe(false);
    expect(e.scanAllowance('free', new Date(2026, 9, 31))).toEqual({ limit: 3, monthKey: '2026-10' });
    expect(e.defaultRoundGames('free')).toEqual(['stroke_play']);
  });

  test('Tournament Director remains fully unlocked and Pro keeps its features', () => {
    const e = entitlements(true);
    for (const tier of ['pro', 'td']) {
      expect(e.canUseGame('skins', tier)).toBe(true);
      expect(e.canSeeSettlement(tier)).toBe(true);
      expect(e.defaultRoundGames(tier)).toEqual(['stroke_play', 'skins']);
    }
    expect(e.canHostTournament(MULTI_GROUP, 'td')).toBe(true);
    expect(e.canHostTournament(MULTI_ROUND, 'td')).toBe(true);
    expect(e.canHostTournament(MULTI_GROUP, 'pro')).toBe(false); // hosting shape is TD-only, unchanged
    expect(e.scanAllowance('td', new Date()).limit).toBe(Infinity);
    // purchase/restore integrity unchanged under flag on
    expect(e.tierFromCustomerInfo({ entitlements: { active: { 'SnapScore Pro': {} } } })).toBe('pro');
    expect(e.tierFromCustomerInfo({ entitlements: { active: {} } })).toBe('free');
  });

  test('free account keeps the 3-scan monthly cap through the real scan-store', () => {
    const s = scanStore(entitlements(true));
    s.setState({ scanMonth: '2026-09', scansUsed: 99 });
    expect(s.getState().getRemainingFreeScans()).toBe(3);
    for (let i = 0; i < 3; i++) expect(s.getState().useScan()).toBe(true);
    expect(s.getState().useScan()).toBe(false);
  });
});
