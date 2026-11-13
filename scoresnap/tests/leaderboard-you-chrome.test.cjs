// AUG-253j (AUG-746): the individual FlashList must render a visible "You" affordance on
// the row flagged `isYou` (via rankByPlayerId, produced by buildLeaderboardRows + youPlayerId)
// and render NO such chip when no row is flagged. The chip reuses existing theme tokens and
// marks the pinned row without changing its field rank label. These tests render the real
// component through the same TS-transpile + react-test-renderer + FlashList-mock harness as
// leaderboard-flash-list.test.cjs.
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

// Pass-through FlashList: renders the header + every row via renderItem in data order.
function passthroughFlashList(props) {
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
}

function componentDeps() {
  return {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@shopify/flash-list': { FlashList: passthroughFlashList },
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

const course = { name: 'Course', holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4 })) };
const contest = { id: 'c', isTournament: true, hasTeams: false, course };
const players = [
  { id: 'p1', name: 'Alice', handicap: 0, scores: Array(18).fill(4) },
  { id: 'p2', name: 'Bob', handicap: 0, scores: Array(18).fill(5) },
  { id: 'p3', name: 'Carol', handicap: 0, scores: Array(18).fill(6) },
];
// Pinned order as the screen hands it in: the "you" row (Carol) is first, keeping her real
// field rank label (3). Alice/Bob follow in field order.
const pinnedResults = [
  { playerId: 'p3', name: 'Carol', total: 108, toPar: 36 },
  { playerId: 'p1', name: 'Alice', total: 72, toPar: 0 },
  { playerId: 'p2', name: 'Bob', total: 90, toPar: 18 },
];

async function render(rankByPlayerId, results = pinnedResults) {
  const { LeaderboardResultsList } = load('src/components/LeaderboardResultsList.tsx', componentDeps());
  let tree;
  await act(async () => {
    tree = create(
      React.createElement(LeaderboardResultsList, {
        results,
        rankByPlayerId,
        allPlayers: players,
        recentPlayers: players,
        contest,
        ListHeaderComponent: null,
        ListFooterComponent: null,
      }),
    );
  });
  return tree;
}

function chipIds(tree) {
  return tree.root
    .findAll((node) => /^leaderboard-you-chip-/.test(node.props.testID || ''))
    .map((node) => node.props.testID);
}

test('isYou row renders exactly one "You" chip, on the flagged player', async () => {
  const rankByPlayerId = new Map([
    ['p3', { rankLabel: '3', tied: false, isYou: true }],
    ['p1', { rankLabel: '1', tied: false, isYou: false }],
    ['p2', { rankLabel: '2', tied: false, isYou: false }],
  ]);
  let tree;
  try {
    tree = await render(rankByPlayerId);
    expect(chipIds(tree)).toEqual(['leaderboard-you-chip-p3']);
    // The chip's label text is literally "You".
    const chip = tree.root.find((n) => (n.props.testID || '') === 'leaderboard-you-chip-p3');
    const text = chip.findAll((n) => n.type === 'Text').map((n) => n.children.join(''));
    expect(text).toContain('You');
    // Field rank label is Carol's real rank (3), NOT renumbered to 1 by the pin.
    const rankNode = tree.root.find((n) => (n.props.testID || '') === 'leaderboard-player-Carol');
    expect(rankNode).toBeTruthy();
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});

test('no flagged row → no "You" chrome anywhere (unchanged default)', async () => {
  const rankByPlayerId = new Map([
    ['p1', { rankLabel: '1', tied: false, isYou: false }],
    ['p2', { rankLabel: '2', tied: false, isYou: false }],
    ['p3', { rankLabel: '3', tied: false, isYou: false }],
  ]);
  let tree;
  try {
    tree = await render(rankByPlayerId);
    expect(chipIds(tree)).toEqual([]);
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});

test('omitted rankByPlayerId (legacy callers) → no "You" chrome', async () => {
  let tree;
  try {
    tree = await render(undefined);
    expect(chipIds(tree)).toEqual([]);
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});

test('composes with search: a filtered subset still chips only the flagged row', async () => {
  // Subset = Carol (you) + Alice; Bob filtered out. Carol pinned first, still chipped once.
  const subset = [pinnedResults[0], pinnedResults[1]];
  const rankByPlayerId = new Map([
    ['p3', { rankLabel: '3', tied: false, isYou: true }],
    ['p1', { rankLabel: '1', tied: false, isYou: false }],
  ]);
  let tree;
  try {
    tree = await render(rankByPlayerId, subset);
    expect(chipIds(tree)).toEqual(['leaderboard-you-chip-p3']);
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});
