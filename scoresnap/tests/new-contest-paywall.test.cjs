const fs = require('node:fs');
const loadTS = require('./helpers/load-ts.cjs');
const jsx = (type, props) => ({type, props});
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n?.props?.children ?? '');
function harness(initialTier = 'free', {comingSoon = false, validate} = {}) {
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
    'react-native': new Proxy({Platform: {OS: 'web'}, Dimensions: {get: () => ({width: 375, height: 667})}}, {get: (o, k) => o[k] ?? k}),
    'expo-router': {useRouter: () => ({push, replace, back: jest.fn()}), useFocusEffect: callback => {focus = callback;}},
    'lucide-react-native': new Proxy({}, {get: (_, k) => k}),
    'expo-crypto': {randomUUID: () => `contest-${++id}`},
    'expo-haptics': {impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {}},
    '../../src/ui/alert': {showAlert: jest.fn()}, '../../src/ui/SafeScreen': {SafeScreen: 'SafeScreen'},
    '../../src/ui/AnimatedPressable': {AnimatedPressable: 'Pressable'},
    '../../src/ui/CourseSearch': {default: 'CourseSearch'},
    '../../src/ui/compact-viewport': {isCompactViewport: () => true},
    '../../src/stores/scan-store': {useScanStore: select => select({tier})},
    '../../src/stores/auth-store': {useAuthStore},
    '../../src/stores/contest-store': {generateId: () => `p${++id}`, useContestStore: select => select({addContest}), defaultCourse: name => ({name, holes: []})},
    '../../src/config/features': {COURSE_SEARCH_ENABLED: false}, '../../src/config/auth': {REAL_AUTH_CONFIGURED: false},
    '../../src/config/posthog': {posthog: null},
    '../../src/services/posthog-log': {posthogAppLogger: {contestCreated() {}}},
  };
  if (comingSoon) {
    const actual = loadTS()('src/engine/types.ts');
    mocks['../../src/engine/types'] = {...actual, isGameImplemented: id => id !== 'skins' && actual.isGameImplemented(id)};
  }
  if (validate) mocks['../../src/engine/types'] = {...loadTS()('src/engine/types.ts'), validateVariationSetup: validate};
  const load = loadTS(mocks), Screen = load(process.env.AUG293_SCREEN_SOURCE || 'app/contest/new.tsx').default;
  const render = () => {si = ri = 0; return Screen();};
  const find = pred => {const found = nodes(render()).filter(pred); expect(found).toHaveLength(1); return found[0].props;};
  const byId = id => find(n => n.props?.testID === id);
  const press = label => find(n => n.type === 'Pressable' && text(n) === label).onPress();
  const input = (placeholder, value) => find(n => n.type === 'TextInput' && n.props.placeholder === placeholder).onChangeText(value);
  const players = () => states.find(s => Array.isArray(s) && s[0]?.groupIndex !== undefined);
  render();
  return {states, render, find, byId, press, input, players, push, replace, addContest, focus: () => focus?.(), tier: v => {tier = v; render();},
    seed: (count = 8) => {for (let i = 2; i < count; i++) press('+ ADD PLAYER'); for (let i = 1; i < count; i++) input(`Player ${i + 1} name`, `Name ${i + 1}`); input('My Course', 'Saved Course');},
    game: id => find(n => n.type === 'Pressable' && n.props?.key === undefined && text(n).includes(id)),
  };
}
const gameCard = (h, name) => h.find(n => n.type === 'Pressable' && nodes(n).some(c => c.type === 'Text' && text(c).replace('🔒 ', '') === name));

test('free tier selects modes and hosting without any paywall route, preserving player entry', () => {
  const h = harness(); h.seed(4); const before = structuredClone(h.players());
  h.byId('add-group').onPress(); h.byId('tournament-toggle').onValueChange(true);
  h.press('Continue'); gameCard(h, 'Skins').onPress();
  expect(text(h.render())).toContain('Step 1/2');
  expect(h.byId('contest-step-gamemodes')).toBeDefined();
  expect(nodes(h.render()).some(n => n.type === 'Switch')).toBe(true);
  h.press('Continue'); expect(text(h.render())).toContain('Step 2/2');
  h.press('Start'); expect(h.push).not.toHaveBeenCalled();
  expect(h.addContest).toHaveBeenCalledTimes(1);
  expect(h.addContest.mock.calls[0][0].games).toContain('skins');
  expect(h.addContest.mock.calls[0][0].groups[0].players.map(p => p.name)).toEqual(before.map(p => p.name));
});

test('only two numbered steps; Round Settings contains only unit amount and estimated pot', () => {
  const h = harness(); h.seed(2); expect(text(h.render())).not.toMatch(/Step \d/);
  h.press('Continue'); expect(text(h.render())).toContain('Step 1/2');
  h.press('Continue'); const settings = h.byId('contest-step-round-settings');
  expect(text(settings.children)).toContain('UNIT AMOUNT');
  expect(text(settings.children)).toContain('ESTIMATED TOTAL POT');
  expect(text(settings.children)).toContain('$180');
  expect(nodes(settings.children).filter(n => n.type === 'TextInput')).toHaveLength(1);
  expect(nodes(settings.children).some(n => n.type === 'Switch')).toBe(false);
  expect(text(settings.children)).not.toMatch(/VARIATIONS|ENTRY FEE|Stroke Play|players|holes/);
  h.press('Back'); expect(h.byId('contest-step-gamemodes')).toBeDefined();
  expect(fs.readFileSync('app/contest/new.tsx', 'utf8')).not.toMatch(/paywall|openPlan|Upgrade|canUseGame|canHostTournament/);
});

test('Coming Soon modes remain unavailable without opening a plan', () => {
  const h = harness('free', {comingSoon: true}); h.seed(4); h.press('Continue');
  gameCard(h, 'Skins').onPress(); expect(h.push).not.toHaveBeenCalled();
  h.press('Continue'); h.press('Start');
  expect(h.addContest.mock.calls[0][0].games).not.toContain('skins');
});

test('variation validation blocks both Continue and Start without losing settings', () => {
  const validate = jest.fn().mockReturnValue('Invalid setup');
  const h = harness('free', {validate}); h.seed(2); h.press('Continue');
  h.press('Continue'); expect(h.byId('contest-step-gamemodes')).toBeDefined();
  expect(validate).toHaveBeenCalledTimes(1);
  validate.mockReturnValue(null); h.press('Continue');
  expect(h.byId('contest-step-round-settings')).toBeDefined();
  validate.mockReturnValue('Invalid setup'); h.press('Start');
  expect(validate).toHaveBeenCalledTimes(3); expect(h.addContest).not.toHaveBeenCalled();
  expect(h.byId('contest-step-round-settings')).toBeDefined();
});
