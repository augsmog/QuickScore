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
    'expo-linear-gradient': {LinearGradient: 'LinearGradient'}, // the fade above the Continue footer
    'expo-haptics': {impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {}},
    '../../src/ui/alert': {showAlert: jest.fn()}, '../../src/ui/SafeScreen': {SafeScreen: 'SafeScreen'},
    '../../src/ui/AnimatedPressable': {AnimatedPressable: 'Pressable'},
    '../../src/ui/CourseSearch': {default: 'CourseSearch'},
    '../../src/ui/compact-viewport': {isCompactViewport: () => true},
    '../../src/stores/scan-store': {useScanStore: select => select({tier})},
    '../../src/stores/auth-store': {useAuthStore},
    // AUG-1368: buildTournamentRounds now yields a shaped rounds array so the contest
    // the wizard constructs has the same multi-round geometry the real store would see,
    // and the real canHostTournament gate (imported unmocked by new.tsx) runs for real.
    '../../src/stores/contest-store': {generateId: () => `p${++id}`, useContestStore: select => select({addContest}), defaultCourse: name => ({name, holes: []}), buildTournamentRounds: (groups, course, numRounds) => Number.isInteger(numRounds) && numRounds > 1 ? Array.from({length: numRounds}, (_, i) => ({id: `r${i + 1}`, number: i + 1, name: `Round ${i + 1}`, course, groups})) : undefined},
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

// AUG-1368: a free (non-TD) user who turns on Multi-Day Tournament must be routed to the
// TD paywall from Start, not crash on the store validator throw. The wizard draft is
// preserved (no contest is created, player entry is untouched) so the user can return.
const toStart = (h, {rounds} = {}) => {
  act(() => h.byId('tournament-toggle').onValueChange(true));
  if (rounds) act(() => h.byId(`rounds-${rounds}`).onPress());
  h.press('Continue'); h.press('Continue');
  expect(text(h.render())).toContain('Step 2/2');
};

test('free tier multi-day routes to the TD paywall and creates nothing, preserving entry', () => {
  const h = harness('free'); h.seed(4); const before = structuredClone(h.players());
  toStart(h);
  h.press('Start');
  expect(h.push).toHaveBeenCalledWith('/paywall?tier=td');
  expect(h.addContest).not.toHaveBeenCalled();
  // Draft preserved: the wizard stays mounted; stepping back to Players shows the same entry.
  h.press('Back'); h.press('Back');
  expect(h.players().map(p => p.name)).toEqual(before.map(p => p.name));
});

test('Pro (Pro-dormant) tier is still not a TD host: multi-day routes to the TD paywall', () => {
  const h = harness('pro'); h.seed(4);
  toStart(h, {rounds: 3});
  h.press('Start');
  expect(h.push).toHaveBeenCalledWith('/paywall?tier=td');
  expect(h.addContest).not.toHaveBeenCalled();
});

test('TD tier creates a 2/3/4-round tournament once with no paywall route', () => {
  for (const rounds of [2, 3, 4]) {
    const h = harness('td'); h.seed(4);
    toStart(h, {rounds});
    h.press('Start');
    expect(h.push).not.toHaveBeenCalled();
    expect(h.addContest).toHaveBeenCalledTimes(1);
    const saved = h.addContest.mock.calls[0][0];
    expect(saved.isTournament).toBe(true);
    expect(saved.rounds).toHaveLength(rounds);
  }
});

test('single-round free contest still creates without a paywall route', () => {
  const h = harness('free'); h.seed(4); const before = structuredClone(h.players());
  h.press('Continue'); act(() => gameCard(h, 'Skins').onPress());
  h.press('Continue'); h.press('Start');
  expect(h.push).not.toHaveBeenCalled();
  expect(h.addContest).toHaveBeenCalledTimes(1);
  expect(h.addContest.mock.calls[0][0].games).toContain('skins');
  expect(h.addContest.mock.calls[0][0].groups[0].players.map(p => p.name)).toEqual(before.map(p => p.name));
});

test('free->TD retry after the paywall creates exactly one tournament', () => {
  const h = harness('free'); h.seed(4);
  toStart(h, {rounds: 2});
  h.press('Start');
  expect(h.push).toHaveBeenCalledWith('/paywall?tier=td');
  expect(h.addContest).not.toHaveBeenCalled();
  // User purchases TD and returns to the preserved wizard; a second Start now creates once.
  h.tier('td');
  h.press('Start');
  expect(h.addContest).toHaveBeenCalledTimes(1);
  expect(h.addContest.mock.calls[0][0].rounds).toHaveLength(2);
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

// 27 Nov: the "ESTIMATED TOTAL POT" card is gone. Its figure was unit x players x 18 whatever
// games were picked ($360 for four players at $5), which is right only for Skins over 18 holes.
test('only two numbered steps; Round Settings contains only the unit amount, and no money total', () => {
  const h = harness(); h.seed(2); expect(text(h.render())).not.toMatch(/Step \d/);
  h.press('Continue'); expect(text(h.render())).toContain('Step 1/2');
  h.press('Continue'); const settings = h.byId('contest-step-round-settings');
  expect(text(settings.children)).toContain('UNIT AMOUNT');
  expect(text(settings.children)).not.toMatch(/POT/i);
  expect(text(settings.children)).not.toMatch(/\$\s*\d{2,}/); // no computed dollar figure; the "$" before the amount field stays
  const source = require('node:fs').readFileSync('app/contest/new.tsx', 'utf8');
  expect(source).not.toMatch(/estimatedPot|ESTIMATED TOTAL POT|\* 18\b/);
  expect(nodes(settings.children).filter(n => n.type === 'TextInput')).toHaveLength(1);
  expect(nodes(settings.children).some(n => n.type === 'Switch')).toBe(false);
  expect(text(settings.children)).not.toMatch(/VARIATIONS|ENTRY FEE|Stroke Play|players|holes/);
  h.press('Back'); expect(h.byId('contest-step-gamemodes')).toBeDefined();
  // AUG-1368: the Round Settings step must still carry no per-game upsell, but the wizard
  // now routes unentitled tournament hosts to the TD paywall before save (crash gate).
  const src = fs.readFileSync('app/contest/new.tsx', 'utf8');
  expect(src).not.toMatch(/openPlan|Upgrade|canUseGame/);
  expect(src).toMatch(/canHostTournament\(contest, tier\)/);
  expect(src).toMatch(/paywall\?tier=td/);
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
