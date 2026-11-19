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
    }, module, module.exports,
  );
  return module.exports;
}

const theme = {
  COLORS: new Proxy({}, { get: (_, key) => String(key) }),
  FONTS: new Proxy({}, { get: (_, key) => String(key) }),
  RADII: new Proxy({}, { get: (_, key) => 8 }),
};
const passthroughFlashList = (props) => React.createElement(
  'FlashListMock', null,
  props.ListHeaderComponent,
  ...props.data.map((item, index) => React.createElement(
    React.Fragment,
    { key: props.keyExtractor(item, index) },
    props.renderItem({ item, index }),
  )),
  props.ListFooterComponent,
);
const { LeaderboardResultsList } = load('src/components/LeaderboardResultsList.tsx', {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@shopify/flash-list': { FlashList: passthroughFlashList },
  'react-native': { View: 'View', Text: 'Text' },
  '../ui/theme': theme,
  '../utils/formatters': { formatToPar: (value) => value === 0 ? 'E' : value > 0 ? `+${value}` : `${value}` },
  '../ui/leaderboard-hole-strip': { lastThreePlayedHoleChips: () => [] },
});
const { buildLeaderboardRows } = load('src/engine/leaderboard-rows.ts', { './types': {} });

const course = { name: 'Round columns GC', holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })) };
const contest = { id: 'round-columns', name: 'Round Columns', course, hasTeams: false, groups: [], games: [] };
const result = { playerId: 'p1', name: 'Ada Player', total: 70, toPar: -2, front: 35, back: 35 };
const player = { id: 'p1', name: 'Ada Player', handicap: 0, scores: Array(18).fill(4) };

async function render(rankByPlayerId, results = [result], allPlayers = [player]) {
  let tree;
  await act(async () => {
    tree = create(React.createElement(LeaderboardResultsList, {
      results, rankByPlayerId, allPlayers, recentPlayers: allPlayers, contest,
      ListHeaderComponent: null, ListFooterComponent: null,
    }));
  });
  return tree;
}
function cellText(tree, id) {
  const node = tree.root.find((item) => item.props.testID === id);
  return node.children.join('');
}

test('multi-round row renders R1 total and signed Today to-par in a 44pt row', async () => {
  const tree = await render(new Map([['p1', {
    rankLabel: '1', tied: false, r1: { total: 72, toPar: 0 }, today: { total: 70, toPar: -1 },
  }]]));
  try {
    expect(tree.root.findAll((node) => node.props.testID === 'leaderboard-round-columns')).toHaveLength(1);
    expect(cellText(tree, 'leaderboard-r1-p1')).toBe('72');
    expect(cellText(tree, 'leaderboard-today-p1')).toBe('−1');
    expect(tree.root.find((node) => node.props.testID === 'leaderboard-player-Ada Player').props.style.height).toBe(44);
  } finally {
    await act(async () => tree.unmount());
  }
});

test('absent round fields leave the legacy row without R1/Today cells', async () => {
  const tree = await render(new Map([['p1', { rankLabel: '1', tied: false }]]));
  try {
    expect(tree.root.findAll((node) => node.props.testID === 'leaderboard-round-columns')).toHaveLength(0);
    expect(tree.root.findAll((node) => /^leaderboard-(r1|today)-/.test(node.props.testID || ''))).toHaveLength(0);
  } finally {
    await act(async () => tree.unmount());
  }
});

test('null round results render em dashes', async () => {
  const tree = await render(new Map([['p1', { rankLabel: '1', tied: false, r1: null, today: null }]]));
  try {
    expect(cellText(tree, 'leaderboard-r1-p1')).toBe('—');
    expect(cellText(tree, 'leaderboard-today-p1')).toBe('—');
  } finally {
    await act(async () => tree.unmount());
  }
});

test('search plus pinned You keeps full-field rank and per-round values', async () => {
  const results = [
    { playerId: 'p1', name: 'Alice Adams', total: 69, toPar: -3 },
    { playerId: 'p2', name: 'Bob Brown', total: 72, toPar: 0 },
    { playerId: 'p3', name: 'Cara Cole', total: 75, toPar: 3 },
  ];
  const players = results.map((row) => ({ ...row, handicap: 0, scores: Array(18).fill(4) }));
  const rows = buildLeaderboardRows(results, players, {
    holeCount: 18, query: 'cara', youPlayerId: 'p3',
    roundInfo: {
      r1: results.map((row) => ({ ...row, total: row.total - 1, toPar: row.toPar - 1 })),
      today: results.map((row) => ({ ...row, total: row.total + 1, toPar: row.toPar + 1 })),
    },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ playerId: 'p3', rankLabel: '3', isYou: true, r1: { total: 74, toPar: 2 }, today: { total: 76, toPar: 4 } });
  const rankByPlayerId = new Map(rows.map((row) => [row.playerId, {
    rankLabel: row.rankLabel, tied: row.tied, isYou: row.isYou === true,
    thru: row.thru, teeTime: row.teeTime, r1: row.r1, today: row.today,
  }]));
  const tree = await render(rankByPlayerId, results.filter((row) => row.playerId === 'p3'), players);
  try {
    const row = tree.root.find((node) => node.props.testID === 'leaderboard-player-Cara Cole');
    expect(row.props.style.height).toBe(44);
    expect(row.find((node) => node.props.testID === 'leaderboard-you-chip-p3')).toBeTruthy();
    expect(row.findAll((node) => node.type === 'Text').map((node) => node.children.join(''))).toContain('3');
    expect(cellText(tree, 'leaderboard-r1-p3')).toBe('74');
    expect(cellText(tree, 'leaderboard-today-p3')).toBe('+4');
  } finally {
    await act(async () => tree.unmount());
  }
});

test('round columns use effective Gross mode when the current course cannot support retained Net mode', () => {
  const stroke = load('src/engine/calculators/stroke-play.ts', { '../types': {} });
  const skins = load('src/engine/calculators/skins.ts', { '../types': {} });
  const net = load('src/engine/calculators/net-stroke-play.ts', {
    '../types': {}, './stroke-play': stroke, './skins': skins,
  });
  const { buildLeaderboard } = load('src/engine/calculators/leaderboard-view.ts', {
    '../types': {}, './stroke-play': stroke, './net-stroke-play': net,
  });
  const roundCourse = (count) => ({ name: 'Course', holes: Array.from({ length: count }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })) });
  const roundPlayer = (count) => ({ id: 'p1', name: 'Player One', handicap: 18, scores: Array(count).fill(4) });
  const r1 = buildLeaderboard([roundPlayer(18)], roundCourse(18), 'gross');
  const current = buildLeaderboard([roundPlayer(9)], roundCourse(9), 'net');

  expect(current.mode).toBe('gross');
  expect(current.netAvailable).toBe(false);
  expect(r1.rows[0].total).toBe(72);
  expect(buildLeaderboard([roundPlayer(18)], roundCourse(18), current.mode).rows[0].total).toBe(72);
});
