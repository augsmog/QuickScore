const fs = require('node:fs');
const ts = require('typescript');

function load(path, dependencies = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', source)(id => {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unmocked dependency: ${id}`);
  }, module, module.exports);
  return module.exports;
}
const { PAYWALL_COPY: C } = load('src/ui/paywall-copy.ts');

// Exercise the production store and real persist middleware (including its version migration).
function scanStore(saved) {
  const storage = {
    getItem: jest.fn(async () => saved ? JSON.stringify(saved) : null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  };
  return load('src/stores/scan-store.ts', {
    zustand: require('zustand'),
    'zustand/middleware': require('zustand/middleware'),
    '@react-native-async-storage/async-storage': storage,
    './persisted-keys': load('src/stores/persisted-keys.ts'),
    '../services/entitlements': load('src/services/entitlements.ts'),
  }).useScanStore;
}

function settingsScreen(store) {
  const push = jest.fn(), back = jest.fn(), restore = jest.fn(async () => true);
  const states = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const Screen = load('app/settings.tsx', {
    react: {
      useState: initial => {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = value; }];
      },
      useCallback: fn => fn,
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      View: 'View', Text: 'Text', ScrollView: 'ScrollView', Switch: 'Switch',
      Alert: { alert: jest.fn() }, Linking: { openURL: jest.fn() }, Platform: { OS: 'ios' },
    },
    'expo-router': { useRouter: () => ({ push, back, replace: jest.fn() }) },
    'lucide-react-native': new Proxy({}, { get: (_, name) => `Icon:${name}` }),
    '../src/ui/SafeScreen': { SafeScreen: 'SafeScreen' },
    '../src/ui/AnimatedPressable': { AnimatedPressable: 'Pressable' },
    '../src/ui/theme': load('src/ui/theme.ts'),
    '../src/ui/paywall-copy': { PAYWALL_COPY: C },
    '../src/stores/scan-store': { useScanStore: selector => selector(store.getState()) },
    '../src/stores/settings-store': { useSettingsStore: () => ({ scoreFormat: 'gross', defaultTee: 'white' }) },
    '../src/stores/auth-store': { useAuthStore: () => ({ user: null, isAnonymous: true }) },
    '../src/services/purchases': { restorePurchases: restore },
    '../src/services/account-deletion': {}, '../src/services/delete-account': {},
    '../src/stores/wipe-local-account': {}, '../src/config/support-links': {},
    '../src/config/support': load('src/config/support.ts'),
  }).default;
  // Expand actual local row components as well as the screen, not just JSX props.
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  }
  return { render: () => { cursor = 0; return expand(Screen()); }, push, back, restore };
}
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object'
  ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
const planRow = tree => nodes(tree).find(node => node.type === 'Pressable' && text(node).startsWith('Manage plan'));
const expectPlan = (screen, label) => expect(text(planRow(screen.render()))).toBe(`Manage plan${label}`);

test.each(['free', 'pro', 'td'])('Manage plan renders the shipped %s name and preserves paywall navigation', tier => {
  const store = scanStore();
  store.getState().setTier(tier);
  const screen = settingsScreen(store);
  expectPlan(screen, C[tier]);
  planRow(screen.render()).props.onPress();
  planRow(screen.render()).props.onPress();
  expect(screen.push.mock.calls).toEqual([['/paywall'], ['/paywall']]);
  expect(screen.restore).not.toHaveBeenCalled();
  nodes(screen.render()).find(node => node.props?.accessibilityLabel === 'Back').props.onPress();
  expect(screen.back).toHaveBeenCalledTimes(1);
});

test('same screen follows upgrades, TD-to-Pro changes and expiry without altering store state', () => {
  const store = scanStore(), screen = settingsScreen(store);
  for (const tier of ['free', 'pro', 'td', 'pro', 'free', 'td']) {
    store.getState().setTier(tier);
    const before = store.getState();
    expectPlan(screen, C[tier]);
    expect(store.getState()).toBe(before);
  }
  store.getState().setPro(false);
  expectPlan(screen, C.free);
});

test.each(['free', 'pro', 'td'])('authoritative %s tier wins over stale derived entitlement flags', tier => {
  const store = scanStore();
  store.setState({ tier, isPro: tier === 'free', isTD: tier !== 'td' });
  const before = store.getState();
  expectPlan(settingsScreen(store), C[tier]);
  expect(store.getState()).toBe(before);
});

test.each([
  [{ version: 0, state: { isPro: true, scansUsed: 2 } }, 'pro'],
  [{ version: 0, state: { isPro: false } }, 'free'],
  [{ version: 0, state: { tier: 'td', isPro: true } }, 'td'],
  ...['free', 'pro', 'td'].map(tier => [{ version: 1, state: { tier, isPro: tier !== 'free', isTD: tier === 'td' } }, tier]),
])('actual persisted hydration renders %s as %s without a display-side entitlement fallback', async (saved, tier) => {
  const store = scanStore(saved), screen = settingsScreen(store);
  expectPlan(screen, C.free); // initial state while asynchronous storage is pending
  await store.persist.rehydrate();
  expect(store.persist.hasHydrated()).toBe(true);
  expectPlan(screen, C[tier]);
  expect(store.getState().tier).toBe(tier);
});
