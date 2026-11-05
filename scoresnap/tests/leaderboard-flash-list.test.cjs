const fs = require('fs');
const React = require('react');
const { create, act } = require('react-test-renderer');
const loader = require('./helpers/load-ts.cjs');

// Use FlashList's deterministic test measurements so the actual screen list is
// virtualized in this test environment rather than mounting all data items.
require('@shopify/flash-list/jestSetup');

global.IS_REACT_ACT_ENVIRONMENT = true;

const course = {
  name: '72-player fixture',
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })),
};
const players = Array.from({ length: 72 }, (_, i) => ({
  id: `p${i}`,
  name: `Player ${i + 1}`,
  scores: Array.from({ length: 18 }, (_, hole) => 4 + ((i + hole) % 3) + (i % 5)),
}));
const groups = [{ id: 'g', name: 'Field', players }];
const contest = { id: 'c', name: 'Tournament', isTournament: false, course, groups, games: [], hasTeams: false };

const calculator = loader()('src/engine/calculators/stroke-play.ts').calcStrokePlay;
const expected = calculator(players, course);
const appLoader = loader({
  'expo-router': { useLocalSearchParams: () => ({ id: 'c' }) },
  'lucide-react-native': { Flag: 'Flag' },
  '../../../src/engine/contest-results': {
    liveRoundCourse: value => value.course,
    teamCardPlayers: () => [],
  },
  '../../../src/stores/contest-store': {
    useContestStore: select => select({ contests: [contest] }),
    getTournamentPlayers: value => value.groups.flatMap(group => group.players),
    getActiveGroups: value => value.groups,
  },
  '../../../src/engine/calculators/stroke-play': { calcStrokePlay: calculator },
  '../../../src/engine/calculators/leaderboard-view': {
    buildLeaderboard: (field, value) => ({
      rows: calculator(field, value),
      netAvailable: false,
      mode: 'gross',
    }),
  },
  '../../../src/ui/theme': {
    COLORS: {
      bg: '#000', text: '#fff', textDim: '#aaa', surfaceLow: '#111', surfaceHigh: '#222',
      surfaceMid: '#333', surfaceHighest: '#444', primary: '#0f0', secondary: '#00f',
      error: '#f00', onPrimary: '#000',
    },
    FONTS: { regular: '', semibold: '', bold: '', score: '' },
    TYPOGRAPHY: {},
    RADII: { md: 8, lg: 12 },
  },
  '../../../src/utils/formatters': { formatToPar: value => String(value) },
  '../../../src/ui/AnimatedPressable': { AnimatedPressable: 'Pressable' },
});
const Screen = appLoader('app/contest/[id]/index.tsx').default;

let root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});

test('72-player screen mounts a virtual window in calcStrokePlay order with stable player IDs', async () => {
  await act(async () => {
    root = create(React.createElement(Screen));
  });

  const mounted = root.root.findAll(node =>
    typeof node.props.testID === 'string' && node.props.testID.startsWith('leaderboard-player-'),
  );
  const names = mounted.map(node => node.props.testID);
  expect(names.length).toBeGreaterThan(0);
  expect(names.length).toBeLessThan(72);
  expect(names).toEqual(expected.slice(0, names.length).map(row => `leaderboard-player-${row.name}`));
  expect(fs.readFileSync('app/contest/[id]/index.tsx', 'utf8')).toContain('keyExtractor={(row) => row.playerId}');
});
