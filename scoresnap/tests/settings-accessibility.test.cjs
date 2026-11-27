const fs = require('node:fs');
const ts = require('typescript');

function load(path, dependencies = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', source)(id => {
    if (id === '@/services/platform-alert') return { showAlert: (...args) => dependencies['react-native']?.Alert?.alert?.(...args) };
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
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) },
    '../src/ui/settings-layout': load('src/ui/settings-layout.ts'),
    '../src/config/app-version': { APP_VERSION_LABEL: '9.9.9 (99)' },
    '../src/ui/AnimatedPressable': { AnimatedPressable: 'Pressable' },
    '../src/ui/theme': load('src/ui/theme.ts'),
    '../src/ui/paywall-copy': { PAYWALL_COPY: C },
    // AUG-826: Manage plan row now gates on proEnabled(); this harness asserts the flag-ON rendering.
    '../src/services/entitlements': { proEnabled: () => true },
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

const hasSwitch = node => nodes(node.props.children).some(child => child.type === 'Switch');

test.each(['ios', 'web'])('all expanded Settings controls have explicit names and roles on %s', platform => {
  const screen = settingsScreen(platform);
  // iPhone: every control is a pressable; a switch row is one. Web: the browser's own switch input
  // is the control (tests/settings-accessibility-web.test.cjs renders it for real).
  const controls = nodes(screen.render()).filter(node => node.type === 'Pressable' || (platform === 'web' && node.type === 'Switch'));
  expect(controls.length).toBeGreaterThan(20);
  for (const node of controls) {
    expect(node.props.accessibilityLabel).toEqual(expect.any(String));
    expect(node.props.accessibilityLabel.trim().length).toBeGreaterThan(0);
    expect(node.props.accessibilityRole).toBe(node.type === 'Switch' ? undefined : hasSwitch(node) ? 'switch' : 'button');
  }
  // iPhone: the row is the one control. The native switch inside it is not a second, unnamed one.
  for (const toggle of platform === 'web' ? [] : nodes(screen.render()).filter(node => node.type === 'Switch')) {
    expect(toggle.props.accessible).toBe(false);
    expect(toggle.props.importantForAccessibility).toBe('no');
    expect(toggle.props.accessibilityElementsHidden).toBe(true);
    expect(toggle.props.accessibilityLabel).toBeUndefined();
  }
  expect(control(screen.render(), platform === 'web' ? 'Score Display, Gross (74, 82)' : 'Score Display').props.accessibilityValue).toEqual({ text: 'Gross (74, 82)' });
  expect(control(screen.render(), platform === 'web' ? 'Distance Unit, Yards' : 'Distance Unit').props.accessibilityValue).toEqual({ text: 'Yards' });
  expect(control(screen.render(), platform === 'web' ? 'Manage plan, Tournament Director' : 'Manage plan').props.accessibilityValue).toEqual({ text: 'Tournament Director' });
  expect(screen.deletion).not.toHaveBeenCalled();
});

test('switch name, hint and checked state follow the real row; pressing the row changes the setting', () => {
  const screen = settingsScreen();
  const row = control(screen.render(), 'Show Net Scores');
  expect(row.type).toBe('Pressable');
  expect(row.props.accessibilityRole).toBe('switch');
  expect(row.props.accessibilityState).toEqual({ checked: false });
  expect(row.props.accessibilityHint).toBe('Apply handicap strokes to displayed scores');
  row.props.onPress(); // a tap anywhere on the row
  expect(screen.settings.updateSetting).toHaveBeenCalledWith('showNetScores', true);
  const after = control(screen.render(), 'Show Net Scores');
  expect(after.props.accessibilityState).toEqual({ checked: true });
  expect(nodes(after.props.children).find(node => node.type === 'Switch').props.value).toBe(true);
  after.props.onPress();
  expect(screen.settings.updateSetting).toHaveBeenLastCalledWith('showNetScores', false);
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


// Build 33: on iPhone the 44pt target was put on the Switch itself, and iOS painted the switch's
// background on that whole 51x44 box. A plain View around the switch (the first fix) had the size
// but did nothing when touched. The target is now real: the whole row is the control.
test('on iPhone every switch row is a 44pt control that toggles when pressed', () => {
  const platform = 'ios';
  const screen = settingsScreen(platform);
  const tree = screen.render();
  const switches = nodes(tree).filter(node => node.type === 'Switch');
  expect(switches).toHaveLength(14);
  const rows = nodes(tree).filter(node => node.type === 'Pressable' && hasSwitch(node));
  expect(rows).toHaveLength(14);
  const scroll = nodes(tree).find(node => node.type === 'ScrollView');
  const scrollStyle = Object.assign({}, ...[scroll.props.contentContainerStyle].flat());
  const windowWidth = 320; // narrowest supported iPhone width
  for (const row of rows) {
    const style = Object.assign({}, ...[row.props.style].flat());
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    // Width: build 33 required the switch to be at least 44 wide. The target is now the row, and
    // the row is the full width of the list: it sets no width of its own, it is a direct child of
    // the scroll view (which stretches its children), and its label column takes the spare room.
    for (const key of ['width', 'maxWidth', 'alignSelf', 'flex', 'flexBasis']) expect(style[key]).toBeUndefined();
    expect(style.flexDirection).toBe('row');
    expect(scroll.props.children.flat(Infinity).filter(Boolean).some(child => child === row || child.props?.accessibilityLabel === row.props.accessibilityLabel)).toBe(true);
    expect(scrollStyle.paddingHorizontal).toBe(16);
    expect(windowWidth - 2 * scrollStyle.paddingHorizontal).toBeGreaterThanOrEqual(44 * 6); // 288pt on the narrowest phone
    const labelColumn = [row.props.children].flat().find(child => child?.type === 'View');
    expect(labelColumn.props.style.flex).toBe(1);
    expect(row.props.accessibilityRole).toBe('switch');
    const label = row.props.accessibilityLabel;
    const toggle = () => nodes(control(screen.render(), label).props.children).find(node => node.type === 'Switch');
    // nothing sized or painted between the row and the stock switch
    const wrappers = nodes(row.props.children).filter(node => node.type === 'View' && [node.props.children].flat().some(child => child?.type === 'Switch'));
    // one wrapper is allowed, and only to centre the switch: no size, nothing painted
    expect(wrappers).toHaveLength(1);
    expect(Object.keys(wrappers[0].props.style).sort()).toEqual(['alignItems', 'alignSelf', 'justifyContent']);
    if (platform === 'ios') {
      expect(toggle().props.style).toBeUndefined();
      expect(toggle().props.thumbColor).toBeUndefined();
      expect(toggle().props.ios_backgroundColor).toBeUndefined();
    }
    // press path 1: the row
    const before = toggle().props.value;
    expect(control(screen.render(), label).props.accessibilityState).toEqual({ checked: before });
    control(screen.render(), label).props.onPress();
    expect(toggle().props.value).toBe(!before);
    expect(control(screen.render(), label).props.accessibilityState).toEqual({ checked: !before });
    // press path 2: the native switch itself
    toggle().props.onValueChange(before);
    expect(toggle().props.value).toBe(before);
  }
  const safeScreen = nodes(tree).find(node => node.type === 'SafeScreen');
  expect(safeScreen.props.edges).toEqual(expect.arrayContaining(['top', 'bottom', 'left', 'right']));
});

test('on web the switch input itself carries the 44px target and the change', () => {
  const screen = settingsScreen('web');
  const switches = nodes(screen.render()).filter(node => node.type === 'Switch');
  expect(switches).toHaveLength(14);
  expect(nodes(screen.render()).filter(node => node.type === 'Pressable' && hasSwitch(node))).toHaveLength(0);
  for (const toggle of switches) {
    expect(toggle.props.style.minWidth).toBeGreaterThanOrEqual(44);
    expect(toggle.props.style.minHeight).toBeGreaterThanOrEqual(44);
    const before = toggle.props.value;
    toggle.props.onValueChange(!before);
    expect(control(screen.render(), toggle.props.accessibilityLabel).props.value).toBe(!before);
  }
  // Same safe-area check the build 33 test made on web.
  const safeScreen = nodes(screen.render()).find(node => node.type === 'SafeScreen');
  expect(safeScreen.props.edges).toEqual(expect.arrayContaining(['top', 'bottom', 'left', 'right']));
});

