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
function buildScreen({ multiRound = false, r2Holes = 18, r2TeeTime, myGroup = false, membership } = {}) {
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
  if (myGroup) {
    players[2].handicap = 18;
    players[4].handicap = 108;
  }
  const groups = myGroup ? [
    { id: 'group-1', name: 'Host group', players: [players[0], players[1], players[3]] },
    { id: 'group-2', name: 'Viewer group', players: [players[2], players[4]] },
  ] : [{ id: 'group-1', name: 'Field', players }];
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
  if (multiRound) {
    // Round 1 is always complete (18 holes). Round 2 progress is `r2Holes`
    // holes scored, the rest left 0 (not played) so THRU reflects the current
    // round only (AUG-253v): r2Holes=3 → THRU 3, 18 → F, 0 → tee time / "—".
    const r1Players = players.map((p) => ({ ...p, scores: Array(18).fill(p.id === 'p3' ? 4 : p.scores[0] + 1) }));
    const todayPlayers = players.map((p) => ({
      ...p,
      scores: Array.from({ length: 18 }, (_, i) => (i < r2Holes ? (p.id === 'p3' ? 3 : p.scores[0]) : 0)),
    }));
    contest.currentRound = 2;
    const round2Group = { id: 'round-2', players: todayPlayers };
    if (r2TeeTime) round2Group.teeTime = r2TeeTime;
    contest.rounds = [
      { number: 1, course: contest.course, groups: [{ id: 'round-1', players: r1Players }] },
      { number: 2, course: contest.course, groups: [round2Group] },
    ];
  }
  const { useOnlineStore } = load('src/stores/online-store.ts', { zustand: require('zustand') });
  if (membership) useOnlineStore.getState().repair(contest.id, membership, { revision: 1 });
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
    '../../../src/stores/online-store': { useOnlineStore },
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
  const Screen = load('app/contest/[id]/leaderboard.tsx', deps).default;
  Screen.onlineStore = useOnlineStore;
  Screen.contest = contest;
  return Screen;
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

async function mount(options) {
  const Screen = buildScreen(options);
  let tree;
  await act(async () => {
    tree = create(React.createElement(Screen));
  });
  tree.onlineStore = Screen.onlineStore;
  tree.Screen = Screen;
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

test('multi-round screen wires R1/Today through search and pinned You without rank drift', async () => {
  globalThis.__SNAPSCORE_FIXTURE_YOU__ = 'p3';
  const tree = await mount({ multiRound: true });
  try {
    search(tree, 'cara');
    expect(rowTestIds(tree)).toEqual(['leaderboard-player-Cara Cole']);
    const row = tree.root.find((node) => node.props.testID === 'leaderboard-player-Cara Cole');
    const text = row.findAll((node) => node.type === 'Text').map((node) => node.children.join(''));
    expect(text[0]).toBe('3'); // field rank survives search + pin
    expect(text).toContain('72'); // R1 gross total from round 1
    expect(text).toContain('−18'); // Today to-par from current round
    expect(row.find((node) => node.props.testID === 'leaderboard-you-chip-p3')).toBeTruthy();
    expect(row.props.style.height).toBe(44);
  } finally {
    delete globalThis.__SNAPSCORE_FIXTURE_YOU__;
    await act(async () => tree.unmount());
  }
});

// AUG-253v regression: THRU in the multi-round view must derive from the
// CURRENT round's card only, never the cumulative whole-event card. Before the
// fix, R1-complete + partial R2 wrongly showed "F" because the cumulative row
// had 18 scored holes. The fixture's cumulative players are always 18-hole
// complete (getTournamentPlayers mock), so the only way THRU can read 3 / a tee
// time is current-round derivation.
function thruText(tree, playerId) {
  const node = tree.root.find((n) => (n.props.testID || '') === `leaderboard-thru-${playerId}`);
  return node.children.join('');
}

test('multi-round THRU shows current-round hole count (R1 complete + 3 holes of R2 → 3, not F)', async () => {
  const tree = await mount({ multiRound: true, r2Holes: 3 });
  try {
    expect(thruText(tree, 'p3')).toBe('3');
    // A non-"You" row (cumulative card is complete) must still read current-round 3.
    expect(thruText(tree, 'p1')).toBe('3');
  } finally {
    await act(async () => tree.unmount());
  }
});

test('multi-round THRU shows F only when the current round is complete', async () => {
  const tree = await mount({ multiRound: true, r2Holes: 18 });
  try {
    expect(thruText(tree, 'p3')).toBe('F');
  } finally {
    await act(async () => tree.unmount());
  }
});

test('multi-round THRU shows the tee time when the current round has not started (AUG-760)', async () => {
  const tree = await mount({ multiRound: true, r2Holes: 0, r2TeeTime: '8:40 AM' });
  try {
    expect(thruText(tree, 'p3')).toBe('8:40 AM');
  } finally {
    await act(async () => tree.unmount());
  }
});

test('multi-round THRU shows an em dash when the current round has not started and no tee time is known', async () => {
  const tree = await mount({ multiRound: true, r2Holes: 0 });
  try {
    expect(thruText(tree, 'p3')).toBe('—');
  } finally {
    await act(async () => tree.unmount());
  }
});

// AUG-975: the real screen + row engine + online store exercise approved membership.
const approved = { status: 'approved', player_id: 'p3', role: 'player' };
function groupControl(tree) {
  return tree.root.find((n) => n.props.testID === 'leaderboard-my-group');
}
async function pressGroup(tree) {
  await act(async () => groupControl(tree).props.onPress());
}
function rank(tree, playerId) {
  return tree.root.find((n) => n.props.testID === `leaderboard-rank-${playerId}`).children.join('');
}

test('My group on/off filters approved viewer in the second group and preserves field ranks', async () => {
  const tree = await mount({ myGroup: true, membership: approved });
  try {
    expect(groupControl(tree).props.accessibilityState).toEqual({ checked: false, disabled: false });
    expect(rowTestIds(tree)).toHaveLength(5);
    await pressGroup(tree);
    expect(groupControl(tree).props.accessibilityState.checked).toBe(true);
    expect(groupControl(tree).props['aria-checked']).toBe(true);
    expect(rowTestIds(tree)).toEqual(['leaderboard-player-Cara Cole', 'leaderboard-player-Eve Evans']);
    expect(rank(tree, 'p3')).toBe('3');
    expect(rank(tree, 'p5')).toBe('5');
    await pressGroup(tree);
    expect(groupControl(tree).props.accessibilityState.checked).toBe(false);
    expect(groupControl(tree).props['aria-checked']).toBe(false);
    expect(rowTestIds(tree)).toHaveLength(5);
  } finally { await act(async () => tree.unmount()); }
});

test('My group composes with real Net ranks and case-insensitive search', async () => {
  const tree = await mount({ myGroup: true, membership: approved });
  try {
    await pressGroup(tree);
    await act(async () => tree.root.find((n) => n.props.testID === 'leaderboard-rank-net').props.onPress());
    expect(rowTestIds(tree)).toEqual(['leaderboard-player-Eve Evans', 'leaderboard-player-Cara Cole']);
    expect(rank(tree, 'p5')).toBe('1');
    expect(rank(tree, 'p3')).toBe('4');
    search(tree, 'COLE');
    expect(rowTestIds(tree)).toEqual(['leaderboard-player-Cara Cole']);
    expect(rank(tree, 'p3')).toBe('4');
    search(tree, 'amy');
    expect(rowTestIds(tree)).toEqual([]);
    await pressGroup(tree);
    expect(rowTestIds(tree)).toEqual(['leaderboard-player-Amy Adams']);
    expect(rank(tree, 'p1')).toBe('T2');
  } finally { await act(async () => tree.unmount()); }
});

test.each([
  undefined,
  { ...approved, status: 'pending' },
  { ...approved, status: 'revoked' },
  { ...approved, player_id: null, role: 'host' },
  { ...approved, player_id: 'not-in-contest' },
])('My group disabled without approved grouped player: %j', async (membership) => {
  const tree = await mount({ myGroup: true, membership });
  try {
    expect(groupControl(tree).props.disabled).toBe(true);
    expect(groupControl(tree).props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(groupControl(tree).props['aria-checked']).toBe(false);
    expect(tree.root.find((n) => n.props.testID === 'leaderboard-my-group-empty').children.join('')).toBe('No group assigned');
    await pressGroup(tree);
    expect(rowTestIds(tree)).toHaveLength(5);
  } finally { await act(async () => tree.unmount()); }
});

test('membership revocation while on immediately restores field and disables My group', async () => {
  const tree = await mount({ myGroup: true, membership: approved });
  try {
    await pressGroup(tree);
    expect(rowTestIds(tree)).toHaveLength(2);
    await act(async () => tree.onlineStore.getState().reset());
    expect(groupControl(tree).props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(groupControl(tree).props['aria-checked']).toBe(false);
    expect(rowTestIds(tree)).toHaveLength(5);
  } finally { await act(async () => tree.unmount()); }
});


test('removal from contest groups while on cannot leave an invented group filter', async () => {
  const tree = await mount({ myGroup: true, membership: approved });
  try {
    await pressGroup(tree);
    tree.Screen.contest.groups = tree.Screen.contest.groups.map(group => ({
      ...group, players: group.players.filter(player => player.id !== 'p3'),
    }));
    await act(async () => tree.update(React.createElement(tree.Screen)));
    expect(groupControl(tree).props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(groupControl(tree).props['aria-checked']).toBe(false);
    expect(rowTestIds(tree)).toHaveLength(5);
  } finally { await act(async () => tree.unmount()); }
});

test('approved membership belonging to another contest cannot enable My group', async () => {
  const tree = await mount({ myGroup: true });
  try {
    await act(async () => tree.onlineStore.getState().repair('another-contest', approved, { revision: 1 }));
    expect(groupControl(tree).props.disabled).toBe(true);
    await pressGroup(tree);
    expect(rowTestIds(tree)).toHaveLength(5);
  } finally { await act(async () => tree.unmount()); }
});
