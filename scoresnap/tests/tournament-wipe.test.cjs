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
test.each(['loaded', 'read', 'write', 'rpc'])('wipe clears tournament disk/memory during %s', async kind => {
  const disk = new Map(), pending = [];
  const keys = load('src/stores/persisted-keys.ts', {});
  const key = 'snapscore.tournament.outbox';
  let paused = kind;
  const wait = async phase => { if (paused === phase) await new Promise(resolve => pending.push(resolve)); };
  const rpc = jest.fn(async () => { await wait('rpc'); return { data: { round_id: 'remote', groups: [] }, error: null }; });
  const plan = load('src/services/tournament-sync-plan.ts', {});
  disk.set(key, JSON.stringify(plan.emptyOutbox()));
  const scopedKey = 'snapscore.tournament.id-map.v1.actor.contest';
  disk.set(scopedKey, JSON.stringify(plan.emptyOutbox()));
  const sync = load('src/services/tournament-sync.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async k => { const raw = disk.get(k) ?? null; if (k === scopedKey) await wait('read'); return raw; },
      setItem: async (k, v) => { await wait('write'); disk.set(k, v); },
    },
    '../stores/online-store': { useOnlineStore: { getState: () => ({ events: {} }) } },
    '../stores/contest-store': { useContestStore: { getState: () => ({ contests: [] }) } },
    '../config/features': { CROSS_DEVICE_SHARING_ENABLED: true },
    './cross-device': { remoteIdentity: async () => 'actor', requireSyncCapability: async () => {}, replayOnlineScores: async () => {}, resetOnlineQueues: async () => {} },
    'expo-crypto': { randomUUID: () => 'new-op' }, '../config/auth': { REAL_AUTH_CONFIGURED: true },
    '../db/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: {} } } }) }, rpc } },
    '../stores/persisted-keys': keys, './tournament-sync-plan': plan,
  });
  const wipe = load('src/stores/wipe-local-account.ts', {
    './settlement-store': { settlementMarks: { getState: () => ({ reset() {} }), flush: async () => {} } },
    '../services/purchases': { logOutPurchases: async () => {} },
    '@react-native-async-storage/async-storage': { getAllKeys: async () => [...disk.keys()], multiRemove: async list => list.forEach(k => disk.delete(k)) },
    '../config/auth': { REAL_AUTH_CONFIGURED: false }, '../db/supabase': {},
    '../services/live-chat': { resetChatSessionCache() {} }, '../services/tournament-sync': sync,
    './persisted-keys': keys,
    ...Object.fromEntries(['auth', 'contest', 'guest', 'onboarding', 'scan', 'settings'].map(name => [`./${name}-store`, { [`use${name[0].toUpperCase() + name.slice(1)}Store`]: { setState() {}, getState: () => ({ resetAll() {}, resetToDefaults() {} }) } }])),
  }).wipeLocalAccount;
  const tick = () => new Promise(resolve => setImmediate(resolve));
  let active;
  const round = { id: 'round', number: 1, groups: [] };
  if (kind === 'loaded') await sync.syncRound('contest', round);
  else { active = sync.syncRound('contest', round); await tick(); }
  expect(pending).toHaveLength(kind === 'loaded' ? 0 : 1);
  if (kind === 'loaded') expect(rpc).toHaveBeenCalledTimes(1);
  const wiping = wipe();
  await tick();
  paused = '';
  pending.splice(0).forEach(fn => fn());
  await Promise.all([wiping, active]);
  expect(disk.has(key)).toBe(false);
  if (kind === "read") expect(rpc).not.toHaveBeenCalled();
  if (kind === "rpc" || kind === "write") expect(rpc).toHaveBeenCalledTimes(1);
  const before = rpc.mock.calls.length;
  await sync.flushTournamentOutbox();
  expect(rpc.mock.calls.length).toBe(before);
  expect(disk.has(scopedKey)).toBe(false);
});


test.each(['read', 'write', 'rpc'])('deletion drains identity-scoped score queue during %s', async phase => {
  const disk = new Map(), pending = [];
  const keys = load('src/stores/persisted-keys.ts', {});
  let paused = '';
  const wait = async at => { if (paused === at) await new Promise(resolve => pending.push(resolve)); };
  const rpc = jest.fn(async name => {
    if (name === 'sync_capabilities') return { data: { protocol: 1 } };
    await wait('rpc');
    return { data: { status: 'accepted', version: 1, strokes: 4, revision: 1 } };
  });
  const sync = load('src/services/cross-device.ts', {
    '../stores/persisted-keys': keys,
    './tournament-completion': { tournamentCompletion: () => ({}) },
    './sync-v1': { loadSyncCapability: async () => ({}) },
    './online-client': { foregroundRetry: () => {}, onlineClient: () => ({}) },
    'react-native': { Platform: { OS: 'ios' } }, 'expo-crypto': { randomUUID: () => 'op' },
    '../db/supabase': { supabase: { rpc, auth: { getSession: async () => ({ data: { session: { user: { id: 'actor' } } } }) } } },
    '../db/outbox-storage': { outboxStorage: {
      getItem: async key => { const value = disk.get(key) ?? null; await wait('read'); return value; },
      setItem: async (key, value) => { await wait('write'); disk.set(key, value); },
      clear: async () => disk.clear(),
    } },
    '../config/features': { CROSS_DEVICE_SHARING_ENABLED: true }, '../config/auth': { REAL_AUTH_CONFIGURED: true },
    './captcha': {}, './score-outbox': load('src/services/score-outbox.ts', {}),
    '../stores/online-store': { useOnlineStore: {} },
  });
  const draft = { contest_id: 'contest', round_id: 'round', player_id: 'player', hole: 1, strokes: 4, action: 'set' };
  if (phase === 'rpc') await sync.queueOnlineScore(draft, 0);
  paused = phase;
  const work = phase === 'rpc' ? sync.replayOnlineScores() : sync.queueOnlineScore(draft, 0);
  await new Promise(resolve => setImmediate(resolve));
  keys.persistGate.suppressed = true;
  const reset = sync.resetOnlineQueues();
  await new Promise(resolve => setImmediate(resolve));
  paused = '';
  pending.splice(0).forEach(fn => fn());
  await Promise.all([reset, work]);
  keys.persistGate.suppressed = false;
  expect(disk.size).toBe(0);
  expect(rpc.mock.calls.filter(([name]) => name === 'write_score')).toHaveLength(phase === 'rpc' ? 1 : 0);
  await sync.replayOnlineScores();
  expect(rpc.mock.calls.filter(([name]) => name === 'write_score')).toHaveLength(phase === 'rpc' ? 1 : 0);
});
