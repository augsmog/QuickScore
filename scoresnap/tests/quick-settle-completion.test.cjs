const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { quickSettleCompletionOutbox } = require('../src/services/quick-settle-completion.ts');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ownerKey = id => `snapscore.quick-settle-completion.v1.${id}`;
function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
  };
}

test('Quick Settle outbox persists first, isolates identity, deduplicates, and enforces exact acknowledgments and retry bound', async () => {
  const storage = memoryStorage();
  let identity = { ownerId: A, epoch: 1 }, sequence = 0, sends = [], mode = 'fail';
  const outbox = quickSettleCompletionOutbox({
    storage, identity: async () => identity, uuid: () => 'op-' + (++sequence), maxAttempts: 3,
    send: async op => {
      const saved = JSON.parse(storage.values.get(ownerKey(op.ownerId)));
      assert.equal(saved.operations.find(x => x.operationId === op.operationId).attempts, op.attempts);
      sends.push({ ...op });
      if (mode === 'fail') throw Error('offline');
      if (mode === 'switch') { identity = { ownerId: B, epoch: 2 }; return { operationId: op.operationId, ownerId: op.ownerId }; }
      if (mode === 'wrong-ack') return { operationId: 'newer-op', ownerId: op.ownerId };
      return { operationId: op.operationId, ownerId: op.ownerId };
    },
  });
  await outbox.enqueue('contest-a', identity);
  assert.equal(sends.length, 3, 'maximum total attempts is three');
  assert.deepEqual((await outbox.inspect(A)).operations.map(o => o.attempts), [3]);
  mode = 'ok'; await outbox.flush();
  assert.equal(sends.length, 3, 'exhausted operation is not retried on a later flush');

  // A completion captures owner A when invoked, even if it must wait behind another send.
  let releaseFirst, startedFirst;
  const firstStarted = new Promise(resolve => { startedFirst = resolve; });
  const firstWait = new Promise(resolve => { releaseFirst = resolve; });
  identity = { ownerId: A, epoch: 3 };
  const queuedStorage = memoryStorage(), queuedSends = [];
  const queued = quickSettleCompletionOutbox({
    storage: queuedStorage, identity: async () => identity, uuid: () => 'queued-' + (++sequence),
    send: async op => {
      queuedSends.push({ ...op });
      if (op.contestId === 'first-A') { startedFirst(); await firstWait; }
      return { operationId: op.operationId, ownerId: op.ownerId };
    },
  });
  const first = queued.enqueue('first-A', identity);
  await firstStarted;
  const capturedForA = { ...identity };
  const second = queued.enqueue('created-by-A', capturedForA);
  identity = { ownerId: B, epoch: 4 };
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(queuedSends.some(op => op.contestId === 'created-by-A'), false, 'A operation is not sent through B');
  assert.equal((await queued.inspect(A)).operations.some(op => op.contestId === 'created-by-A'), true, 'A operation remains in A outbox');
  assert.equal((await queued.inspect(B)).operations.some(op => op.contestId === 'created-by-A'), false, 'A operation is never rebound to B');

  identity = { ownerId: A, epoch: 5 }; mode = 'wrong-ack';
  const staleStorage = memoryStorage(), wrongAckSends = [];
  const stale = quickSettleCompletionOutbox({
    storage: staleStorage, identity: async () => identity, uuid: () => 'stale-op', maxAttempts: 3,
    send: async op => {
      const saved = JSON.parse(staleStorage.values.get(ownerKey(op.ownerId)));
      assert.equal(saved.operations.find(x => x.operationId === op.operationId).attempts, op.attempts);
      wrongAckSends.push(op.operationId);
      return { operationId: 'newer-op', ownerId: op.ownerId };
    },
  });
  await stale.enqueue('stale-ack-contest', identity);
  assert.deepEqual(wrongAckSends, ['stale-op', 'stale-op', 'stale-op']);
  assert.equal((await stale.inspect(A)).operations[0].attempts, 3, 'a stale ack never clears the pending operation');

  identity = { ownerId: A, epoch: 6 }; mode = 'ok';
  const successStorage = memoryStorage(); let successSends = 0;
  const success = quickSettleCompletionOutbox({ storage: successStorage, identity: async () => identity,
    uuid: () => 'success-op', send: async op => { successSends++; return { operationId: op.operationId, ownerId: op.ownerId }; } });
  await success.enqueue('once', identity);
  await success.enqueue('once', identity);
  assert.equal(successSends, 1, 'matching ack stops retries and deduplicates a repeated completed contest');
  assert.deepEqual((await success.inspect(A)).completedContestIds, ['once']);
  identity = null;
  assert.equal(await success.enqueue('anonymous', null), false);
});

test('production completion adapter checks owner and persists before invoking the RPC', async () => {
  const storage = memoryStorage(); let owner = A, onAuthChange, calls = [], id = 0;
  const module = { exports: {} };
  const core = require('../src/services/quick-settle-completion.ts');
  const deps = {
    '@react-native-async-storage/async-storage': storage,
    'expo-crypto': { randomUUID: () => '00000000-0000-4000-8000-' + String(++id).padStart(12, '0') },
    './quick-settle-completion': core,
    '../db/supabase': { supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: owner, is_anonymous: false } } }, error: null }),
        onAuthStateChange: fn => { onAuthChange = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      },
      rpc: async (name, args) => {
        const box = JSON.parse(storage.values.get(ownerKey(args.p_owner_id)));
        assert.equal(box.operations[0].operationId, args.p_operation_id);
        assert.equal(owner, args.p_owner_id);
        calls.push({ name, ...args });
        return { data: { operationId: args.p_operation_id, ownerId: args.p_owner_id }, error: null };
      },
    } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/quick-settle-completion-sync.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(request => {
    if (!(request in deps)) throw Error('Unexpected adapter dependency: ' + request);
    return deps[request];
  }, module, module.exports);
  assert.equal(typeof onAuthChange, 'function');
  await module.exports.enqueueQuickSettleCompletion('33333333-3333-4333-8333-333333333333', A);
  assert.equal(calls[0].name, 'record_quick_settle_completion');
  assert.equal(calls[0].p_owner_id, A);
  owner = B;
  await module.exports.enqueueQuickSettleCompletion('44444444-4444-4444-8444-444444444444', A);
  assert.equal(calls.length, 1, 'captured owner A work is not sent in B session');
  onAuthChange('SIGNED_IN', { user: { id: B } });
});
