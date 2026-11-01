const fs = require('node:fs');
const ts = require('typescript');
function lookup(session, rpc, contests = [], realClient = false, repair = () => {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/services/cross-device.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks = {
    '../stores/contest-store': { useContestStore: { getState: () => ({ contests }) } },
    './tournament-completion': { tournamentCompletion: () => ({}) },
    '../config/features': { CROSS_DEVICE_SHARING_ENABLED: true }, '../config/auth': { REAL_AUTH_CONFIGURED: true },
    '../db/supabase': { supabase: { auth: { getSession: async () => ({ data: { session } }) }, rpc,
      // Models m2_legacy_contests: protocol-1 rows are invisible even to owners.
      from: () => { const query = { select: () => query, eq: () => query, then: resolve => resolve({ data: [], error: null }) }; return query; } } },
    './online-client': realClient ? (() => {
      function load(file) {
        const target = { exports: {} };
        const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        new Function('require', 'module', 'exports', js)(name => load(require('node:path').resolve(require('node:path').dirname(file), name + '.ts')), target, target.exports);
        return target.exports;
      }
      const actual = load(require('node:path').resolve('src/services/online-client.ts'));
      return { ...actual, onlineClient: (rpc, _repair, owned) => actual.onlineClient(rpc, repair, owned) };
    })() : { onlineClient: (_rpc, _repair, owned) => owned, foregroundRetry: () => () => {} },
  };
  new Function('require', 'module', 'exports', code)(name => mocks[name] ?? {}, module, module.exports);
  return module.exports.client;
}
test('fresh owner lookup uses authorized enumeration despite restrictive legacy table RLS', async () => {
  const rpc = jest.fn(async () => ({ data: [{ id: 'owned' }], error: null }));
  expect(await lookup({ user: { id: 'owner', is_anonymous: false } }, rpc)()).toEqual([{ id: 'owned' }]);
  expect(rpc).toHaveBeenCalledWith('list_owned_contests', { code: null });
});
test('own-code lookup passes code to owner-only server proof', async () => {
  const rpc = jest.fn(async () => ({ data: [{ id: 'owned' }], error: null }));
  expect(await lookup({ user: { id: 'owner' } }, rpc)('ABC234')).toEqual([{ id: 'owned' }]);
  expect(rpc).toHaveBeenCalledWith('list_owned_contests', { code: 'ABC234' });
});
test.each([null, { user: { id: 'guest', is_anonymous: true } }])('no owner enumeration without ordinary session: %p', async session => {
  const rpc = jest.fn(); expect(await lookup(session, rpc)()).toEqual([]); expect(rpc).not.toHaveBeenCalled();
});
test('enumeration errors propagate rather than pretending there are no owned contests', async () => {
  const error = { code: '42501' };
  await expect(lookup({ user: { id: 'owner' } }, async () => ({ error }))()).rejects.toEqual(error);
});

test.each([{ code: 'PGRST202' }, { code: '42883' }, { status: 404 }])('missing owner RPC is cached for discovery and code lookup: %p', async error => {
  const rpc = jest.fn(async () => ({ error }));
  const read = lookup({ user: { id: 'owner' } }, rpc);
  expect(await read()).toEqual([]);
  expect(await read('ABC234')).toEqual([]);
  expect(await read()).toEqual([]);
  expect(rpc).toHaveBeenCalledTimes(1);
});
test('missing RPC uses local code as a hint for subsequent server host proof', async () => {
  const rpc = jest.fn(async () => ({ error: { code: 'PGRST202' } }));
  const read = lookup({ user: { id: 'owner' } }, rpc, [{ id: 'local', joinCode: 'ABC234' }]);
  expect(await read('ABC234')).toEqual([{ id: 'local', legacyHint: true }]);
});
test('concurrent missing capability checks share one probe', async () => {
  let finish;
  const rpc = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const read = lookup({ user: { id: 'owner' } }, rpc);
  const a = read(), b = read();
  await new Promise(resolve => setImmediate(resolve));
  expect(rpc).toHaveBeenCalledTimes(1);
  finish({ error: { code: 'PGRST202' } });
  expect(await Promise.all([a, b])).toEqual([[], []]);
});

function liveRpc(host = false) {
  const cap = { api_version: 1, contract: 'snapscore-sync-v1', protocol: 1, enabled: true, channel: { private: true, event: 'revision', topic: 'snapscore:c' } };
  return jest.fn(async name => {
    if (name === 'list_owned_contests') return { error: { code: 'PGRST202' } };
    if (name === 'list_join_requests') return host ? { data: [] } : { error: { code: '42501' } };
    if (name === 'my_sync_status') return { data: { api_version: 1, memberships: host ? [] : [{ contest_id: 'c', role: 'player', status: 'approved', player_id: 'p' }], requests: [] } };
    if (name === 'my_membership') return { data: { role: 'player', status: 'approved', player_id: 'p' } };
    if (name === 'sync_capabilities') return { data: cap };
    if (name === 'fetch_snapshot') return { data: { contest_id: 'c', revision: 1, rounds: [], capabilities: cap } };
    throw Error('Unexpected RPC ' + name);
  });
}
test('live schema still restores existing memberships and caches unavailable owner RPC', async () => {
  const rpc = liveRpc(), repair = jest.fn();
  const api = lookup({ user: { id: 'member' } }, rpc, [], true, repair);
  await api.discover(); await api.discover();
  expect(repair).toHaveBeenCalledWith('c', expect.objectContaining({ role: 'player' }), expect.objectContaining({ contest_id: 'c' }));
  expect(rpc.mock.calls.filter(([name]) => name === 'list_owned_contests')).toHaveLength(1);
});
test.each([true, false])('live local code restores authorized host/member without request: host=%p', async host => {
  const rpc = liveRpc(host), repair = jest.fn();
  const api = lookup({ user: { id: 'actor' } }, rpc, [{ id: 'c', joinCode: 'ABC234' }], true, repair);
  expect(await api.joinCode('abc234', '')).toBe('c');
  expect(repair).toHaveBeenCalledWith('c', expect.objectContaining({ role: host ? 'host' : 'player' }), expect.any(Object));
  expect(rpc.mock.calls.some(([name]) => name === 'request_join')).toBe(false);
});
test.each(['nonowner', 'owner'])('live fresh %s code preserves main request flow exactly once', async actor => {
  const base = liveRpc(true);
  const rpc = jest.fn(async (...args) => args[0] === 'request_join' ? { data: { status: 'pending' } } : base(...args));
  const api = lookup({ user: { id: actor } }, rpc, [], true);
  expect(await api.joinCode('abc234', ' Reviewer ')).toBeNull();
  expect(rpc.mock.calls.filter(([name]) => name === 'request_join')).toEqual([
    ['request_join', { code: 'ABC234', display_name: 'Reviewer' }],
  ]);
  expect(rpc.mock.calls.filter(([name]) => name === 'list_owned_contests')).toHaveLength(1);
});
test('a new session retries capability and can restore with newly available RPC', async () => {
  const session = { access_token: 'test-session-one', user: { id: 'owner' } };
  const rpc = jest.fn().mockResolvedValueOnce({ error: { code: 'PGRST202' } }).mockResolvedValue({ data: [{ id: 'owned' }] });
  const read = lookup(session, rpc);
  expect(await read()).toEqual([]);
  expect(await read()).toEqual([]);
  session.access_token = 'test-session-two';
  expect(await read()).toEqual([{ id: 'owned' }]);
  expect(rpc).toHaveBeenCalledTimes(2);
});
test('HTTP 404 response caches capability even without an error status field', async () => {
  const rpc = jest.fn(async () => ({ status: 404, error: { message: 'Not found' } }));
  const read = lookup({ user: { id: 'owner' } }, rpc);
  expect(await read()).toEqual([]); expect(await read()).toEqual([]);
  expect(rpc).toHaveBeenCalledTimes(1);
});
test('live local hint host transport failure never creates a request', async () => {
  const base = liveRpc(true);
  const rpc = jest.fn(async (...args) => args[0] === 'list_join_requests' ? { error: { message: 'network' } } : base(...args));
  const api = lookup({ user: { id: 'owner' } }, rpc, [{ id: 'c', joinCode: 'ABC234' }], true);
  await expect(api.joinCode('ABC234', 'Owner')).rejects.toEqual({ message: 'network' });
  expect(rpc.mock.calls.some(([name]) => name === 'request_join')).toBe(false);
});
