// AUG-614: the tournament leaderboard individual view must virtualize its rows with
// @shopify/flash-list instead of eagerly mapping every row. These tests prove the
// virtualization contract (full dataset + renderItem + stable keyExtractor handed to
// FlashList) and that a windowing list mounts fewer than the full 72 rows while keeping
// calcStrokePlay ordering.
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

function makeFixtures() {
  const players = Array.from({ length: 72 }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${String(index + 1).padStart(2, '0')}`,
    handicap: 0,
    scores: Array(18).fill(4 + (index % 3)),
  }));
  const course = {
    name: 'Synthetic course',
    holes: Array.from({ length: 18 }, (_, index) => ({ num: index + 1, par: 4 })),
  };
  const contest = { id: 'synthetic-72', isTournament: true, hasTeams: false, course };
  return { players, course, contest };
}

function displayRows(results, overrides = {}) {
  return results.map((result, index) => ({
    ...result,
    rankLabel: `${index + 1}`,
    thru: 'F',
    ...overrides[result.playerId],
  }));
}

// FlashList stand-in. `visibleCount` controls how many rows the list chooses to
// materialize — real FlashList decides this from layout, so the component itself must
// render NONE of the rows directly and hand everything to the list. The mock records the
// props it received so the test can assert the full dataset + renderItem + keyExtractor
// were delegated, and renders exactly the rows the list asks for (in data order).
function flashListMock(capture, visibleCount) {
  return function FlashListMock(props) {
    capture.props = props;
    const { data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent } = props;
    const count = visibleCount === undefined ? data.length : Math.min(visibleCount, data.length);
    const window = data.slice(0, count).map((item, index) =>
      React.createElement(
        React.Fragment,
        { key: keyExtractor ? keyExtractor(item, index) : index },
        renderItem({ item, index }),
      ),
    );
    return React.createElement('FlashListMock', null, ListHeaderComponent || null, ...window, ListFooterComponent || null);
  };
}

function componentDeps(capture, visibleCount) {
  return {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@shopify/flash-list': { FlashList: flashListMock(capture, visibleCount) },
    'react-native': { View: 'View', Text: 'Text' },
    '../ui/theme': {
      COLORS: new Proxy({}, { get: (_, key) => String(key) }),
      FONTS: new Proxy({}, { get: (_, key) => String(key) }),
      RADII: new Proxy({}, { get: () => 8 }),
    },
    '../ui/leaderboard-hole-strip': load('src/ui/leaderboard-hole-strip.ts', {}),
    '../utils/formatters': { formatToPar: (value) => (value === 0 ? 'E' : String(value)) },
  };
}

const calc = load('src/engine/calculators/stroke-play.ts', { '../types': {} });

test('individual leaderboard hands the full 72-row dataset + renderItem + keyExtractor to FlashList', async () => {
  const { players, course, contest } = makeFixtures();
  const results = displayRows(calc.calcStrokePlay(players, course));
  const capture = {};
  const { LeaderboardResultsList } = load('src/components/LeaderboardResultsList.tsx', componentDeps(capture));

  let tree;
  try {
    await act(async () => {
      tree = create(
        React.createElement(LeaderboardResultsList, {
          results,
          allPlayers: players,
          recentPlayers: players,
          contest,
          ListHeaderComponent: null,
          ListFooterComponent: null,
        }),
      );
    });

    // Virtualization contract: the whole result set is handed to FlashList as `data`,
    // rendered lazily via renderItem, keyed by a stable player id. This fails if the row
    // list is ever reverted to an eager results.map (FlashList would receive no data).
    expect(capture.props.data).toHaveLength(72);
    expect(typeof capture.props.renderItem).toBe('function');
    expect(typeof capture.props.keyExtractor).toBe('function');
    expect(capture.props.keyExtractor(results[0], 0)).toBe(results[0].playerId);
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});

test('the component materializes no rows itself — row count is FlashList-controlled (< 72)', async () => {
  // With a FlashList that reports zero visible rows (as the real list does before layout),
  // the component itself renders NO leaderboard rows: every row is materialized by the
  // list, not pre-rendered by the screen. An eager results.map would render all 72 here.
  const { players, course, contest } = makeFixtures();
  const results = displayRows(calc.calcStrokePlay(players, course));
  const capture = {};
  const { LeaderboardResultsList } = load(
    'src/components/LeaderboardResultsList.tsx',
    componentDeps(capture, 0),
  );

  let tree;
  try {
    await act(async () => {
      tree = create(
        React.createElement(LeaderboardResultsList, {
          results, allPlayers: players, recentPlayers: players, contest,
          ListHeaderComponent: null, ListFooterComponent: null,
        }),
      );
    });
    const rows = tree.root.findAll((node) => /^leaderboard-player-/.test(node.props.testID || ''));
    expect(rows).toHaveLength(0);
    expect(rows.length).toBeLessThan(72);
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});

test('renderItem produces every row in calcStrokePlay order', async () => {
  // Drive renderItem for the whole dataset (pass-through list) and confirm each row is
  // correct and ordering matches calcStrokePlay output.
  const { players, course, contest } = makeFixtures();
  const results = displayRows(calc.calcStrokePlay(players, course));
  const capture = {};
  const { LeaderboardResultsList } = load('src/components/LeaderboardResultsList.tsx', componentDeps(capture));

  let tree;
  try {
    await act(async () => {
      tree = create(
        React.createElement(LeaderboardResultsList, {
          results, allPlayers: players, recentPlayers: players, contest,
          ListHeaderComponent: null, ListFooterComponent: null,
        }),
      );
    });
    const rows = tree.root.findAll((node) => /^leaderboard-player-/.test(node.props.testID || ''));
    expect(rows).toHaveLength(72);
    expect(rows.map((node) => node.props.testID)).toEqual(
      results.map((r) => `leaderboard-player-${r.name}`),
    );
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});

test('FlashList cells display the precomputed rank label and THRU values', async () => {
  const { players, course, contest } = makeFixtures();
  const calculated = calc.calcStrokePlay(players, course);
  const results = displayRows(calculated, {
    'player-1': { rankLabel: 'T1', thru: 'F' },
    'player-2': { rankLabel: 'T1', thru: 9 },
    'player-3': { rankLabel: '3', thru: null },
  });
  const capture = {};
  const { LeaderboardResultsList } = load('src/components/LeaderboardResultsList.tsx', componentDeps(capture));
  let tree;
  try {
    await act(async () => {
      tree = create(React.createElement(LeaderboardResultsList, {
        results, allPlayers: players, recentPlayers: players, contest,
        ListHeaderComponent: null, ListFooterComponent: null,
      }));
    });
    const textFor = (id) => tree.root.find((node) => node.props.testID === id).children.join('');
    expect(textFor('leaderboard-rank-player-1')).toBe('T1');
    expect(textFor('leaderboard-thru-player-1')).toBe('F');
    expect(textFor('leaderboard-rank-player-2')).toBe('T1');
    expect(textFor('leaderboard-thru-player-2')).toBe('9');
    expect(textFor('leaderboard-rank-player-3')).toBe('3');
    expect(textFor('leaderboard-thru-player-3')).toBe('—');
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});
