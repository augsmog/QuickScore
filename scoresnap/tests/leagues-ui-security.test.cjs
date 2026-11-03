// AUG-83: guest event access and account-switch data-isolation lifecycle.
const fs = require('fs'), ts = require('typescript'), React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, deps) {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', js)(id => { if (!(id in deps)) throw Error(`Unmocked dependency: ${id}`); return deps[id]; }, m, m.exports);
  return m.exports;
}

function fixture(initialAuth, serviceOverrides = {}) {
  let auth = initialAuth;
  const subscribers = new Set();
  function useAuthStore(selector = state => state) {
    const snapshot = React.useSyncExternalStore(cb => { subscribers.add(cb); return () => subscribers.delete(cb); }, () => auth);
    return selector(snapshot);
  }
  useAuthStore.getState = () => auth;
  useAuthStore.setState = update => { auth = { ...auth, ...update }; subscribers.forEach(cb => cb()); };

  const service = {
    list: jest.fn(async () => []), events: jest.fn(async () => []), roster: jest.fn(async () => []),
    create: jest.fn(), linkEvent: jest.fn(), setMemberActive: jest.fn(), requestEventJoin: jest.fn(),
    mapOptions: jest.fn(), mapPlayer: jest.fn(), ...serviceOverrides,
  };
  const hostTypes = { View: 'View', Text: 'Text', TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable' };
  const deps = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': hostTypes,
    'expo-router': { useRouter: () => ({ push: jest.fn() }) },
    '../../src/ui/SafeScreen': { SafeScreen: ({ children, ...props }) => React.createElement('View', props, children) },
    '../../src/ui/theme': { COLORS: { bg: 'bg', text: 'text', textDim: 'muted', primary: 'primary', onPrimary: 'on', surface: 'surface', danger: 'danger' }, FONTS: { headline: 'h', bold: 'b', regular: 'r' }, RADII: { md: 4, lg: 8 }, TYPOGRAPHY: { headline: {}, body: {}, label: {} } },
    '../../src/config/features': { CROSS_DEVICE_SHARING_ENABLED: true },
    '../../src/stores/auth-store': { useAuthStore },
    '../../src/stores/online-store': { useOnlineStore: selector => selector({ events: {} }) },
    '../../src/services/leagues': { leagueService: service },
    '../../src/ui/AnimatedPressable': { AnimatedPressable: ({ children, ...props }) => React.createElement('Pressable', props, children) },
  };
  return { Screen: load('app/(tabs)/leagues.tsx', deps).default, service, auth: useAuthStore };
}

const league = { id: 'league-a', name: 'Weeknight', role: 'player', member_count: 2, event_count: 1 };
const privateEvent = { id: 'event-private', name: 'Private round title', status: 'active', created_at: 'now', authorized: false, rounds: [] };
const flatten = node => node == null ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(flatten).join('') : flatten(node.children);

test('league guests load linked events and can request event-specific approval without a host roster query', async () => {
  const f = fixture({ remoteUserId: 'guest-a', isAnonymous: true }, {
    list: jest.fn(async () => [league]), events: jest.fn(async () => [privateEvent]),
  });
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(f.Screen)); });
    expect(flatten(tree.toJSON())).toContain('Private round title');
    expect(flatten(tree.toJSON())).toContain('Join requires event host approval');
    expect(f.service.roster).not.toHaveBeenCalled();
    const actionText = tree.root.findAllByType('Text').find(node => node.props.children === 'REQUEST EVENT ACCESS');
    expect(actionText).toBeDefined();
    await act(async () => { await actionText.parent.props.onPress(); });
    expect(f.service.requestEventJoin).toHaveBeenCalledWith('league-a', 'event-private');
  } finally { if (tree) await act(async () => tree.unmount()); }
});

test('changing identity clears prior league data immediately and a denied fetch leaves no stale data', async () => {
  let deny = false;
  const f = fixture({ remoteUserId: 'account-a', isAnonymous: false }, {
    list: jest.fn(async () => [league]),
    events: jest.fn(async () => { if (deny) throw new Error('LEAGUE_HOST_REQUIRED'); return [{ ...privateEvent, authorized: true, name: 'Account A private event' }]; }),
    roster: jest.fn(async () => []),
  });
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(f.Screen)); });
    expect(flatten(tree.toJSON())).toContain('Account A private event');

    await act(async () => { f.auth.setState({ remoteUserId: null }); });
    expect(flatten(tree.toJSON())).not.toContain('Account A private event');
    expect(flatten(tree.toJSON())).not.toContain('Weeknight');

    deny = true;
    await act(async () => { f.auth.setState({ remoteUserId: 'account-b' }); });
    expect(flatten(tree.toJSON())).toContain('LEAGUE_HOST_REQUIRED');
    expect(flatten(tree.toJSON())).not.toContain('Weeknight');
  } finally { if (tree) await act(async () => tree.unmount()); }
});
