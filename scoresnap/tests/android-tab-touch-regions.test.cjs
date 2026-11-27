const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const app = path.join(__dirname, '..');
const transpile = (relative, resolve = () => undefined) => {
  const source = fs.readFileSync(path.join(app, relative), 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out)(mod, mod.exports, name => {
    const value = resolve(name);
    if (value === undefined) throw new Error(`Unexpected import: ${name}`);
    return value;
  });
  return mod.exports;
};

function renderTabs(os, leaguesEnabled = false, bottom = 48) {
  const jsx = (type, props) => ({ type, props });
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { Tabs: { Screen: 'Tab.Screen' } },
    'react-native': { Platform: { OS: os } },
    'lucide-react-native': {},
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom }) },
    '../../src/ui/theme': { COLORS: {}, FONTS: {} },
    '../../src/ui/tab-bar-metrics': transpile('src/ui/tab-bar-metrics.ts'),
    '../../src/config/features': { LEAGUES_ENABLED: leaguesEnabled },
  };
  return transpile('app/(tabs)/_layout.tsx', name => modules[name]).default().props;
}

function flexRowItems(width, count, margin) {
  const slot = width / count;
  return Array.from({ length: count }, (_, i) => ({
    start: i * slot + margin,
    end: (i + 1) * slot - margin,
  }));
}

test.each([[360, false], [320, false], [360, true], [320, true]])(
  'Android %idp bottom nav (leagues enabled: %s) leaves a real margin outside each touch region',
  (width, leaguesEnabled) => {
    const { children, screenOptions } = renderTabs('android', leaguesEnabled);
    const visible = children.filter(item => item.props.options?.href !== null);
    expect(visible.map(item => item.props.name)).toEqual(
      leaguesEnabled ? ['index', 'contests', 'profile', 'leagues'] : ['index', 'contests', 'profile']
    );

    // This verifies the actual style supplied to the navigator. The pinned
    // BottomTabItem places it on the flex item wrapping the full pressable.
    const { tabBarItemStyle: item, tabBarStyle: bar } = screenOptions;
    const targets = flexRowItems(width, visible.length, item.marginHorizontal ?? 0);
    const innerHeight = bar.height - bar.paddingTop - bar.paddingBottom - item.paddingTop;
    for (let i = 0; i < targets.length; i += 1) {
      const { start, end } = targets[i];
      expect(end - start).toBeGreaterThanOrEqual(48);
      expect((start + end) / 2).toBeCloseTo((i + 0.5) * width / targets.length);
      if (i > 0) expect(start - targets[i - 1].end).toBeGreaterThanOrEqual(8);
    }
    expect(innerHeight).toBe(48);
  }
);

test.each(['ios', 'web'])('%s keeps the original bottom-tab hit-region style', os => {
  expect(renderTabs(os).screenOptions.tabBarItemStyle).toEqual({ paddingTop: 2 });
});
