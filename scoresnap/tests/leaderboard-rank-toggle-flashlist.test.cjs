// AUG-253b: after the individual leaderboard was virtualized with FlashList, the Gross/Net
// toggle (AUG-607) lives in the list's ListHeaderComponent. This test proves the toggle is
// still wired through the virtualized list: pressing Net on the screen flips rankMode, which
// re-ranks via buildLeaderboard, and the NEW ranked rows are the data handed to FlashList.
// Regression guard: a toggle that stopped re-ranking the FlashList data (e.g. stale rows, or
// the toggle dropped out of the header) would leave `capture.data` unchanged after the press.
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

test('Gross/Net toggle inside the FlashList header still re-ranks the virtualized rows', async () => {
  const players = [
    { id: 'p1', name: 'Alice', handicap: 0, scores: Array(18).fill(4) },
    { id: 'p2', name: 'Bob', handicap: 18, host: true, scores: Array(18).fill(5) },
  ];
  const groups = [
    { id: 'g1', name: 'Field A', players: [players[0]] },
    { id: 'g2', name: 'Field B', players: [players[1]] },
  ];
  const course = { name: 'Course', holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })) };
  const contest = {
    id: 'c-rank', isTournament: true, hasTeams: false, groups,
    rounds: [{ number: 1, groups }], currentRound: 1, games: [], course,
  };

  // Gross ranks Alice first (fewer strokes); Net ranks Bob first (18 handicap strokes).
  const grossRows = [
    { playerId: 'p1', name: 'Alice', total: 72, toPar: 0 },
    { playerId: 'p2', name: 'Bob', total: 90, toPar: 18 },
  ];
  const netRows = [
    { playerId: 'p2', name: 'Bob', total: 72, toPar: 0 },
    { playerId: 'p1', name: 'Alice', total: 72, toPar: 0 },
  ];
  const teamRows = [
    { id: 'g1/A', playerId: 'g1/A', name: 'Team A', handicap: 0, scores: Array(18).fill(4), total: 70, toPar: -2 },
    { id: 'g2/A', playerId: 'g2/A', name: 'Team A', handicap: 0, scores: Array(18).fill(5), total: 75, toPar: 3 },
  ];

  // Passthrough FlashList that records the `data` (ranked rows) it was handed on every
  // render and renders the header (where the toggle lives) + every row via renderItem.
  const capture = {};
  const passthroughFlashList = (props) => {
    capture.data = props.data;
    const { data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent } = props;
    return React.createElement(
      'FlashListMock',
      null,
      ListHeaderComponent || null,
      ...data.map((item, index) =>
        React.createElement(
          React.Fragment,
          { key: keyExtractor ? keyExtractor(item, index) : index },
          renderItem({ item, index }),
        ),
      ),
      ListFooterComponent || null,
    );
  };

  const theme = {
    COLORS: new Proxy({}, { get: (_, key) => String(key) }),
    FONTS: new Proxy({}, { get: (_, key) => String(key) }),
    TYPOGRAPHY: { caption: {} },
    RADII: new Proxy({}, { get: () => 8 }),
  };
  const rn = { View: 'View', Text: 'Text', ScrollView: 'ScrollView' };
  // AnimatedPressable as a real passthrough so onPress is reachable on a tree node.
  const AnimatedPressable = (props) => React.createElement('Pressable', props, props.children);

  const { LeaderboardResultsList } = load('src/components/LeaderboardResultsList.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@shopify/flash-list': { FlashList: passthroughFlashList },
    'react-native': rn,
    '../ui/theme': theme,
    '../utils/formatters': { formatToPar: (value) => (value === 0 ? 'E' : String(value)) },
    '../ui/leaderboard-hole-strip': load('src/ui/leaderboard-hole-strip.ts', {}),
  });

  const deps = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': rn,
    'expo-router': { useLocalSearchParams: () => ({ id: contest.id }) },
    'lucide-react-native': { Flag: 'Flag' },
    '../../../src/ui/theme': theme,
    '../../../src/stores/contest-store': {
      useContestStore: (selector) => selector({ contests: [contest] }),
      getTournamentPlayers: () => players,
      getActiveGroups: () => groups,
    },
    '../../../src/engine/contest-results': {
      teamCardPlayers: (value) => value.gameConfig ? teamRows : players,
      liveRoundCourse: (value) => value.course,
    },
    '../../../src/engine/calculators/stroke-play': { calcStrokePlay: () => grossRows },
    '../../../src/engine/calculators/leaderboard-view': {
      buildLeaderboard: (rankedPlayers, _course, rankMode) => ({
        rows: rankedPlayers === teamRows ? teamRows : rankMode === 'net' ? netRows : grossRows,
        netAvailable: true,
        mode: rankMode === 'net' ? 'net' : 'gross',
      }),
    },
    '../../../src/engine/leaderboard-rows': load('src/engine/leaderboard-rows.ts', {}),
    '../../../src/ui/leaderboard-hole-strip': load('src/ui/leaderboard-hole-strip.ts', {}),
    '../../../src/utils/formatters': { formatToPar: (value) => (value === 0 ? 'E' : String(value)) },
    '../../../src/ui/AnimatedPressable': { AnimatedPressable },
    '../../../src/components/LeaderboardResultsList': { LeaderboardResultsList },
  };

  const Screen = load('app/contest/[id]/index.tsx', deps).default;
  let tree;
  try {
    await act(async () => {
      tree = create(React.createElement(Screen));
    });

    // The toggle is rendered as part of what FlashList shows (its ListHeaderComponent).
    const netToggle = tree.root.findAll((n) => n.props.testID === 'leaderboard-rank-net');
    expect(netToggle.length).toBeGreaterThanOrEqual(1);
    // Default is Gross: FlashList data is the gross ranking (Alice first).
    expect(capture.data.map((r) => r.playerId)).toEqual(['p1', 'p2']);

    const myGroup = tree.root.findByProps({ testID: 'leaderboard-my-group' });
    await act(async () => myGroup.props.onPress());
    expect(capture.data.map((r) => r.playerId)).toEqual(['p2']);
    expect(tree.root.findByProps({ testID: 'leaderboard-rank-p2' }).children.join('')).toBe('2');
    await act(async () => myGroup.props.onPress());
    expect(capture.data.map((r) => r.playerId)).toEqual(['p1', 'p2']);
    await act(async () => myGroup.props.onPress());
    await act(async () => netToggle[0].props.onPress());
    expect(capture.data.map((r) => r.playerId)).toEqual(['p2']);
    await act(async () => myGroup.props.onPress());
    expect(capture.data.map((r) => r.playerId)).toEqual(['p2', 'p1']);

    // FlashList now holds the NET ranking (Bob first) — the toggle re-ranked the list.

    // Team-card IDs include their source group, so My group still selects the host's cards.
    contest.gameConfig = { rulesVersion: 1 };
    contest.games = ['alternate_shot'];
    await act(async () => tree.update(React.createElement(Screen)));
    expect(capture.data.map((r) => r.playerId)).toEqual(['g1/A', 'g2/A']);
    const teamMyGroup = tree.root.findByProps({ testID: 'leaderboard-my-group' });
    await act(async () => teamMyGroup.props.onPress());
    expect(capture.data.map((r) => r.playerId)).toEqual(['g2/A']);
    expect(tree.root.findByProps({ testID: 'leaderboard-rank-g2/A' }).children.join('')).toBe('2');

    // An ungrouped viewer gets a disabled control and a clear one-line explanation.
    players[1].host = false;
    await act(async () => teamMyGroup.props.onPress());
    await act(async () => tree.update(React.createElement(Screen)));
    const disabledMyGroup = tree.root.findByProps({ testID: 'leaderboard-my-group' });
    expect(disabledMyGroup.props.accessibilityState.disabled).toBe(true);
    expect(tree.root.findByProps({ testID: 'leaderboard-my-group-empty' }).children.join(''))
      .toContain('not assigned to a group');
    await act(async () => disabledMyGroup.props.onPress());
    expect(capture.data.map((r) => r.playerId)).toEqual(['g1/A', 'g2/A']);
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});
