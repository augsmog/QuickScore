const fs = require('node:fs');
const ts = require('typescript');
function mount({ online = true, actor = 'review-actor', failure } = {}) {
  const effects = [], calls = [], events = {};
  const jsx = (type, props) => ({ type, props });
  const client = {
    async rejoinHost(id) {
      calls.push(id);
      if (failure) throw failure;
      events[id] = { snapshot: { protocol: 1 }, membership: { role: 'host' } };
      return { snapshot: events[id].snapshot };
    },
    async discover() {},
  };
  const deps = {
    '../services/online-enrollment': {}, '../db/supabase': {},
    '../services/cross-device': { onlineEnabled: online, client },
    '../services/online-client': { hostOrDiscover: (api, id) => api.rejoinHost(id) },
    '../stores/auth-store': { useAuthStore: f => f({ remoteUserId: actor }) },
    '../stores/online-store': { useOnlineStore: f => f({ events }) },
    react: { useState: x => [x, () => {}], useEffect: f => effects.push(f) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'web' } },
    '../stores/contest-store': {}, '../services/guest-join': {}, './theme': { COLORS: {} },
    './LocalJoinLimitationBanner': {}, '../services/local-join-limitation': {},
    '../config/features': { CROSS_DEVICE_SHARING_ENABLED: true },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/ui/ContestJoinCode.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText)(n => { if (n in deps) return deps[n]; throw Error(n); }, mod, mod.exports);
  const render = () => mod.exports.ContestJoinCode({ contest: { id: '11111111-1111-4111-8111-111111111111', joinCode: 'ABC234' } });
  return { render, effects, calls, events };
}
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
test('a cold shared-round screen re-proves host authorization and restores its invite without enabling again', async () => {
  const h = mount();
  h.render();
  h.effects.forEach(f => f());
  await new Promise(resolve => setImmediate(resolve));
  expect(h.calls).toEqual(['11111111-1111-4111-8111-111111111111']);
  expect(nodes(h.render()).some(n => n.props?.testID === 'organizer-join-code')).toBe(true);
});
test.each([{ online: false }, { actor: null }])('offline or unsigned screens never request host restoration: %j', async options => {
  const h = mount(options); h.render(); h.effects.forEach(f => f());
  await new Promise(resolve => setImmediate(resolve));
  expect(h.calls).toEqual([]);
});
test('a transport failure never invents sharing authorization', async () => {
  const h = mount({ failure: Error('offline') }); h.render(); h.effects.forEach(f => f());
  await new Promise(resolve => setImmediate(resolve));
  expect(h.calls).toHaveLength(1);
  expect(h.events).toEqual({});
});
