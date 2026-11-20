const fs = require('node:fs');
const ts = require('typescript');

function load(file, deps = {}, env = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', 'process', code)(id => {
    if (!(id in deps)) throw Error(`Unmocked dependency: ${id}`);
    return deps[id];
  }, module, module.exports, { env });
  return module.exports;
}

test('Join does not opt into Leagues, and Leagues cannot bypass sharing', () => {
  for (const sharing of [undefined, '', 'false', 'True', '1', 'true']) {
    for (const leagues of [undefined, '', 'false', 'True', '1', 'true']) {
      const f = load('src/config/features.ts', {}, {
        EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING: sharing,
        EXPO_PUBLIC_FEATURE_LEAGUES: leagues,
      });
      expect(f.CROSS_DEVICE_SHARING_ENABLED).toBe(sharing === 'true');
      expect(f.LEAGUES_ENABLED).toBe(sharing === 'true' && leagues === 'true');
    }
  }
});

test.each(['testflight', 'production'])('%s committed profile enables Join but defaults Leagues off', name => {
  const env = JSON.parse(fs.readFileSync('eas.json', 'utf8')).build[name].env;
  expect(env.EXPO_PUBLIC_FEATURE_LEAGUES).not.toBe('true');
  const f = load('src/config/features.ts', {}, env);
  expect(f.CROSS_DEVICE_SHARING_ENABLED).toBe(true);
  expect(f.LEAGUES_ENABLED).toBe(false);
});

test.each([false, true])('League tab visibility follows separate gate (%s)', enabled => {
  const Tabs = Object.assign(() => null, { Screen: () => null });
  const { default: Layout } = load('app/(tabs)/_layout.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'expo-router': { Tabs },
    'react-native': { View: 'View', StyleSheet: {} },
    'lucide-react-native': {},
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../../src/ui/theme': { COLORS: {}, FONTS: {} },
    '../../src/ui/tab-bar-metrics': { tabBarHeight: () => 68 },
    '../../src/config/features': { LEAGUES_ENABLED: enabled },
  });
  const screen = Layout().props.children.find(child => child.props.name === 'leagues');
  expect(screen.props.options.href).toBe(enabled ? '/leagues' : null);
});

const operations = {
  list: [], create: ['Weekly'], linkEvent: ['league', 'event'], events: ['league'],
  roster: ['league'], setMemberActive: ['league', 'player', true],
  requestEventJoin: ['league', 'event'], mapOptions: ['league', 'event'],
  mapPlayer: ['league', 'event', 'member', 'player'],
};

test.each(Object.entries(operations))('direct service %s cannot reach the backend with Leagues off', async (method, args) => {
  const rpc = jest.fn();
  const { leagueService } = load('src/services/leagues.ts', {
    '../db/supabase': { supabase: { rpc } },
    '../config/features': { LEAGUES_ENABLED: false },
  });
  expect(Object.keys(leagueService).sort()).toEqual(Object.keys(operations).sort());
  await expect(leagueService[method](...args)).rejects.toThrow('Leagues are not available');
  expect(rpc).not.toHaveBeenCalled();
});

test('explicitly enabled League service retains RPC arguments and backend errors', async () => {
  const rpc = jest.fn(async () => ({ data: 'league-id', error: null }));
  const { leagueService } = load('src/services/leagues.ts', {
    '../db/supabase': { supabase: { rpc } },
    '../config/features': { LEAGUES_ENABLED: true },
  });
  await expect(leagueService.create(' Weekly ')).resolves.toBe('league-id');
  expect(rpc).toHaveBeenCalledWith('create_league', { p_league_name: 'Weekly' });
  rpc.mockResolvedValueOnce({ data: null, error: new Error('permission denied') });
  await expect(leagueService.list()).rejects.toThrow('permission denied');
});
