const fs = require('node:fs');
const ts = require('typescript');
function lookup(session, rpc) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/services/cross-device.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks = {
    './tournament-completion': { tournamentCompletion: () => ({}) },
    '../config/features': { CROSS_DEVICE_SHARING_ENABLED: true }, '../config/auth': { REAL_AUTH_CONFIGURED: true },
    '../db/supabase': { supabase: { auth: { getSession: async () => ({ data: { session } }) }, rpc,
      // Models m2_legacy_contests: protocol-1 rows are invisible even to owners.
      from: () => { const query = { select: () => query, eq: () => query, then: resolve => resolve({ data: [], error: null }) }; return query; } } },
    './online-client': { onlineClient: (_rpc, _repair, owned) => owned, foregroundRetry: () => () => {} },
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
  const error = { code: 'PGRST202' };
  await expect(lookup({ user: { id: 'owner' } }, async () => ({ error }))()).rejects.toEqual(error);
});
