// AUG-826 (child of AUG-817, root AUG-496 SS-APPSTORE): when the reversible pro_enabled
// flag is OFF (shipped default), the always-on Pro upsell affordances must not render and no
// screen may route to the Pro /paywall. TD purchase/restore/manage entry points stay. When the
// flag is ON, every affordance renders exactly as before. Pure conditional-rendering + routing
// invariant; zero user-visible string edits (that part waits for the daily copy batch, AUG-824).
//
// Idiom (matches tests/settings-plan.test.cjs / profile-identity.test.cjs): transpile the screen,
// mock react/jsx-runtime so JSX collapses to {type, props}, then walk the tree. proEnabled is the
// single seam (src/services/entitlements.ts), injected per case so both directions are covered.
const fs = require('node:fs');
const ts = require('typescript');

function load(path, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', '__DEV__', code)(id => {
    if (id === '@/services/platform-alert') return { showAlert: jest.fn() };
    if (id in deps) return deps[id];
    throw new Error('Unmocked dependency: ' + id);
  }, module, module.exports, false);
  return module.exports;
}

const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object'
  ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);

// ---- profile.tsx: plan badge, scan-usage card, Pro upgrade/manage block ----
function profileScreen(proEnabled, scan = { scansUsed: 0, isPro: false, getRemainingFreeScans: () => 0 }) {
  const push = jest.fn();
  const presentCustomerCenter = jest.fn(async () => {});
  const jsx = (type, props) => ({ type, props });
  const Profile = load('app/(tabs)/profile.tsx', {
    react: { useState: value => [value, jest.fn()], useMemo: fn => fn() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', Button: 'Button', Alert: { alert: jest.fn() } },
    'expo-router': { useRouter: () => ({ push }) },
    'lucide-react-native': new Proxy({}, { get: (_, name) => 'Icon:' + name }),
    '@sentry/react-native': {},
    'react-native-purchases-ui': { __esModule: true, default: { presentCustomerCenter } },
    '../../src/ui/SafeScreen': { SafeScreen: 'SafeScreen' },
    '../../src/ui/AnimatedPressable': { AnimatedPressable: 'Pressable' },
    '../../src/ui/theme': load('src/ui/theme.ts', {}),
    '../../src/ui/alert': { alert: jest.fn(), captureAlertScope: jest.fn() },
    '../../src/ui/copy': { signedRoundAmount: jest.fn(() => '$0.00') },
    '../../src/engine/contest-results': { calculateContestSettlement: jest.fn() },
    '../../src/stores/contest-store': { useContestStore: select => select({ contests: [] }) },
    '../../src/stores/scan-store': { useScanStore: () => scan },
    '../../src/stores/auth-store': { useAuthStore: select => select({ user: { id: 'local', name: 'Avery' }, isAnonymous: false }) },
    '../../src/services/purchases': { restorePurchases: jest.fn(), getCustomerInfo: jest.fn() },
    '../../src/services/entitlements': { proEnabled: () => proEnabled },
    '../../src/config/support-links': { openSupport: jest.fn() },
  }).default;
  return { tree: Profile(), push, presentCustomerCenter };
}
describe('profile.tsx Pro affordances', () => {
  test('flag ON renders plan badge, scan-usage card and the Pro upgrade block', () => {
    const { tree } = profileScreen(true);
    expect(nodes(tree).some(n => n.props?.testID === 'profile-plan-badge')).toBe(true);
    expect(text(tree)).toContain('Scorecard Scans');
    expect(text(tree)).toContain('Upgrade to SnapScore Pro');
  });
  test('flag OFF hides plan badge, scan-usage card and the Pro upgrade block', () => {
    const { tree } = profileScreen(false);
    expect(nodes(tree).some(n => n.props?.testID === 'profile-plan-badge')).toBe(false);
    expect(text(tree)).not.toContain('Scorecard Scans');
    expect(text(tree)).not.toContain('Upgrade to SnapScore Pro');
    expect(text(tree)).not.toContain('free scans left');
  });
  test.each(['pro', 'td'])('flag OFF keeps Manage Subscription for an active %s entitlement', async tier => {
    // RevenueCat customer info maps either raw active entitlement to a non-free scan-store tier.
    const { tree, presentCustomerCenter } = profileScreen(false, {
      scansUsed: 0, isPro: true, tier, getRemainingFreeScans: () => 0,
    });
    const manage = nodes(tree).find(n => n.type === 'Pressable' && text(n).includes('Manage Subscription'));
    expect(manage).toBeDefined();
    await manage.props.onPress();
    expect(presentCustomerCenter).toHaveBeenCalledTimes(1);
  });
  test('flag OFF with no active entitlement does not render subscription management or upsell', () => {
    const { tree } = profileScreen(false);
    expect(text(tree)).not.toContain('Manage Subscription');
    expect(text(tree)).not.toContain('Upgrade to SnapScore Pro');
  });
  test('flag OFF leaves no control that routes to the Pro /paywall', () => {
    const { tree, push } = profileScreen(false);
    nodes(tree).forEach(n => { if (typeof n.props?.onPress === 'function') n.props.onPress(); });
    expect(push.mock.calls.some(c => c[0] === '/paywall')).toBe(false);
  });
  test('flag ON still has a control that routes to the Pro /paywall', () => {
    const { tree, push } = profileScreen(true);
    nodes(tree).forEach(n => { if (typeof n.props?.onPress === 'function') { try { n.props.onPress(); } catch {} } });
    expect(push.mock.calls.some(c => c[0] === '/paywall')).toBe(true);
  });
});

// ---- scan/index.tsx: routing invariant + source guards (screen render is camera-heavy) ----
function entitlements(proEnabled) {
  const e = load('src/services/entitlements.ts');
  e.setProEnabled(proEnabled);
  return e;
}
describe('scan: free-scan paywall is unreachable while pro_enabled is off', () => {
  test('scanAllowance is unlimited when the flag is off, so canScan stays true', () => {
    const now = new Date(2026, 0, 1);
    expect(entitlements(false).scanAllowance('free', now).limit).toBe(Infinity);
    expect(entitlements(true).scanAllowance('free', now).limit).toBe(3);
  });
  test('scan source gates the free-scan badge and the paywall entry on proEnabled()', () => {
    const src = fs.readFileSync('app/scan/index.tsx', 'utf8');
    expect(src).toContain('{proEnabled() && !isPro && (');
    expect(src).toContain('if (proEnabled()) setPhase("paywall");');
  });
});

// ---- home (tabs)/index.tsx: unchanged; resolves to "Play" when the flag is off ----
describe('home: game tiles resolve to Play (no Pro paywall) while pro_enabled is off', () => {
  test('canUseGame opens every game for a free account when the flag is off', () => {
    const e = entitlements(false);
    // 'skins' is a Pro-only game on main; flag off makes it free, so the home label is "Play".
    expect(e.canUseGame('skins', 'free')).toBe(true);
    expect(e.canUseGame('wolf', 'free')).toBe(true);
  });
  test('flag on keeps Pro-only games gated (home shows "Try Pro with")', () => {
    const e = entitlements(true);
    expect(e.canUseGame('skins', 'free')).toBe(false);
  });
  test('home still chooses the label from canUseGame (source unchanged)', () => {
    const src = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
    expect(src).toContain('!canUseGame(selectedGame.id, tier) ? "Try Pro with" : "Play"');
  });
});
