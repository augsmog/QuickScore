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

// AUG-735 (AUG-253g): search on the FlashList individual leaderboard. Ranks are
// fixed over the full field before filtering (AUG-675 contract), so a searched
// subset keeps real field ranks and the empty query shows everyone.
//
// Deterministic 5-player field with a tied lead and 18-hole hcp map so net is available
// and the Gross/Net toggle renders in the header.
function buildScreen() {
  const roster = [
    { id: 'p1', name: 'Amy Adams', per: 3 },
    { id: 'p2', name: 'Bob Brown', per: 3 },
    { id: 'p3', name: 'Cara Cole', per: 5 },
    { id: 'p4', name: 'Dan Diaz', per: 6 },
    { id: 'p5', name: 'Eve Evans', per: 7 },
  ];
  const players = roster.map((r) => ({
    id: r.id,
    name: r.name,
    handicap: 0,
    scores: Array(18).fill(r.per),
  }));
  const groups = [{ id: 'group-1', name: 'Field', players }];
  const contest = {
    id: 'synthetic-search',
    isTournament: true,
    groups,
    rounds: [{ number: 1, groups }],
    currentRound: 1,
    games: [],
    hasTeams: false,
    course: {
      name: 'Synthetic course',
      holes: Array.from({ length: 18 }, (_, index) => ({ num: index + 1, par: 4, hcp: index + 1 })),
    },
  };
  const rn = { View: 'View', Text: 'Text', ScrollView: 'ScrollView', TextInput: 'TextInput' };
  const theme = {
    COLORS: new Proxy({}, { get: (_, key) => String(key) }),
    FONTS: new Proxy({}, { get: (_, key) => String(key) }),
    TYPOGRAPHY: {},
    RADII: new Proxy({}, { get: (_, key) => 8 }),
  };
  const strokePlay = load('src/engine/calculators/stroke-play.ts', { '../types': {} });
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
      teamCardPlayers: () => players,
      liveRoundCourse: (value) => value.course,
    },
    '../../../src/engine/calculators/stroke-play': strokePlay,
    '../../../src/engine/calculators/leaderboard-view': load('src/engine/calculators/leaderboard-view.ts', {
      '../types': {},
      './stroke-play': strokePlay,
      './net-stroke-play': load('src/engine/calculators/net-stroke-play.ts', {
        '../types': {},
        './skins': load('src/engine/calculators/skins.ts', { '../types': {} }),
        './stroke-play': strokePlay,
      }),
    }),
    '../../../src/engine/leaderboard-rows': load('src/engine/leaderboard-rows.ts', { './types': {} }),
    '../../../src/engine/you-fixture': load('src/engine/you-fixture.ts', {}),
    '../../../src/ui/leaderboard-hole-strip': load('src/ui/leaderboard-hole-strip.ts', {}),
    '../../../src/utils/formatters': { formatToPar: (value) => (value === 0 ? 'E' : String(value)) },
    '../../../src/ui/AnimatedPressable': { AnimatedPressable: 'Pressable' },
  };
  const passthroughFlashList = (props) => {
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
  const { LeaderboardResultsList } = load('src/components/LeaderboardResultsList.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@shopify/flash-list': { FlashList: passthroughFlashList },
    'react-native': rn,
    '../ui/theme': theme,
    '../utils/formatters': { formatToPar: (value) => (value === 0 ? 'E' : String(value)) },
    '../ui/leaderboard-hole-strip': load('src/ui/leaderboard-hole-strip.ts', {}),
  });
  deps['../../../src/components/LeaderboardResultsList'] = { LeaderboardResultsList };
  return load('app/contest/[id]/index.tsx', deps).default;
}

function rowTestIds(tree) {
  return tree.root
    .findAll((node) => /^leaderboard-player-/.test(node.props.testID || ''))
    .map((node) => node.props.testID);
}

function search(tree, text) {
  const input = tree.root.find((node) => (node.props.testID || '') === 'leaderboard-search');
  act(() => {
    input.props.onChangeText(text);
  });
}

async function mount() {
  const Screen = buildScreen();
  let tree;
  await act(async () => {
    tree = create(React.createElement(Screen));
  });
  return tree;
}

test('empty query shows the full field', async () => {
  const tree = await mount();
  try {
    expect(rowTestIds(tree)).toHaveLength(5);
  } finally {
    await act(async () => tree.unmount());
  }
});

test('substring search filters rows and is case-insensitive', async () => {
  const tree = await mount();
  try {
    search(tree, 'cole');
    expect(rowTestIds(tree)).toEqual(['leaderboard-player-Cara Cole']);

    search(tree, 'COLE');
    expect(rowTestIds(tree)).toEqual(['leaderboard-player-Cara Cole']);

    // Partial match across multiple players (shared "a" in several names).
    search(tree, 'da');
    expect(rowTestIds(tree).sort()).toEqual(['leaderboard-player-Amy Adams', 'leaderboard-player-Dan Diaz']);

    // Clearing the query restores the full field.
    search(tree, '');
    expect(rowTestIds(tree)).toHaveLength(5);
  } finally {
    await act(async () => tree.unmount());
  }
});

test('filtered row keeps its field rank (ranks computed before the filter)', async () => {
  const tree = await mount();
  try {
    // Cara Cole is 3rd by gross total in the full field.
    search(tree, 'cara');
    const rankNode = tree.root.find(
      (node) => (node.props.testID || '') === 'leaderboard-player-Cara Cole',
    );
    const rankText = rankNode.findAll((n) => typeof n.children?.[0] === 'string')[0];
    expect(rankText.children[0]).toBe('3');
  } finally {
    await act(async () => tree.unmount());
  }
});

test('FlashList cells display tied rank labels from the leaderboard row model', async () => {
  const tree = await mount();
  try {
    for (const playerId of ['p1', 'p2']) {
      const rank = tree.root.find((node) => node.props.testID === `leaderboard-rank-${playerId}`);
      expect(rank.children[0]).toBe('T1');
    }
  } finally {
    await act(async () => tree.unmount());
  }
});

test('Gross/Net toggle and recent-hole strip still render while searching', async () => {
  const tree = await mount();
  try {
    search(tree, 'cara');
    // Gross/Net toggle lives in the list header (net is available for the 18-hole hcp course).
    expect(tree.root.findAll((n) => (n.props.testID || '') === 'leaderboard-rank-toggle')).toHaveLength(1);
    // Recent-hole strip chips still render on the visible row.
    const chips = tree.root.findAll((n) => /^leaderboard-hole-chip-p3-/.test(n.props.testID || ''));
    expect(chips.length).toBeGreaterThan(0);
    // Search field remains in the header.
    expect(tree.root.findAll((n) => (n.props.testID || '') === 'leaderboard-search')).toHaveLength(1);
  } finally {
    await act(async () => tree.unmount());
  }
});
