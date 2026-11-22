// Real PaywallScreen and pricing projection; native layout still needs device proof.
const loadTS = require('./helpers/load-ts.cjs');
const path = require('node:path');
const React = require('react');
const { act, create } = require('react-test-renderer');
const packages = { annual: null, monthly: null, td_annual: null, td_monthly: null };
const text = node => typeof node === 'string' ? node :
  Array.isArray(node) ? node.map(text).join('') : text(node?.children ?? []);
const style = value => Array.isArray(value) ? Object.assign({}, ...value.filter(Boolean).map(style)) : value;
const diagnosticText = [
  ['Restore Purchases', '500', 'Inter_500Medium'],
  ['Free', '600', 'Inter_600SemiBold'],
  ['Current plan', '600', 'Inter_600SemiBold'],
  ['Tournament Director', '600', 'Inter_600SemiBold'],
  ['$79.99/year', '700', 'Inter_700Bold'],
  ['Currently unavailable', '600', 'Inter_600SemiBold'],
  ['Renews yearly. Cancel anytime.', '500', 'Inter_500Medium'],
  ['Terms of Use', '500', 'Inter_500Medium'],
  ['Privacy Policy', '500', 'Inter_500Medium'],
];

async function harness(os, { returnedPackages = packages, loaded = false, error = null } = {}) {
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const ready = React.createContext([false, null]);
  const calls = { mounts: 0, unmounts: 0, back: 0, purchase: 0, restore: 0 };
  function ScrollView(props) {
    React.useEffect(() => { calls.mounts++; return () => { calls.unmounts++; }; }, []);
    return React.createElement('ScrollViewHost', props, props.children);
  }
  const load = loadTS({
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView,
      Platform: { OS: os }, Linking: {}, StyleSheet: { create: s => s } },
    'expo-router': { useRouter: () => ({ back: () => calls.back++ }), useLocalSearchParams: () => ({ tier: 'td' }) },
    '@expo-google-fonts/inter': { useFonts: () => React.useContext(ready),
      Inter_400Regular: 400, Inter_500Medium: 500, Inter_600SemiBold: 600, Inter_700Bold: 700 },
    'react-native-purchases': {},
    '../src/ui/SafeScreen': { SafeScreen: 'SafeScreen' },
    '../src/services/purchases': { getPackages: async () => returnedPackages,
      purchasePackage: async () => { calls.purchase++; return true; }, restorePurchases: async () => { calls.restore++; return false; },
      syncProStatus: async () => {} },
    '../src/services/entitlements': { proEnabled: () => false },
    '../src/stores/scan-store': { useScanStore: select => select({ tier: 'free' }) },
    '../src/config/support': { PRIVACY_URL: 'https://example.test/privacy', TERMS_URL: 'https://example.test/terms' },
    '../src/ui/paywall-icons': { PaywallIcon: 'PaywallIcon', PaywallRadio: 'PaywallRadio' },
    '../src/config/posthog': { posthog: undefined },
  });
  const PaywallScreen = load(path.join(__dirname, '../app/paywall.tsx')).default;
  let renderer;
  function screen(value) {
    return React.createElement(ready.Provider, { value }, React.createElement(PaywallScreen));
  }
  await act(async () => { renderer = create(screen([loaded, error])); });
  const T = label => {
    const nodes = renderer.root.findAllByType('Text').filter(n => text(n) === label);
    expect(nodes).toHaveLength(1);
    return nodes[0];
  };
  const close = () => renderer.root.findByProps({ testID: 'paywall-close' });
  return {
    T, close, calls,
    async update(loaded, error = null) { await act(async () => renderer.update(screen([loaded, error]))); },
    async cleanup() { try { await act(async () => renderer.unmount()); } finally { globalThis.IS_REACT_ACT_ENVIRONMENT = previous; } },
    allText() { return renderer.root.findAllByType('Text').map(text); },
  };
}

function fonts(h, items, androidFallback) {
  for (const [label, weight, family] of items) {
    const n = h.T(label);
    const a = style(n.props.style);
    expect(a.fontFamily).toBe(androidFallback ? 'sans-serif' : family);
    expect(a.fontWeight).toBe(androidFallback ? weight : undefined);
    expect(n.props.numberOfLines).toBeUndefined();
    expect(n.props.allowFontScaling).not.toBe(false);
  }
}
function cta(h, label) {
  let n = h.T(label);
  while (n && n.type !== 'Pressable') n = n.parent;
  expect(n).not.toBeNull();
  return n.props;
}

test('Android sends explicit fallback then real Inter to the same mounted paywall, including full fallback offer and labels', async () => {
  const h = await harness('android');
  try {
    fonts(h, diagnosticText, true);
    expect(cta(h, 'Currently unavailable').disabled).toBe(true);
    expect(h.allText()).not.toContain('Pro');
    expect(h.allText()).not.toContain('$24.99/year');
    const before = Object.fromEntries(diagnosticText.map(([label]) => [label, style(h.T(label).props.style)]));
    await h.update(true);
    fonts(h, diagnosticText, false);
    expect(cta(h, 'Currently unavailable').accessibilityState.disabled).toBe(true);
    for (const [label] of diagnosticText) {
      const { fontFamily: _, fontWeight: __, ...fallback } = before[label];
      const { fontFamily: ___, fontWeight: ____, ...ready } = style(h.T(label).props.style);
      expect(fallback).toEqual(ready);
    }
    expect(h.calls).toEqual({ mounts: 1, unmounts: 0, back: 0, purchase: 0, restore: 0 });
  } finally { await h.cleanup(); }
});

test('Android font error leaves full readable system Text and a working Close instead of blanking the screen', async () => {
  const h = await harness('android', { error: new Error('font unavailable') });
  try {
    fonts(h, diagnosticText, true);
    expect(cta(h, 'Currently unavailable').disabled).toBe(true);
    await act(async () => h.close().props.onPress());
    expect(h.calls.back).toBe(1);
  } finally { await h.cleanup(); }
});

test('iOS and web retain exact Inter style props even before readiness', async () => {
  for (const os of ['ios', 'web']) {
    const h = await harness(os);
    try {
      fonts(h, diagnosticText, false);
      await h.update(true);
      fonts(h, diagnosticText, false);
      expect(h.calls.mounts).toBe(1);
    } finally { await h.cleanup(); }
  }
});

test('long provider-localized price and CTA receive the same font transition without purchase or restore', async () => {
  const localized = 'CHF\u00a012,345.67/year';
  const action = 'Subscribe — ' + localized;
  const h = await harness('android', { returnedPackages: { ...packages, td_annual: { product: {
    identifier: 'synthetic-td-annual', priceString: 'CHF\u00a012,345.67',
  } } } });
  const items = [[localized, '700', 'Inter_700Bold'], [action, '600', 'Inter_600SemiBold']];
  try {
    fonts(h, items, true);
    expect(cta(h, action).disabled).toBe(false);
    await h.update(true);
    fonts(h, items, false);
    expect(cta(h, action).disabled).toBe(false);
    expect(h.calls).toEqual({ mounts: 1, unmounts: 0, back: 0, purchase: 0, restore: 0 });
  } finally { await h.cleanup(); }
});

test('Android font completion does not reset monthly selection or expose Pro', async () => {
  const h = await harness('android');
  try {
    await act(async () => cta(h, 'or $12.99/month').onPress({ stopPropagation() {} }));
    expect(h.T('$12.99/month')).toBeDefined();
    await h.update(true);
    fonts(h, [['$12.99/month', '700', 'Inter_700Bold']], false);
    expect(h.allText()).toContain('or $79.99/year');
    expect(h.allText()).not.toContain('$79.99/year');
    expect(h.allText()).not.toContain('Pro');
    expect(cta(h, 'Currently unavailable').disabled).toBe(true);
    expect(h.calls.mounts).toBe(1);
  } finally { await h.cleanup(); }
});
