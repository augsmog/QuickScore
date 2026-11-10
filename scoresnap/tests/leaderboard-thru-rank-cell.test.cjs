// AUG-253k (parent AUG-253): the virtualized leaderboard cell must render its
// rank label and THRU from the row model (buildLeaderboardRows: rankLabel +
// thru), not from a per-row recompute. These tests render the real
// LeaderboardResultsList through a pass-through FlashList mock and assert the
// cell text for a tie (T<rank>), a finished player (F), a partial player (hole
// count) and a no-score player (em-dash) — on a 16-player fixture.
//
// Two paths are covered: (1) the production path where the screen supplies the
// row-model rank map (buildLeaderboardRows output, as app/contest/[id]/index.tsx
// does), and (2) the no-map fallback where the component builds the same values
// once internally (proving the old O(n) results.findIndex/filter per-row
// recompute is gone).
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

const calc = load('src/engine/calculators/stroke-play.ts', { '../types': {} });
const rowsMod = load('src/engine/leaderboard-rows.ts', { './types': {} });

const HOLES = Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4 }));
const COURSE = { name: 'Synthetic course', holes: HOLES };
const CONTEST = { id: 'synthetic-16', isTournament: true, hasTeams: false, course: COURSE };

// Scores summing to a target, spread over the first `played` holes (rest blank).
function scoresOver(played, total) {
  const s = Array(18).fill(0);
  if (played <= 0) return s;
  for (let i = 0; i < played; i++) s[i] = 4;
  let delta = total - played * 4;
  let i = 0;
  let guard = 0;
  while (delta !== 0 && guard < 10000) {
    if (delta > 0) {
      s[i] += 1;
      delta -= 1;
    } else if (s[i] > 1) {
      s[i] -= 1;
      delta += 1;
    }
    i = (i + 1) % played;
    guard++;
  }
  return s;
}

// 16 players:
//  p04 no-show (0 holes, total 0)        -> THRU em-dash, rank 1
//  p03 partial (9 holes, total 36)       -> THRU 9, rank 2
//  p01, p02 finished (18 holes, total 72)-> THRU F, tie -> T3
//  p05..p16 finished, totals 73..84      -> THRU F, distinct ranks
function makePlayers() {
  const players = [
    { id: 'p01', name: 'P01', handicap: 0, scores: scoresOver(18, 72) },
    { id: 'p02', name: 'P02', handicap: 0, scores: scoresOver(18, 72) },
    { id: 'p03', name: 'P03', handicap: 0, scores: scoresOver(9, 36) },
    { id: 'p04', name: 'P04', handicap: 0, scores: scoresOver(0, 0) },
  ];
  for (let k = 5; k <= 16; k++) {
    players.push({
      id: `p${String(k).padStart(2, '0')}`,
      name: `P${String(k).padStart(2, '0')}`,
      handicap: 0,
      scores: scoresOver(18, 68 + k), // 73..84, all distinct
    });
  }
  return players;
}

function flashListPassThrough() {
  return function FlashListMock(props) {
    const { data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent } = props;
    const window = data.map((item, index) =>
      React.createElement(
        React.Fragment,
        { key: keyExtractor ? keyExtractor(item, index) : index },
        renderItem({ item, index }),
      ),
    );
    return React.createElement(
      'FlashListMock',
      null,
      ListHeaderComponent || null,
      ...window,
      ListFooterComponent || null,
    );
  };
}

function componentDeps() {
  return {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@shopify/flash-list': { FlashList: flashListPassThrough() },
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

// Pull the text content out of the Text node carrying `testID`.
function textFor(tree, testID) {
  const node = tree.root.find((n) => (n.props.testID || '') === testID);
  const kids = [].concat(node.children);
  return kids.map((c) => (typeof c === 'string' ? c : (c.props && c.props.children) ?? '')).join('');
}

async function renderList(extraProps) {
  const players = makePlayers();
  const results = calc.calcStrokePlay(players, COURSE);
  const { LeaderboardResultsList } = load(
    'src/components/LeaderboardResultsList.tsx',
    componentDeps(),
  );
  let tree;
  await act(async () => {
    tree = create(
      React.createElement(LeaderboardResultsList, {
        results,
        allPlayers: players,
        recentPlayers: players,
        contest: CONTEST,
        ListHeaderComponent: null,
        ListFooterComponent: null,
        ...extraProps,
      }),
    );
  });
  return { tree, results };
}

// A production-shaped rank map, exactly as index.tsx builds it from the row model.
function rankMap(results, players) {
  const rows = rowsMod.buildLeaderboardRows(results, players, { holeCount: 18 });
  return new Map(
    rows.map((r) => [r.playerId, { rankLabel: r.rankLabel, tied: r.tied, thru: r.thru, isYou: false }]),
  );
}

test('cell renders rankLabel + THRU from the supplied row model (production path)', async () => {
  const players = makePlayers();
  const results = calc.calcStrokePlay(players, COURSE);
  const { tree } = await renderList({ rankByPlayerId: rankMap(results, players) });
  try {
    // THRU: finished -> F, partial -> hole count, no-score -> em-dash.
    expect(textFor(tree, 'leaderboard-thru-P01')).toBe('F');
    expect(textFor(tree, 'leaderboard-thru-P02')).toBe('F');
    expect(textFor(tree, 'leaderboard-thru-P03')).toBe('9');
    expect(textFor(tree, 'leaderboard-thru-P04')).toBe('—');
    // Tie: P01 and P02 share the total (72) -> same T<rank> label.
    expect(textFor(tree, 'leaderboard-rank-P01')).toBe('T3');
    expect(textFor(tree, 'leaderboard-rank-P02')).toBe('T3');
    // No-show sorts to the top (total 0) -> rank 1; partial -> rank 2; next distinct skips to 5.
    expect(textFor(tree, 'leaderboard-rank-P04')).toBe('1');
    expect(textFor(tree, 'leaderboard-rank-P03')).toBe('2');
    expect(textFor(tree, 'leaderboard-rank-P05')).toBe('5');
  } finally {
    await act(async () => tree.unmount());
  }
});

test('cell derives the same rankLabel + THRU when no row map is supplied (fallback path)', async () => {
  // No rankByPlayerId: the component builds ranks + THRU once internally, so the
  // old per-row results.findIndex/filter recompute is gone but the output matches.
  const { tree } = await renderList({});
  try {
    expect(textFor(tree, 'leaderboard-thru-P01')).toBe('F');
    expect(textFor(tree, 'leaderboard-thru-P03')).toBe('9');
    expect(textFor(tree, 'leaderboard-thru-P04')).toBe('—');
    expect(textFor(tree, 'leaderboard-rank-P01')).toBe('T3');
    expect(textFor(tree, 'leaderboard-rank-P02')).toBe('T3');
    expect(textFor(tree, 'leaderboard-rank-P05')).toBe('5');
  } finally {
    await act(async () => tree.unmount());
  }
});

test('formatThru maps the row-model thru values to display text', async () => {
  const { formatThru } = load('src/components/LeaderboardResultsList.tsx', componentDeps());
  expect(formatThru('F')).toBe('F');
  expect(formatThru(12)).toBe('12');
  expect(formatThru(0)).toBe('0');
  expect(formatThru(null)).toBe('—');
  expect(formatThru(undefined)).toBe('—');
});
