const fs = require('node:fs');
const loadTS = require('./helpers/load-ts.cjs');
const jsx = (type, props) => ({type, props});
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n?.props?.children ?? '');
function harness(initialTier = 'free', {comingSoon = false} = {}) {
  const states = [], refs = []; let si = 0, ri = 0, focus, tier = initialTier, id = 0;
  const react = {
    useState: initial => { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], v => states[i] = typeof v === 'function' ? v(states[i]) : v]; },
    useRef: initial => { const i = ri++; return refs[i] ??= {current: initial}; },
    useMemo: fn => fn(), useCallback: fn => fn,
  };
  const push = jest.fn(), replace = jest.fn(), addContest = jest.fn();
  const auth = {user: {firstName: 'Augie'}, isAnonymous: false, session: {}};
  const useAuthStore = select => select(auth); useAuthStore.getState = () => auth;
  const mocks = {
    react, 'react/jsx-runtime': {jsx, jsxs: jsx},
    'react-native': new Proxy({Platform: {OS: 'web'}}, {get: (o, k) => o[k] ?? k}),
    'expo-router': {useRouter: () => ({push, replace, back: jest.fn()}), useFocusEffect: callback => {focus = callback;}},
    'lucide-react-native': new Proxy({}, {get: (_, k) => k}),
    'expo-crypto': {randomUUID: () => `contest-${++id}`},
    'expo-haptics': {impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {}},
    '../../src/ui/alert': {showAlert: jest.fn()}, '../../src/ui/SafeScreen': {SafeScreen: 'SafeScreen'},
    '../../src/ui/AnimatedPressable': {AnimatedPressable: 'Pressable'},
    '../../src/ui/CourseSearch': {default: 'CourseSearch'},
    '../../src/stores/scan-store': {useScanStore: select => select({tier})},
    '../../src/stores/auth-store': {useAuthStore},
    '../../src/stores/contest-store': {generateId: () => `p${++id}`, useContestStore: select => select({addContest}), defaultCourse: name => ({name, holes: []})},
    '../../src/config/features': {COURSE_SEARCH_ENABLED: false}, '../../src/config/auth': {REAL_AUTH_CONFIGURED: false},
  };
  if (comingSoon) {
    const actual = loadTS()('src/engine/types.ts');
    mocks['../../src/engine/types'] = {...actual, isGameImplemented: id => id !== 'skins' && actual.isGameImplemented(id)};
  }
  const load = loadTS(mocks), Screen = load(process.env.AUG293_SCREEN_SOURCE || 'app/contest/new.tsx').default;
  const render = () => {si = ri = 0; return Screen();};
  const find = pred => {const found = nodes(render()).filter(pred); expect(found).toHaveLength(1); return found[0].props;};
  const byId = id => find(n => n.props?.testID === id);
  const press = label => find(n => n.type === 'Pressable' && text(n) === label).onPress();
  const input = (placeholder, value) => find(n => n.type === 'TextInput' && n.props.placeholder === placeholder).onChangeText(value);
  const players = () => states.find(s => Array.isArray(s) && s[0]?.groupIndex !== undefined);
  render(); focus();
  return {states, render, find, byId, press, input, players, push, replace, addContest, focus: () => focus(), tier: v => {tier = v; render();},
    seed: (count = 8) => {for (let i = 2; i < count; i++) press('+ ADD PLAYER'); for (let i = 1; i < count; i++) input(`Player ${i + 1} name`, `Name ${i + 1}`); input('My Course', 'Saved Course');},
    game: id => find(n => n.type === 'Pressable' && n.props?.key === undefined && text(n).includes(id)),
  };
}
const gameCard = (h, name) => h.find(n => n.type === 'Pressable' && nodes(n).some(c => c.type === 'Text' && text(c).replace('🔒 ', '') === name));
const decrement = h => h.find(n => n.type === 'Pressable' && nodes(n).some(c => c.type === 'Minus')).onPress();
const finish = h => {h.press('NEXT →'); h.press('NEXT →'); h.press('START CONTEST ✓');};

test.each(['tournament', 'group'])('deliberate repeat taps reopen after return, rapid taps do not stack, eight-player draft stays intact (%s first)', first => {
  const h = harness(); h.seed(); const before = structuredClone(h.players());
  const tap = id => id === 'tournament' ? h.byId('tournament-toggle').onValueChange(true) : h.byId('add-group').onPress();
  const second = first === 'tournament' ? 'group' : 'tournament';
  tap(first); tap(second); tap(first);
  expect(h.push.mock.calls).toEqual([['/paywall?tier=td']]);
  for (const id of [first, second, first]) {
    h.focus();
    for (const control of ['tournament-toggle', 'add-group']) expect(h.byId(control).disabled).not.toBe(true);
    expect(h.byId('tournament-toggle').value).toBe(false);
    expect(h.players()).toEqual(before);
    tap(id);
  }
  expect(h.push.mock.calls).toEqual(Array.from({length: 4}, () => ['/paywall?tier=td']));
  h.focus(); finish(h); expect(h.addContest).toHaveBeenCalledTimes(1); const saved = h.addContest.mock.calls[0][0];
  expect(saved.groups).toHaveLength(1); expect(saved.groups[0].players.map(p => p.name)).toEqual(before.map(p => p.name)); expect(saved.course.name).toBe('Saved Course');
});

test('paid games, hosting and Upgrade all reopen after return but share one navigation-in-flight guard', () => {
  const h = harness(); h.seed(4); const before = structuredClone(h.players()); h.press('NEXT →');
  gameCard(h, 'Skins').onPress(); gameCard(h, 'Skins').onPress(); expect(h.push.mock.calls).toEqual([['/paywall']]);
  h.focus(); expect(gameCard(h, 'Skins').disabled).not.toBe(true); gameCard(h, 'Skins').onPress(); expect(h.push).toHaveBeenCalledTimes(2);
  h.focus(); h.press('← BACK'); h.byId('tournament-toggle').onValueChange(true); expect(h.push).toHaveBeenCalledTimes(3);
  h.byId('form-upgrade').onPress(); expect(h.push).toHaveBeenCalledTimes(3);
  h.focus(); const upgrade = h.byId('form-upgrade'); upgrade.onPress(); upgrade.onPress(); expect(h.push).toHaveBeenCalledTimes(4);
  h.focus(); expect(h.players()).toEqual(before); h.byId('add-group').onPress(); expect(h.push).toHaveBeenCalledTimes(5);
  h.focus(); h.byId('form-upgrade').onPress(); expect(h.push).toHaveBeenCalledTimes(6);
});

test('unchanged tier still denies features on repeat taps; Pro permits games only; TD permits hosting; downgrade stays fail-closed', () => {
  const h = harness(); h.seed(4); h.byId('add-group').onPress(); h.focus(); h.tier('free');
  h.byId('add-group').onPress(); expect(h.push).toHaveBeenCalledTimes(2); h.focus(); h.tier('pro'); h.byId('add-group').onPress(); expect(h.push).toHaveBeenCalledTimes(3);
  h.focus(); h.press('NEXT →'); gameCard(h, 'Skins').onPress(); expect(h.push).toHaveBeenCalledTimes(3);
  h.press('← BACK'); h.tier('td'); h.byId('add-group').onPress(); h.byId('tournament-toggle').onValueChange(true); expect(h.byId('tournament-toggle').value).toBe(true);
  h.tier('free'); h.byId('tournament-toggle').onValueChange(false); decrement(h); finish(h); expect(h.addContest).not.toHaveBeenCalled();
  expect(h.push).toHaveBeenCalledTimes(4); h.focus(); gameCard(h, 'Skins').onPress();
  h.press('NEXT →'); h.press('START CONTEST ✓'); expect(h.addContest).toHaveBeenCalledTimes(1);
});

test('downgrade submission fails closed, returns to hosting controls, remaps removed groups only, preserves all player fields', () => {
  const h = harness('td'); h.seed(); h.byId('add-group').onPress(); h.byId('add-group').onPress();
  h.byId('player-group-Name 2').onPress(); h.byId('player-group-Name 3').onPress(); h.byId('player-group-Name 3').onPress();
  const original = structuredClone(h.players()); h.tier('free'); finish(h);
  expect(h.addContest).not.toHaveBeenCalled(); expect(h.push).toHaveBeenCalledTimes(1); h.focus();
  decrement(h); expect(h.players().map(p => p.groupIndex)).toEqual(original.map(p => Math.min(p.groupIndex, 1)));
  decrement(h); expect(h.players()).toEqual(original.map(p => ({...p, groupIndex: 0})));
  finish(h); expect(h.addContest).toHaveBeenCalledTimes(1); expect(h.addContest.mock.calls[0][0].groups).toHaveLength(1);
});

test('actual constructed groups guard rejects stale inconsistent group indexes rather than silently saving forbidden groups', () => {
  const h = harness(); h.seed(); h.players()[1].groupIndex = 9; // Malformed in-memory draft; no disk restoration claimed.
  finish(h); expect(h.addContest).not.toHaveBeenCalled(); expect(h.push).toHaveBeenCalledTimes(1);
});

test('group removal normalizes negative, noninteger and noncontiguous indexes without dropping names or teams', () => {
  const h = harness('td'); h.seed(); h.byId('add-group').onPress();
  const invalid = [-1, 9, 0.5, 0, 1, 0, 1, 0]; h.players().forEach((p, i) => {p.groupIndex = invalid[i]; p.team = i % 2 ? 'B' : 'A';});
  const before = structuredClone(h.players()); decrement(h);
  expect(h.players()).toEqual(before.map(p => ({...p, groupIndex: 0})));
});

test('rerenders, steps and tier changes do not release an in-flight navigation; focus return does', () => {
  const h = harness(); h.seed(); h.byId('add-group').onPress(); h.render(); h.press('NEXT →'); h.press('← BACK'); h.tier('pro'); h.tier('free'); h.byId('add-group').onPress(); expect(h.push).toHaveBeenCalledTimes(1);
  h.focus(); h.byId('add-group').onPress(); expect(h.push).toHaveBeenCalledTimes(2);
  const second = harness(); second.byId('add-group').onPress(); expect(second.push).toHaveBeenCalledTimes(1);
});

test('source keeps all paywall navigation in a single guarded entry and preserves existing copy', () => {
  const source = fs.readFileSync('app/contest/new.tsx', 'utf8'); expect(source.match(/router\.push\(route\)/g)).toHaveLength(1); expect(source).not.toMatch(/router\.push\("\/paywall/);
  expect(source).toContain('accessibilityLabel="Tournament Director"'); expect(source).toContain('accessibilityLabel="Upgrade"');
});

// The current catalog implements every game; inject a future unavailable item.
test('Coming Soon controls do not open plans or hold the navigation guard', () => {
  const h = harness('free', {comingSoon: true}); h.seed(4); h.press('NEXT →');
  gameCard(h, 'Skins').onPress(); expect(h.push).not.toHaveBeenCalled();
  h.press('← BACK'); h.byId('add-group').onPress(); expect(h.push).toHaveBeenCalledTimes(1);
});
