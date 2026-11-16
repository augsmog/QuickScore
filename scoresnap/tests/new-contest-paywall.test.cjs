const fs = require('node:fs');
const loadTS = require('./helpers/load-ts.cjs');
const {act} = require('react-test-renderer');
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n?.props?.children ?? '');
function harness(initialTier = 'free', {comingSoon = false, validate} = {}) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'), {create} = require('react-test-renderer');
  let focus, tier = initialTier, id = 0, renderer;
  const push = jest.fn(), replace = jest.fn(), addContest = jest.fn();
  const auth = {user: {firstName: 'Augie'}, isAnonymous: false, session: {}};
  const useAuthStore = select => select(auth); useAuthStore.getState = () => auth;
  const mocks = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
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
  const render = () => renderer.toTree().rendered;
  act(() => { renderer = create(React.createElement(Screen)); });
  const find = pred => {const found = nodes(render()).filter(pred); expect(found).toHaveLength(1); return found[0].props;};
  const byId = id => find(n => n.props?.testID === id);
  const press = label => act(() => find(n => n.type === 'Pressable' && text(n) === label).onPress());
  const input = (placeholder, value) => act(() => find(n => n.type === 'TextInput' && n.props.placeholder === placeholder).onChangeText(value));
  const players = () => nodes(render()).filter(n => n.type === 'TextInput' && (n.props.placeholder === 'Your name' || /Player \d+ name/.test(n.props.placeholder || ''))).map(n => ({name: n.props.value}));
  render();
  return {render, find, byId, press, input, players, push, replace, addContest, focus: () => focus?.(), tier: v => act(() => {tier = v; renderer.update(React.createElement(Screen));}),
    seed: (count = 8) => {for (let i = 2; i < count; i++) press('+ ADD PLAYER'); for (let i = 1; i < count; i++) input(`Player ${i + 1} name`, `Name ${i + 1}`); input('My Course', 'Saved Course');},
    game: id => find(n => n.type === 'Pressable' && n.props?.key === undefined && text(n).includes(id)),
  };
}
const gameCard = (h, name) => h.find(n => n.type === 'Pressable' && nodes(n).some(c => c.type === 'Text' && text(c).replace('🔒 ', '') === name));

test('free tier selects modes and hosting without any paywall route, preserving player entry', () => {
  const h = harness(); h.seed(4); const before = structuredClone(h.players());
  h.byId('add-group').onPress(); h.byId('tournament-toggle').onValueChange(true);
  h.press('Continue'); act(() => gameCard(h, 'Skins').onPress());
  expect(text(h.render())).toContain('Step 1/2');
  expect(h.byId('contest-step-gamemodes')).toBeDefined();
  expect(nodes(h.render()).some(n => n.type === 'Switch')).toBe(true);
  h.press('Continue'); expect(text(h.render())).toContain('Step 2/2');
  h.press('Start'); expect(h.push).not.toHaveBeenCalled();
  expect(h.addContest).toHaveBeenCalledTimes(1);
  expect(h.addContest.mock.calls[0][0].games).toContain('skins');
  expect(h.addContest.mock.calls[0][0].groups[0].players.map(p => p.name)).toEqual(before.map(p => p.name));
});

test('game mode cards expose stable selected state and save Skins toggle semantics', () => {
  const h = harness(); h.seed(2); h.press('Continue');
  const skins = () => h.byId('game-mode-skins');
  expect(skins().accessibilityRole).toBe('button');
  expect(skins().accessibilityState).toEqual({selected: false, disabled: false});
  act(() => skins().onPress());
  expect(skins().accessibilityState).toEqual({selected: true, disabled: false});
  h.press('Continue'); h.press('Start');
  expect(h.addContest.mock.calls[0][0].games).toEqual(['stroke_play', 'skins']);

  // Second tap on the same card removes Skins, so the saved contest is stroke-play only.
  const removed = harness(); removed.seed(2); removed.press('Continue');
  act(() => removed.byId('game-mode-skins').onPress());
  expect(removed.byId('game-mode-skins').accessibilityState.selected).toBe(true);
  act(() => removed.byId('game-mode-skins').onPress());
  expect(removed.byId('game-mode-skins').accessibilityState.selected).toBe(false);
  removed.press('Continue'); removed.press('Start');
  expect(removed.addContest.mock.calls[0][0].games).toEqual(['stroke_play']);
  expect(removed.addContest.mock.calls[0][0].games).not.toContain('skins');

  const again = harness(); again.seed(2); again.press('Continue');
  act(() => again.byId('game-mode-skins').onPress());
  act(() => again.byId('game-mode-skins_carry').onPress());
  expect(again.byId('game-mode-skins_carry').accessibilityState.selected).toBe(true);
  expect(again.byId('game-mode-skins').accessibilityState.selected).toBe(false);
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
  expect(h.byId('game-mode-skins').accessibilityState).toEqual({selected: false, disabled: true});
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
