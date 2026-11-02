const fs = require('node:fs');
const ts = require('typescript');

function load(path, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', '__DEV__', code)(id => {
    if (id in dependencies) return dependencies[id];
    throw new Error('Unexpected dependency: ' + id);
  }, module, module.exports, false);
  return module.exports;
}
function screen(user, isAnonymous = false) {
  const state = { user, isAnonymous };
  const push = jest.fn(), support = jest.fn();
  const jsx = (type, props) => ({ type, props });
  const Profile = load('app/(tabs)/profile.tsx', {
    react: { useState: value => [value, jest.fn()], useMemo: fn => fn() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', Button: 'Button', Alert: { alert: jest.fn() } },
    'expo-router': { useRouter: () => ({ push }) },
    'lucide-react-native': new Proxy({}, { get: (_, name) => 'Icon:' + name }),
    '@sentry/react-native': {},
    'react-native-purchases-ui': {},
    '../../src/ui/SafeScreen': { SafeScreen: 'SafeScreen' },
    '../../src/ui/AnimatedPressable': { AnimatedPressable: 'Pressable' },
    '../../src/ui/theme': load('src/ui/theme.ts', {}),
    '../../src/ui/alert': { alert: jest.fn(), captureAlertScope: jest.fn() },
    '../../src/ui/copy': { signedRoundAmount: jest.fn() },
    '../../src/engine/contest-results': { calculateContestSettlement: jest.fn() },
    '../../src/stores/contest-store': { useContestStore: select => select({ contests: [] }) },
    '../../src/stores/scan-store': { useScanStore: () => ({ scansUsed: 0, isPro: false, getRemainingFreeScans: () => 3 }) },
    '../../src/stores/auth-store': { useAuthStore: select => select(state) },
    '../../src/services/purchases': {},
    '../../src/config/support-links': { openSupport: support },
  }).default;
  return { render: Profile, state, push, support };
}
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object'
  ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
const control = (tree, label) => nodes(tree).find(n => n.type === 'Pressable' && ((label === 'Settings' && n.props.testID === 'profile-settings-gear') || n.props.accessibilityLabel === label || text(n) === label));

describe.each([false, true])('identity with anonymous=%s', anonymous => {
  test.each([undefined, '', '   ', 'Golfer', ' Golfer '])('no unfulfillable action for name %p', name => {
    const s = screen({ id: 'local', name }, anonymous);
    const tree = s.render();
    expect(text(tree)).not.toContain('Add your name');
    expect(text(tree)).not.toContain('Edit name');
    expect(control(tree, 'Settings')).toBeDefined();
    expect(control(tree, 'Account settings')).toBeDefined();
    expect(text(tree)).toContain('Member since');
    expect(nodes(tree).find(n => n.props?.testID === 'profile-plan-badge')).toBeDefined();
  });
  test('known name/initials retained and navigation handlers remain reachable on repeated entry', () => {
    const s = screen({ id: 'local', name: '  Avery Jones  ' }, anonymous);
    for (let i = 0; i < 2; i++) {
      const tree = s.render();
      const labels = nodes(tree).filter(n => n.type === 'Text').map(text);
      expect(labels).toContain('Avery Jones');
      expect(labels).toContain('AJ');
      for (const [label, route] of [['Settings', '/settings'], ['Account settings', '/settings'], ['See all rounds', '/(tabs)/contests'], ['Statistics', '/statistics']]) {
        control(tree, label).props.onPress();
        expect(s.push).toHaveBeenLastCalledWith(route);
      }
      control(tree, 'Help & Support').props.onPress();
    }
    expect(s.support).toHaveBeenCalledTimes(2);
  });
});
test('null user and sign-in/sign-out state rerenders never offer deferred editing', () => {
  const s = screen(null, true);
  for (const user of [null, { id: 'a', name: 'Avery' }, { id: 'a', name: '' }, null]) {
    s.state.user = user;
    const tree = s.render();
    expect(text(tree)).not.toContain('Add your name');
    expect(control(tree, 'Settings')).toBeDefined();
    expect(nodes(tree).filter(n => n.props?.testID === 'profile-settings-gear')).toHaveLength(1);
  }
});
