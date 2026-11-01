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

function settingsScreen(platform = "ios") {
  const settings = { scoreFormat: "gross", defaultTee: "white", distanceUnit: "yards", showNetScores: false, defaultBetUnit: 5, defaultHandicap: 12, updateSetting: jest.fn((key, value) => { settings[key] = value; }) };
  const deletion = jest.fn(() => { throw new Error("Deletion must never execute in this test"); });
  const alert = jest.fn();
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
      Alert: { alert }, Linking: { openURL: jest.fn() }, Platform: { OS: platform },
    },
    'expo-router': { useRouter: () => ({ push, back, replace: jest.fn() }) },
    'lucide-react-native': new Proxy({}, { get: (_, name) => `Icon:${name}` }),
    '../src/ui/SafeScreen': { SafeScreen: 'SafeScreen' },
    '../src/ui/AnimatedPressable': { AnimatedPressable: 'Pressable' },
    '../src/ui/theme': load('src/ui/theme.ts'),
    '../src/ui/paywall-copy': { PAYWALL_COPY: C },
    '../src/stores/scan-store': { useScanStore: selector => selector({ tier: "td" }) },
    '../src/stores/settings-store': { useSettingsStore: () => settings },
    '../src/stores/auth-store': { useAuthStore: () => ({ user: null, isAnonymous: true }) },
    '../src/services/purchases': { restorePurchases: restore },
    '../src/services/account-deletion': { performAccountDeletion: deletion }, '../src/services/delete-account': { deleteServerAccount: deletion },
    '../src/stores/wipe-local-account': { wipeLocalAccount: deletion }, '../src/config/support-links': { openSupport: jest.fn() },
    '../src/config/support': load('src/config/support.ts'),
  }).default;
  // Expand actual local row components as well as the screen, not just JSX props.
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  }
  return { render: () => { cursor = 0; return expand(Screen()); }, push, back, restore, deletion, settings, alert };
}
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object'
  ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);

const control = (tree, label) => nodes(tree).find(node => node.props?.accessibilityLabel === label);

test.each(['ios', 'web'])('all expanded Settings controls have explicit names and roles on %s', platform => {
  const screen = settingsScreen(platform);
  const controls = nodes(screen.render()).filter(node => ['Pressable', 'Switch'].includes(node.type));
  expect(controls.length).toBeGreaterThan(20);
  for (const node of controls) {
    expect(node.props.accessibilityLabel).toEqual(expect.any(String));
    expect(node.props.accessibilityLabel.trim().length).toBeGreaterThan(0);
    expect(node.props.accessibilityRole).toBe(node.type === 'Switch' ? (platform === 'web' ? undefined : 'switch') : 'button');
  }
  expect(control(screen.render(), platform === 'web' ? 'Score Display, Gross (74, 82)' : 'Score Display').props.accessibilityValue).toEqual({ text: 'Gross (74, 82)' });
  expect(control(screen.render(), platform === 'web' ? 'Distance Unit, Yards' : 'Distance Unit').props.accessibilityValue).toEqual({ text: 'Yards' });
  expect(control(screen.render(), platform === 'web' ? 'Manage plan, Tournament Director' : 'Manage plan').props.accessibilityValue).toEqual({ text: 'Tournament Director' });
  expect(screen.deletion).not.toHaveBeenCalled();
});

test('switch name, hint and checked state follow the real row props after a setting change', () => {
  const screen = settingsScreen();
  const row = control(screen.render(), 'Show Net Scores');
  expect(row.props.accessibilityState).toEqual({ checked: false });
  expect(row.props.accessibilityHint).toBe('Apply handicap strokes to displayed scores');
  row.props.onValueChange(true);
  expect(screen.settings.updateSetting).toHaveBeenCalledWith('showNetScores', true);
  expect(control(screen.render(), 'Show Net Scores').props.accessibilityState).toEqual({ checked: true });
});

test.each(['ios', 'web'])('delete is in Account before preferences; repeated open/cancel never deletes on %s', platform => {
  const screen = settingsScreen(platform);
  for (let attempt = 0; attempt < 3; attempt++) {
    let tree = screen.render();
    // This protects source order only, NOT a measured viewport or tap budget.
    const flat = nodes(tree);
    expect(flat.indexOf(control(tree, 'Delete Account'))).toBeLessThan(flat.indexOf(control(tree, platform === 'web' ? 'Manage plan, Tournament Director' : 'Manage plan')));
    expect(control(tree, 'Yes, delete my account')).toBeUndefined();
    control(tree, 'Delete Account').props.onPress();
    tree = screen.render();
    expect(control(tree, 'Delete Account')).toBeUndefined();
    expect(text(tree)).toContain('This cannot be undone.');
    const confirm = control(tree, 'Yes, delete my account');
    expect(confirm.props.accessibilityRole).toBe('button');
    expect(confirm.props.accessibilityState).toEqual({ disabled: false, busy: false });
    const cancel = control(tree, 'Keep my account');
    expect(cancel.props.accessibilityRole).toBe('button');
    cancel.props.onPress();
    expect(control(screen.render(), 'Yes, delete my account')).toBeUndefined();
  }
  expect(screen.deletion).not.toHaveBeenCalled();
  expect(screen.push).not.toHaveBeenCalled();
});

test('restore keeps an explicit name and disabled state while awaiting the existing billing handler', async () => {
  const screen = settingsScreen();
  let resolve;
  screen.restore.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const restoring = control(screen.render(), 'Restore purchases').props.onPress();
  const row = control(screen.render(), 'Restore purchases');
  expect(row.props.disabled).toBe(true);
  expect(row.props.accessibilityState).toEqual({ disabled: true });
  resolve(true);
  await restoring;
  expect(control(screen.render(), 'Restore purchases').props.disabled).toBe(false);
  expect(screen.alert).toHaveBeenCalledWith(C.restore, C.restored);
  expect(screen.deletion).not.toHaveBeenCalled();
});

test('existing single Profile gear is named Settings and remains in first content header', () => {
  const source = fs.readFileSync('app/(tabs)/profile.tsx', 'utf8');
  expect(source.match(/testID="profile-settings-gear"/g)).toHaveLength(1);
  const gear = source.slice(source.lastIndexOf('<AnimatedPressable', source.indexOf('testID="profile-settings-gear"')));
  expect(gear.slice(0, gear.indexOf('</AnimatedPressable>'))).toContain('accessibilityLabel="Settings"');
  expect(gear.slice(0, gear.indexOf('</AnimatedPressable>'))).toContain('router.push("/settings")');
  expect(source.indexOf('testID="profile-settings-gear"')).toBeLessThan(source.indexOf('>SCORING<'));
});
