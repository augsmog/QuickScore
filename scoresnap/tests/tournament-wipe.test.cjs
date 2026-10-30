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
  const rpc = jest.fn(async () => { await wait('rpc'); return { data: { status: 'offline' }, error: null }; });
  const plan = load('src/services/tournament-sync-plan.ts', {});
  let box = plan.rememberBundle(plan.emptyOutbox(), 'round', { round_id: 'remote', groups: [{ players: [{ local_id: 'player', id: 'remote-player' }] }] });
  for (let hole = 1; hole <= 2; hole++) box = plan.enqueueScore(box, { contestId: 'contest', roundLocalId: 'round', roundNumber: 1, playerLocalId: 'player', hole, strokes: 4 }, `old-${hole}`);
  disk.set(key, JSON.stringify(box));
  const sync = load('src/services/tournament-sync.ts', {
    '@react-native-async-storage/async-storage': {
      getItem: async () => { const raw = disk.get(key) ?? null; await wait('read'); return raw; },
      setItem: async (k, v) => { await wait('write'); disk.set(k, v); },
    },
    'expo-crypto': { randomUUID: () => 'new-op' }, '../config/auth': { REAL_AUTH_CONFIGURED: true },
    '../db/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: {} } } }) }, rpc } },
    '../stores/persisted-keys': keys, './tournament-sync-plan': plan,
  });
  const wipe = load('src/stores/wipe-local-account.ts', {
    '@react-native-async-storage/async-storage': { multiRemove: async list => list.forEach(k => disk.delete(k)) },
    '../config/auth': { REAL_AUTH_CONFIGURED: false }, '../db/supabase': {},
    '../services/live-chat': { resetChatSessionCache() {} }, '../services/tournament-sync': sync,
    './persisted-keys': keys,
    ...Object.fromEntries(['auth', 'contest', 'guest', 'onboarding', 'scan', 'settings'].map(name => [`./${name}-store`, { [`use${name[0].toUpperCase() + name.slice(1)}Store`]: { setState() {}, getState: () => ({ resetAll() {}, resetToDefaults() {} }) } }])),
  }).wipeLocalAccount;
  const tick = () => new Promise(resolve => setImmediate(resolve));
  let active;
  if (kind === 'loaded') await sync.syncScore('contest', 'round', 'player', 3, 4);
  else { active = kind === 'write' ? sync.syncScore('contest', 'round', 'player', 3, 4) : sync.flushTournamentOutbox(); await tick(); }
  const wiping = wipe();
  await tick();
  paused = '';
  pending.splice(0).forEach(fn => fn());
  await Promise.all([wiping, active]);
  expect(disk.has(key)).toBe(false);
  if (kind === "read" || kind === "write") expect(rpc).not.toHaveBeenCalled();
  if (kind === "rpc") expect(rpc).toHaveBeenCalledTimes(1);
  const before = rpc.mock.calls.length;
  await sync.flushTournamentOutbox();
  expect(rpc.mock.calls.length).toBe(before);
  expect(JSON.parse(disk.get(key)).ops).toEqual([]);
});
