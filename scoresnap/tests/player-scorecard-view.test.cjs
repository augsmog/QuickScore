// AUG-705: Round > Leaderboard — tap a player row to open their full-round
// scorecard; back returns to the leaderboard with the same Gross/Net state.
// Loads the real screen, list, scorecard view and buildPlayerScorecard (AUG-706)
// in-process; only RN primitives, theme, stores and FlashList are stubbed.
const fs = require('fs');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, deps) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function('require', 'module', 'exports', source)(
    (id) => {
      if (id in deps) return deps[id];
      throw new Error(`Unmocked dependency: ${id}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}

const theme = {
  COLORS: new Proxy({}, { get: (_, key) => String(key) }),
  FONTS: new Proxy({}, { get: (_, key) => String(key) }),
  TYPOGRAPHY: { caption: {} },
  RADII: new Proxy({}, { get: () => 8 }),
};
const rn = { View: 'View', Text: 'Text', ScrollView: 'ScrollView', TextInput: 'TextInput', Pressable: 'Pressable', Modal: 'Modal' };
const formatters = { formatToPar: (v) => (v === 0 ? 'E' : v > 0 ? `+${v}` : String(v)) };

const types = {};
const strokePlay = load('src/engine/calculators/stroke-play.ts', { '../types': types });
const skins = load('src/engine/calculators/skins.ts', { '../types': types });
const netStrokePlay = load('src/engine/calculators/net-stroke-play.ts', {
  '../types': types, './skins': skins, './stroke-play': strokePlay,
});
const playerScorecard = load('src/engine/calculators/player-scorecard.ts', {
  '../types': types, './skins': skins, './net-stroke-play': netStrokePlay,
});
const { PlayerScorecardView, scoreShape } = load('src/components/PlayerScorecardView.tsx', {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  'react-native': rn,
  '../ui/theme': theme,
  '../utils/formatters': formatters,
});

const passthroughFlashList = (props) => {
  const { data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent } = props;
  return React.createElement(
    'FlashListMock', null, ListHeaderComponent || null,
    ...data.map((item, index) => React.createElement(
      React.Fragment, { key: keyExtractor ? keyExtractor(item, index) : index }, renderItem({ item, index }),
    )),
    ListFooterComponent || null,
  );
};
const { LeaderboardResultsList } = load('src/components/LeaderboardResultsList.tsx', {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@shopify/flash-list': { FlashList: passthroughFlashList },
  'react-native': rn,
  '../ui/theme': theme,
  '../utils/formatters': formatters,
  '../ui/leaderboard-hole-strip': load('src/ui/leaderboard-hole-strip.ts', {}),
});

function makeCourse(n) {
  return { name: 'Course', holes: Array.from({ length: n }, (_, i) => ({ num: i + 1, par: i % 3 === 0 ? 5 : 4, hcp: i + 1 })) };
}

function loadScreen(contest, players) {
  const AnimatedPressable = (props) => React.createElement('Pressable', props, props.children);
  const deps = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': rn,
    'expo-router': { useLocalSearchParams: () => ({ id: contest.id }) },
    'lucide-react-native': { Flag: 'Flag' },
    '../../../src/ui/theme': theme,
    '../../../src/stores/online-store': { useOnlineStore: (select) => select({ events: {} }) },
    '../../../src/stores/contest-store': {
      useContestStore: (selector) => selector({ contests: [contest] }),
      getTournamentPlayers: () => players,
      getActiveGroups: () => contest.groups,
    },
    '../../../src/engine/contest-results': { teamCardPlayers: () => players, liveRoundCourse: (c) => c.course },
    '../../../src/engine/calculators/stroke-play': strokePlay,
    '../../../src/engine/calculators/leaderboard-view': load('src/engine/calculators/leaderboard-view.ts', {
      '../types': types, './stroke-play': strokePlay, './net-stroke-play': netStrokePlay,
    }),
    '../../../src/engine/leaderboard-rows': load('src/engine/leaderboard-rows.ts', { './types': types }),
    '../../../src/engine/you-fixture': load('src/engine/you-fixture.ts', {}),
    '../../../src/ui/leaderboard-hole-strip': load('src/ui/leaderboard-hole-strip.ts', {}),
    '../../../src/utils/formatters': formatters,
    '../../../src/ui/AnimatedPressable': { AnimatedPressable },
    '../../../src/components/LeaderboardResultsList': { LeaderboardResultsList },
    '../../../src/components/PlayerScorecardView': { PlayerScorecardView },
    '../../../src/engine/calculators/player-scorecard': playerScorecard,
  };
  return load('app/contest/[id]/index.tsx', deps).default;
}

function byId(tree, id) {
  return tree.root.findAll((n) => n.props.testID === id && typeof n.type === 'string');
}
function textOf(node) {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}

function makeContest(nPlayers, nHoles, scoresFor) {
  const players = Array.from({ length: nPlayers }, (_, i) => ({
    id: `p${i + 1}`, name: `Player ${i + 1}`, handicap: i, scores: scoresFor(i, nHoles),
  }));
  const groups = [{ id: 'g1', name: 'Field', players }];
  return {
    players,
    contest: { id: `c-${nPlayers}-${nHoles}`, isTournament: false, hasTeams: false, groups, games: [], course: makeCourse(nHoles) },
  };
}

async function render(Screen) {
  let tree;
  await act(async () => { tree = create(React.createElement(Screen)); });
  return tree;
}

test('tap a row opens that player scorecard; back returns with Net still selected (18 holes, 2 players)', async () => {
  const { contest, players } = makeContest(2, 18, (i, n) => Array(n).fill(4 + i));
  const Screen = loadScreen(contest, players);
  const tree = await render(Screen);
  try {
    // Switch to Net first so we can prove the toggle state survives the round trip.
    const net = tree.root.findAll((n) => n.props.testID === 'leaderboard-rank-net');
    await act(async () => { net[0].props.onPress(); });

    const modal = () => tree.root.findAll((n) => n.type === 'Modal')[0];
    expect(modal().props.visible).toBe(false);

    const row = tree.root.findAll((n) => n.props.testID === 'leaderboard-open-scorecard-p2')[0];
    expect(row.props.accessibilityRole).toBe('button');
    await act(async () => { row.props.onPress(); });

    expect(modal().props.visible).toBe(true);
    expect(textOf(byId(tree, 'player-scorecard-name')[0])).toBe('Player 2');
    expect(textOf(byId(tree, 'player-scorecard-thru')[0])).toBe('Finished');
    expect(textOf(byId(tree, 'player-scorecard-gross')[0])).toBe('90');
    expect(byId(tree, 'scorecard-front').length).toBe(1);
    expect(byId(tree, 'scorecard-back').length).toBe(1);
    // Net row present (course has hcp per hole) and handicap 1 strips one stroke on hcp-1 hole.
    expect(textOf(byId(tree, 'scorecard-net-p2-1')[0])).toBe('4');
    expect(textOf(byId(tree, 'player-scorecard-net')[0])).toBe('89');

    await act(async () => { byId(tree, 'player-scorecard-back')[0].props.onPress(); });
    expect(modal().props.visible).toBe(false);
    // Still in Net mode: the Net option remains the selected one.
    const netAfter = tree.root.findAll((n) => n.props.testID === 'leaderboard-rank-net')[0];
    expect(netAfter.props.style.backgroundColor).toBe('primary');
  } finally {
    await act(async () => tree.unmount());
  }
});

test('partial round: unplayed holes render blank and THRU shows holes played', async () => {
  const { contest, players } = makeContest(2, 18, (i, n) => Array.from({ length: n }, (_, h) => (h < 5 ? 4 : 0)));
  const Screen = loadScreen(contest, players);
  const tree = await render(Screen);
  try {
    const row = tree.root.findAll((n) => n.props.testID === 'leaderboard-open-scorecard-p1')[0];
    await act(async () => { row.props.onPress(); });
    expect(textOf(byId(tree, 'player-scorecard-thru')[0])).toBe('Thru 5');
    expect(textOf(byId(tree, 'scorecard-strokes-p1-5')[0])).toBe('4');
    expect(textOf(byId(tree, 'scorecard-strokes-p1-6')[0])).toBe('');
    expect(textOf(byId(tree, 'scorecard-topar-p1-6')[0])).toBe('');
    // Back nine has no played holes: its summary cells stay blank.
    expect(textOf(byId(tree, 'scorecard-back-strokes')[0])).toBe('');
  } finally {
    await act(async () => tree.unmount());
  }
});

test('9-hole round with 16 players: any row opens, no back-nine table', async () => {
  const { contest, players } = makeContest(16, 9, (i, n) => Array(n).fill(3 + (i % 4)));
  const Screen = loadScreen(contest, players);
  const tree = await render(Screen);
  try {
    const rows = tree.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('leaderboard-open-scorecard-') && n.type === 'Pressable');
    expect(rows.length).toBe(16);
    const last = tree.root.findAll((n) => n.props.testID === 'leaderboard-open-scorecard-p16')[0];
    await act(async () => { last.props.onPress(); });
    expect(textOf(byId(tree, 'player-scorecard-name')[0])).toBe('Player 16');
    expect(byId(tree, 'scorecard-front').length).toBe(1);
    expect(byId(tree, 'scorecard-back').length).toBe(0);
  } finally {
    await act(async () => tree.unmount());
  }
});

test('net-unavailable course hides every Net cell', () => {
  const course = { name: 'NoHcp', holes: Array.from({ length: 9 }, (_, i) => ({ num: i + 1, par: 4 })) };
  const card = playerScorecard.buildPlayerScorecard({ id: 'x', name: 'X', handicap: 10, scores: Array(9).fill(5) }, course);
  let tree;
  act(() => { tree = create(React.createElement(PlayerScorecardView, { card, onClose: () => {} })); });
  expect(card.netAvailable).toBe(false);
  expect(byId(tree, 'player-scorecard-net').length).toBe(0);
  expect(tree.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('scorecard-net-')).length).toBe(0);
  act(() => tree.unmount());
});

test('score shapes: circle under par, square over, filled at eagle / double bogey', () => {
  expect(scoreShape(null)).toEqual({ shape: 'none', filled: false });
  expect(scoreShape(0)).toEqual({ shape: 'none', filled: false });
  expect(scoreShape(-1)).toEqual({ shape: 'circle', filled: false });
  expect(scoreShape(-2)).toEqual({ shape: 'circle', filled: true });
  expect(scoreShape(1)).toEqual({ shape: 'square', filled: false });
  expect(scoreShape(2)).toEqual({ shape: 'square', filled: true });
});
