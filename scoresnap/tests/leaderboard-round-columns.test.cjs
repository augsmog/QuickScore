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

test('supported Net mode re-ranks R1 and Today columns while current-round THRU stays progress-only', async () => {
  const stroke = load('src/engine/calculators/stroke-play.ts', { '../types': {} });
  const skins = load('src/engine/calculators/skins.ts', { '../types': {} });
  const net = load('src/engine/calculators/net-stroke-play.ts', {
    '../types': {}, './stroke-play': stroke, './skins': skins,
  });
  const { buildLeaderboard } = load('src/engine/calculators/leaderboard-view.ts', {
    '../types': {}, './stroke-play': stroke, './net-stroke-play': net,
  });
  const roundCourse = { name: 'Net Cup', holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })) };
  const alice = { id: 'p1', name: 'Alice', handicap: 0, scores: Array(18).fill(4) };
  const bob = { id: 'p2', name: 'Bob', handicap: 18, scores: [...Array(8).fill(5), ...Array(10).fill(4)] };
  const gross = buildLeaderboard([alice, bob], roundCourse, 'gross');
  const active = buildLeaderboard([alice, bob], roundCourse, 'net');
  expect(gross.rows.map((row) => row.playerId)).toEqual(['p1', 'p2']);
  expect(active.mode).toBe('net');
  expect(active.rows.map((row) => row.playerId)).toEqual(['p2', 'p1']);
  expect(active.rows[0]).toMatchObject({ total: 62, toPar: -10 });

  const round1Players = [alice, bob];
  const todayPlayers = [
    { ...alice, scores: [...Array(9).fill(4), ...Array(9).fill(0)] },
    { ...bob, scores: [...Array(8).fill(5), 4, ...Array(9).fill(0)] },
  ];
  const netRound1 = buildLeaderboard(round1Players, roundCourse, active.mode).rows;
  const grossRound1 = buildLeaderboard(round1Players, roundCourse, 'gross').rows;
  const netToday = buildLeaderboard(todayPlayers, roundCourse, active.mode).rows;
  const grossToday = buildLeaderboard(todayPlayers, roundCourse, 'gross').rows;
  const netRows = buildLeaderboardRows(active.rows, todayPlayers, {
    holeCount: 18,
    roundInfo: { r1: netRound1, today: netToday },
  });
  const grossRows = buildLeaderboardRows(gross.rows, todayPlayers, {
    holeCount: 18,
    roundInfo: { r1: grossRound1, today: grossToday },
  });
  expect(netRows.map((row) => row.playerId)).toEqual(['p2', 'p1']);
  expect(netRows[0]).toMatchObject({ r1: { total: 62 }, today: { total: 35 }, thru: 9 });
  expect(grossRows[0]).toMatchObject({ playerId: 'p1', r1: { total: 72 }, today: { total: 36 }, thru: 9 });
  expect(netRows.map((row) => row.thru)).toEqual(grossRows.map((row) => row.thru));

  const rankByPlayerId = new Map(netRows.map((row) => [row.playerId, {
    rankLabel: row.rankLabel, tied: row.tied, thru: row.thru, r1: row.r1, today: row.today,
  }]));
  const tree = await render(rankByPlayerId, active.rows, [alice, bob]);
  try {
    expect(tree.root.findAll((node) => node.props.testID === 'leaderboard-player-Bob')).toHaveLength(1);
    expect(cellText(tree, 'leaderboard-r1-p2')).toBe('62');
    expect(cellText(tree, 'leaderboard-today-p2')).toBe('−1');
    expect(cellText(tree, 'leaderboard-thru-p2')).toBe('9');
  } finally {
    await act(async () => tree.unmount());
  }
});

test('cumulative and daily tournament rows preserve event, R1, Today, and current-round THRU contracts', () => {
  const stroke = load('src/engine/calculators/stroke-play.ts', { '../types': {} });
  const skins = load('src/engine/calculators/skins.ts', { '../types': {} });
  const net = load('src/engine/calculators/net-stroke-play.ts', {
    '../types': {}, './stroke-play': stroke, './skins': skins,
  });
  const { buildLeaderboard } = load('src/engine/calculators/leaderboard-view.ts', {
    '../types': {}, './stroke-play': stroke, './net-stroke-play': net,
  });
  const course = { name: 'Two Round', holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })) };
  const r1Players = Array.from({ length: 16 }, (_, i) => ({
    id: `p${i + 1}`, name: `Player ${String(i + 1).padStart(2, '0')}`, handicap: 0,
    scores: Array.from({ length: 18 }, (_, hole) => hole < (72 - (68 + i)) ? 3 : 4),
  }));
  const r2Players = r1Players.map((player) => ({ ...player, scores: Array.from({ length: 18 }, (_, i) => i < 3 ? 3 : 0) }));
  const eventPlayers = r1Players.map((player, i) => ({ ...player, scores: player.scores.map((score, hole) => score + (r2Players[i].scores[hole] || 0)) }));
  const cumulative = buildLeaderboard(eventPlayers, course, 'gross').rows;
  const daily = buildLeaderboard(r2Players, course, 'gross').rows;
  const r1 = buildLeaderboard(r1Players, course, 'gross').rows;
  const today = buildLeaderboard(r2Players, course, 'gross').rows;
  const cumulativeRows = buildLeaderboardRows(cumulative, eventPlayers, { holeCount: 18, roundInfo: { r1, today } });
  const dailyRows = buildLeaderboardRows(daily, r2Players, { holeCount: 18, roundInfo: { r1, today } });
  const dailyThru = new Map(dailyRows.map((row) => [row.playerId, row.thru]));
  const cP3 = { ...cumulativeRows.find((row) => row.playerId === 'p3'), thru: dailyThru.get('p3') };
  const dP3 = dailyRows.find((row) => row.playerId === 'p3');
  expect(cP3).toMatchObject({ total: 79, r1: { total: 70 }, today: { total: 9, toPar: -3 }, thru: 3 });
  expect(dP3).toMatchObject({ total: 9, r1: { total: 70 }, today: { total: 9, toPar: -3 }, thru: 3 });
  // Mutant: event-wide THRU must fail the current-round mid-R2 contract.
  expect(buildLeaderboardRows(cumulative, eventPlayers, { holeCount: 18 }).find((row) => row.playerId === 'p3').thru).toBe('F');
  expect(dP3.thru).not.toBe('F');
});
