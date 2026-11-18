const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const SAFE_AREA_PROFILES = {
  'iphone-se': { width: 375, height: 667, top: 20, bottom: 0 },
  'iphone-15-pro': { width: 393, height: 852, top: 59, bottom: 34 },
  'iphone-pro-max': { width: 430, height: 932, top: 59, bottom: 34 },
};

function renderPanel(profile, { anonymous = true, message = '', busy = false, error = false } = {}) {
  const compact = profile.width <= 400 || profile.height < 700;
  const jsx = (type, props) => ({ type, props: props || {} });
  const deps = {
    './theme': { COLORS: { text: '#000', primary: '#06c', surfaceHigh: '#eee' } },
    './compact-viewport': { isCompactViewport: () => compact },
    react: {},
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Dimensions: { get: () => ({ width: profile.width, height: profile.height }) }, Pressable: 'Pressable', Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: profile.top, right: 0, bottom: profile.bottom, left: 0 }) },
    'expo-router': { useRouter: () => ({ push: () => {} }) },
    '../stores/auth-store': { useAuthStore: selector => selector({ isAnonymous: anonymous }) },
    '../services/account-handoff': { useHandoffStore: () => ({ message, busy, error }), finishAccountHandoff: async () => {} },
  };
  const file = path.join(__dirname, '../src/ui/AccountHandoffPanel.tsx');
  const context = { exports: {}, require: n => deps[n] };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    context,
  );
  return context.exports.AccountHandoffPanel();
}

const flatten = style => (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style || {});
const allPressables = node => {
  if (!node || typeof node !== 'object') return [];
  const children = [].concat(node.props?.children ?? []).flat(Infinity);
  const found = node.type === 'Pressable' ? [node] : [];
  return [...found, ...children.flatMap(allPressables)];
};

test('guest handoff banner clears the top safe-area band on every profile', () => {
  for (const profile of Object.values(SAFE_AREA_PROFILES)) {
    const panel = renderPanel(profile);
    const style = flatten(panel.props.style);
    expect(style.paddingTop).toBeGreaterThanOrEqual(profile.top);
  }
});

test('the "Save rounds to an account" action is a visible >=44px target on every profile', () => {
  for (const profile of Object.values(SAFE_AREA_PROFILES)) {
    const panel = renderPanel(profile);
    const pressables = allPressables(panel);
    expect(pressables.length).toBeGreaterThan(0);
    for (const p of pressables) {
      const style = flatten(p.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  }
});

test('no banner renders, and no action/copy changes, when neither anonymous nor message/busy', () => {
  const panel = renderPanel(SAFE_AREA_PROFILES['iphone-15-pro'], { anonymous: false, message: '', busy: false, error: false });
  expect(panel).toBeNull();
});
