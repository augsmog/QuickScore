// AUG-1369: Tournament Director — the only live IAP — was unreachable from the main flow.
// Pro is dormant (AUG-817), so Settings showed no subscription entry to a free account and the
// only routes to /paywall?tier=td lived inside the contest-edit flow. This suite pins the fix:
// a persistent "Tournament Director" row in Settings → Subscription that routes every non-TD tier
// to the TD paywall, without reintroducing a dormant-Pro surface (AUG-1263). It reuses the real
// settings screen, scan-store, persist middleware and entitlement policy (no re-mocked copy).
const fs = require('node:fs');
const ts = require('typescript');

function load(path, dependencies = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', source)(id => {
    if (id === '@/services/platform-alert') return { showAlert: () => {} };
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

function settingsScreen(store, proEnabled = true) {
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
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) },
    '../src/ui/settings-layout': load('src/ui/settings-layout.ts'),
    '../src/ui/AnimatedPressable': { AnimatedPressable: 'Pressable' },
    '../src/ui/theme': load('src/ui/theme.ts'),
    '../src/ui/paywall-copy': { PAYWALL_COPY: C },
    '../src/services/entitlements': { proEnabled: () => proEnabled },
    '../src/stores/scan-store': { useScanStore: selector => selector(store.getState()) },
    '../src/stores/settings-store': { useSettingsStore: () => ({ scoreFormat: 'gross', defaultTee: 'white' }) },
    '../src/stores/auth-store': { useAuthStore: () => ({ user: null, isAnonymous: true }) },
    '../src/services/purchases': { restorePurchases: restore },
    '../src/services/account-deletion': {}, '../src/services/delete-account': {},
    '../src/stores/wipe-local-account': {}, '../src/config/support-links': {},
    '../src/config/support': load('src/config/support.ts'),
  }).default;
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
const tdRow = tree => nodes(tree).find(node => node.type === 'Pressable' && node.props?.accessibilityLabel === C.td);
const planRow = tree => nodes(tree).find(node => node.type === 'Pressable' && text(node).startsWith('Manage plan'));

// The persistent TD entry is reachable for every non-TD tier regardless of the dormant Pro flag,
// and it routes to the TD paywall (tier=td), never the generic /paywall.
describe.each([false, true])('pro_enabled=%s', proEnabled => {
  test.each(['free', 'pro'])('%s sees a Tournament Director row routing to the TD paywall', tier => {
    const store = scanStore();
    store.getState().setTier(tier);
    const screen = settingsScreen(store, proEnabled);
    const tree = screen.render();
    const row = tdRow(tree);
    expect(row).toBeDefined();
    expect(text(row)).toContain(C.td);          // "Tournament Director"
    expect(text(row)).toContain(C.tdBodyNoPro);  // approved sublabel, no new copy
    row.props.onPress();
    expect(screen.push).toHaveBeenCalledWith('/paywall?tier=td');
    // The TD entry must not fall back to the generic paywall where the TD plan is not pre-selected.
    expect(screen.push).not.toHaveBeenCalledWith('/paywall');
  });

  test('active TD subscribers do not see an upgrade row (they manage via Manage plan)', () => {
    const store = scanStore();
    store.getState().setTier('td');
    const screen = settingsScreen(store, proEnabled);
    const tree = screen.render();
    expect(tdRow(tree)).toBeUndefined();
    expect(planRow(tree)).toBeDefined();          // Manage plan still present for TD buyers
  });
});

// AUG-1263 / AUG-826: with Pro dormant a free account still gets no dormant-Pro surface — the
// generic "Manage plan" upgrade row stays hidden; only the live TD entry appears.
test('pro dormant: free tier keeps no-Pro-surface, TD entry is the only subscription CTA', () => {
  const store = scanStore();
  store.getState().setTier('free');
  const screen = settingsScreen(store, false);
  const tree = screen.render();
  expect(planRow(tree)).toBeUndefined();   // no dormant-Pro "Manage plan" upgrade affordance
  expect(tdRow(tree)).toBeDefined();       // but the live TD IAP is discoverable
  // Restore purchases remains available to everyone.
  expect(nodes(tree).find(n => n.props?.accessibilityLabel === 'Restore purchases')).toBeDefined();
});
