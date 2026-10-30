const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    throw new Error(`unexpected import ${name}`);
  }, module, module.exports);
  return module.exports;
}
test('wipe removes versioned round events, declarations and team cards from disk and memory and suppresses late writes', async () => {
  const keys = load('src/stores/persisted-keys.ts', {});
  const disk = keys.createMemoryStorage();
  const storage = { ...disk, getAllKeys: async () => Object.keys(disk.snapshot()), multiRemove: async list => Promise.all(list.map(key => disk.removeItem(key))) };
  const store = load('src/stores/contest-store.ts', {
    '../services/ocr-review': {}, '../config/auth': { REAL_AUTH_CONFIGURED: false },
    './online-store': { useOnlineStore: { getState: () => ({ events: {} }) } },
    './auth-store': {}, '../services/guest-join': {},
    zustand: require('zustand'), 'zustand/middleware': require('zustand/middleware'),
    '@react-native-async-storage/async-storage': storage,
    './persisted-keys': keys, '../services/tournament-sync': {},
  }).useContestStore;
  await store.persist.rehydrate();
  const events = { bbb: { 1: { bingo: 'A', bango: 'B', bongo: 'A' } }, teamCards: { 1: { Red: 4, Blue: 5 } }, jokerDeclarations: { A: [1, 2] }, bisqueDeclarations: { A: { 1: 1 } } };
  const contest = { id: 'versioned', gameConfig: { rulesVersion: 1, inputRulesVersion: 1 }, groups: [{ id: 'g', players: [{ id: 'A', host: true, scores: [4] }] }], rounds: [{ id: 'r1', number: 1 }, { id: 'r2', number: 2 }], auxiliaryByScope: { 'r1/g': events, 'r2/g': events }, auxiliaryData: events };
  store.setState({ contests: [contest], activeContestId: contest.id });
  expect(JSON.parse(await disk.getItem(keys.CONTEST_STORAGE_KEY)).state.contests[0]).toEqual(contest);
  const otherStores = Object.fromEntries(['auth', 'guest', 'onboarding', 'scan', 'settings'].map(name => [`./${name}-store`, { [`use${name[0].toUpperCase() + name.slice(1)}Store`]: { setState() {}, getState: () => ({ resetToDefaults() {} }) } }]));
  const { wipeLocalAccount } = load('src/stores/wipe-local-account.ts', {
    ...otherStores, './contest-store': { useContestStore: store }, './persisted-keys': keys,
    '@react-native-async-storage/async-storage': storage, '../config/auth': { REAL_AUTH_CONFIGURED: true },
    '../db/supabase': { supabase: { auth: { signOut: async () => {
      expect(keys.persistGate.suppressed).toBe(true);
      await keys.createGatedStorage(storage).setItem(keys.CONTEST_STORAGE_KEY, JSON.stringify(contest));
    } } } },
    '../services/tournament-sync': { resetTournamentOutbox: async () => {} },
    '../services/live-chat': { resetChatSessionCache() {} },
  });
  expect(keys.PERSISTED_ACCOUNT_KEYS).toContain(keys.CONTEST_STORAGE_KEY);
  await wipeLocalAccount();
  expect(store.getState().contests).toEqual([]);
  expect(store.getState().activeContestId).toBeNull();
  expect(disk.snapshot()).toEqual({});
  await store.persist.rehydrate();
  expect(store.getState().contests).toEqual([]);
  expect(keys.persistGate.suppressed).toBe(false);
});
