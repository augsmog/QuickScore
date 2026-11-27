// The paywall is the only screen set in Inter, and it loads Inter itself. It used to draw its text
// straight away: Android measures each line with the fallback font, then draws it in Inter when the
// font arrives, and does not measure again. Inter is wider, so lines came out cut: "Fre" for
// "Free", "$79.99/y…" for "$79.99/year", "Cancel anytim" for "Cancel anytime." The layout gate's
// screenshot review failed the Android paywall for exactly those three (run 46008363328, rules 3
// and 2). A cut-off price or renewal line on a paywall is a defect on any platform.
// The screen now draws no Inter text until its fonts are in, and draws anyway if they fail to load.
// While it waits it must not be a dead end: a blank screen with no Close and no Restore Purchases
// traps the user for as long as the font takes (review finding on fd714e2, paywall.tsx:49). So the
// waiting screen shows Close and Restore Purchases, the latter in the system font, which is
// measured and drawn the same way and so cannot come out cut.
const fs = require('node:fs');
const ts = require('typescript');

const src = fs.readFileSync('app/paywall.tsx', 'utf8');
const file = ts.createSourceFile('paywall.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = file.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'PaywallScreen');
const body = screen.body.statements;
const text = (n) => n.getText(file);

test('the screen keeps the result of loading its fonts', () => {
  const load = body.find((n) => /useFonts\(/.test(text(n)));
  expect(text(load)).toMatch(/^const \[fontsLoaded, fontError\] = useFonts\(\{ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold \}\);$/);
});

test('the gate comes after every hook and before the view is built', () => {
  const gate = body.findIndex((n) => ts.isIfStatement(n) && /fontsLoaded/.test(text(n.expression)));
  expect(gate).toBeGreaterThan(-1);
  // Loaded, or failed: either way the paywall is drawn. A font that fails must never leave a waiting paywall.
  expect(text(body[gate].expression)).toBe('!fontsLoaded && !fontError');
  expect(text(body[gate].thenStatement)).toMatch(/^return <SafeScreen style=\{s\.safe\} testID="paywall-loading-fonts">/);
  const hooks = body.map((n, i) => (/\buse[A-Z]\w*\(/.test(text(n)) ? i : -1)).filter((i) => i >= 0);
  expect(Math.max(...hooks)).toBeLessThan(gate);
  expect(body.findIndex((n) => /buildPaywallView\(/.test(text(n)))).toBeGreaterThan(gate);
});

// Render the real screen with the fonts in each state.
function render({ fonts, restore = jest.fn(async () => true) }) {
  const back = jest.fn(), alert = jest.fn();
  const jsx = (type, props) => (typeof type === 'function' ? type(props) : { type, props });
  const states = []; let cursor = 0;
  const react = { useState: (init) => { const i = cursor++; if (!(i in states)) states[i] = init; return [states[i], (v) => { states[i] = v; }]; }, useEffect: () => {} };
  const copy = load('src/ui/paywall-copy.ts');
  const deps = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Platform: { OS: 'android' }, View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', Alert: { alert }, Linking: { openURL: jest.fn() }, StyleSheet: { create: (x) => x } },
    '@/services/platform-alert': { showAlert: alert },
    '../src/ui/SafeScreen': { SafeScreen: 'SafeScreen' },
    'expo-router': { useRouter: () => ({ back }), useLocalSearchParams: () => ({ tier: 'td' }) },
    '@expo-google-fonts/inter': { useFonts: () => fonts },
    '../src/services/purchases': { getPackages: async () => ({}), purchasePackage: async () => true, restorePurchases: restore, syncProStatus: async () => {} },
    '../src/services/paywall-plans': load('src/services/paywall-plans.ts', { '../ui/paywall-copy': copy, 'react-native-purchases': { __esModule: true, default: {}, INTRO_ELIGIBILITY_STATUS: {} } }),
    '../src/services/entitlements': { proEnabled: () => false },
    '../src/stores/scan-store': { useScanStore: (pick) => pick({ tier: 'free' }) },
    '../src/config/support': { PRIVACY_URL: 'p', TERMS_URL: 't' },
    '../src/ui/paywall-tokens': load('src/ui/paywall-tokens.ts', { 'react-native': { Platform: { OS: 'android' } } }),
    '../src/ui/paywall-copy': copy,
    '../src/ui/paywall-icons': { PaywallIcon: 'PaywallIcon', PaywallRadio: 'PaywallRadio' },
    '../src/config/posthog': { posthog: null },
  };
  const tree = load('app/paywall.tsx', deps).default();
  const all = []; (function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; all.push(n); walk(n.props?.children); })(tree);
  return { tree, all, back, alert, restore, C: copy.PAYWALL_COPY };
}
function load(p, deps = {}) {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(p, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', js)((id) => { if (id in deps) return deps[id]; throw Error(`unstubbed import ${id} in ${p}`); }, m, m.exports);
  return m.exports;
}
const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const texts = (all) => all.filter((n) => n.type === 'Text');
const label = (n) => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string').join('');
const pressableWith = (all, word) => all.find((n) => n.type === 'Pressable' && texts([n.props.children].flat(Infinity).filter(Boolean)).some((t) => label(t) === word));

test('while the fonts load, the screen is the waiting screen and it still has Close and Restore Purchases', async () => {
  const { tree, all, back, restore, alert, C } = render({ fonts: [false, null] });
  expect(tree.props.testID).toBe('paywall-loading-fonts');
  const close = all.find((n) => n.props?.testID === 'paywall-close');
  expect(close).toBeTruthy();
  expect(close.props.accessibilityLabel).toBe('Close');
  expect(close.props.style.minHeight).toBe(48);
  close.props.onPress();
  expect(back).toHaveBeenCalledTimes(1);
  const restoreButton = pressableWith(all, C.restore);
  expect(restoreButton).toBeTruthy();
  expect(restoreButton.props.accessibilityRole).toBe('button');
  expect(restoreButton.props.style.minHeight).toBe(48);
  await restoreButton.props.onPress();
  expect(restore).toHaveBeenCalledTimes(1);
  expect(alert).toHaveBeenCalledWith(C.restore, C.restored);
});

test('the waiting screen draws one line of text, in the system font, and nothing of the offer', () => {
  const { all, C } = render({ fonts: [false, null] });
  expect(texts(all).map(label)).toEqual([C.restore]);
  // No Inter family: the line is measured and drawn in the same font, so it cannot be cut.
  expect(flat(texts(all)[0].props.style).fontFamily).toBeUndefined();
  // Same look otherwise as the Restore link on the loaded paywall.
  expect(flat(texts(all)[0].props.style)).toMatchObject({ fontSize: 14, textDecorationLine: 'underline' });
  expect(all.some((n) => n.type === 'ScrollView')).toBe(false);
});

test('Close and Restore sit where they sit on the loaded paywall', () => {
  const waiting = render({ fonts: [false, null] }), loaded = render({ fonts: [true, null] });
  const bar = ({ all }) => all.find((n) => n.type === 'View' && [n.props.children].flat(Infinity).some((c) => c?.props?.testID === 'paywall-close'));
  expect(bar(waiting).props.style).toEqual(bar(loaded).props.style);
  const frame = ({ all }) => all.find((n) => [n.props.children].flat(Infinity).includes(bar({ all })));
  expect(flat(frame(waiting).props.style).paddingHorizontal).toBe(flat(frame(loaded).props.contentContainerStyle).paddingHorizontal);
});

test('with the fonts in, or failed, the full paywall is drawn with Inter', () => {
  for (const fonts of [[true, null], [false, new Error('no font')]]) {
    const { tree, all, C } = render({ fonts });
    expect(tree.props.testID).toBeUndefined();
    expect(all.filter((n) => n.props?.testID === 'paywall-close')).toHaveLength(1);
    const restoreText = texts(all).find((t) => label(t) === C.restore);
    expect(flat(restoreText.props.style).fontFamily).toMatch(/Inter/);
    expect(texts(all).length).toBeGreaterThan(8);
  }
});
