const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');

function load(file, deps) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../' + file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(id => {
    if (!(id in deps)) throw new Error('Unexpected dependency: ' + id);
    return deps[id];
  }, module, module.exports);
  return module.exports;
}

test('completed Quick Settle contest reaches the real contest store and durable owner outbox', async () => {
  const { useContestStore } = loadStore();
  const store = useContestStore;
  const values = new Map();
  const ownerId = '11111111-1111-4111-8111-111111111111';
  let sent;
  const core = require('../src/services/quick-settle-completion.ts');
  const service = load('src/services/quick-settle-completion-sync.ts', {
    '@react-native-async-storage/async-storage': { getItem: async k => values.get(k) ?? null, setItem: async (k,v) => { values.set(k,v); } },
    'expo-crypto': { randomUUID: () => '22222222-2222-4222-8222-222222222222' },
    './quick-settle-completion': core,
    '../db/supabase': { supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: ownerId, is_anonymous: false } } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      rpc: async (name,args) => {
        assert.equal(name, 'record_quick_settle_completion');
        sent = { operationId: args.p_operation_id, ownerId: args.p_owner_id, contestId: args.p_contest_id };
        assert.equal(values.get('snapscore.quick-settle-completion.v1.' + ownerId) !== undefined, true,
          'durable operation exists before RPC send');
        assert.equal(store.getState().contests.find(c => c.id === args.p_contest_id)?.status, 'completed');
        return { data: { operationId: args.p_operation_id, ownerId: args.p_owner_id }, error: null };
      },
    } },
  });
const contest = {
  id: '33333333-3333-4333-8333-333333333333', name: 'Monday Round',
  course: { name: 'Scanned Course', holes: Array.from({length:18}, (_,i) => ({num:i+1,par:4,hcp:i+1})) },
  status: 'completed', betUnit: 5, hasTeams: false,
  groups: [{ id: 'g1', name: 'Group 1', players: [{ id: 'p1', name: 'Player A', handicap: 0, team: null, scores: Array(18).fill(4) }] }],
  games: ['stroke_play'], createdAt: new Date(0).toISOString(),
};
  store.getState().addContest(contest); // Real store with the production contest validator.
  await service.enqueueQuickSettleCompletion(contest.id, ownerId);
  assert.equal(sent.ownerId, ownerId);
  assert.equal(sent.contestId, contest.id);
  assert.equal((await core.quickSettleCompletionOutbox({
    storage: { getItem: async k => values.get(k) ?? null, setItem: async (k,v) => { values.set(k,v); } },
    identity: async () => ({ ownerId, epoch: 0 }), send: async () => { throw Error('read only inspect'); }, uuid: () => 'unused',
  }).inspect(ownerId)).operations.length, 0, 'matching RPC acknowledgment clears after success');
});

function loadStore() {
  const module = { exports: {} };
  const deps = {
    './online-store': { useOnlineStore: { getState: () => ({ events: {} }) } },
    './scan-store': { useScanStore: { getState: () => ({ tier: 'free' }) } },
    '../services/ocr-review': {}, '../config/auth': { REAL_AUTH_CONFIGURED: false },
    './auth-store': { useAuthStore: { getState: () => ({}) } },
    '../services/guest-join': { generateJoinCode: () => 'LOCAL234' },
    'zustand': require('zustand'), 'zustand/middleware': { persist: fn => fn, createJSONStorage: () => ({}) },
    '@react-native-async-storage/async-storage': {},
    './persisted-keys': { CONTEST_STORAGE_KEY: 'test-contests', createGatedStorage: storage => storage },
    '../services/tournament-sync': {}, '../engine/contest-validation': require('../src/engine/contest-validation.ts'),
    '../engine/contest-results': require('../src/engine/contest-results.ts'),
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/stores/contest-store.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)((id) => {
    if (!(id in deps)) throw new Error('Unexpected contest-store dependency: ' + id);
    return deps[id];
  }, module, module.exports);
  return module.exports;
}
