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

test('72-player leaderboard mounts every results row without throwing', async () => {
  const players = Array.from({ length: 72 }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${String(index + 1).padStart(2, '0')}`,
    scores: Array(18).fill(4 + (index % 3)),
  }));
  const groups = [{ id: 'group-1', name: 'Field', players }];
  const contest = {
    id: 'synthetic-72-player-smoke',
    isTournament: true,
    groups,
    rounds: [{ number: 1, groups }],
    currentRound: 1,
    games: [],
    hasTeams: false,
    course: {
      name: 'Synthetic course',
      holes: Array.from({ length: 18 }, (_, index) => ({ num: index + 1, par: 4 })),
    },
  };
  const rn = { View: 'View', Text: 'Text', ScrollView: 'ScrollView' };
  const theme = {
    COLORS: new Proxy({}, { get: (_, key) => String(key) }),
    FONTS: new Proxy({}, { get: (_, key) => String(key) }),
    TYPOGRAPHY: {},
    RADII: new Proxy({}, { get: (_, key) => 8 }),
  };
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
    '../../../src/engine/calculators/stroke-play': load('src/engine/calculators/stroke-play.ts', {
      '../types': {},
    }),
    '../../../src/utils/formatters': { formatToPar: (value) => (value === 0 ? 'E' : String(value)) },
    '../../../src/ui/AnimatedPressable': { AnimatedPressable: 'Pressable' },
  };
  const Screen = load('app/contest/[id]/index.tsx', deps).default;
  let tree;
  try {
    await act(async () => {
      tree = create(React.createElement(Screen));
    });
    const rows = tree.root.findAll((node) => /^leaderboard-player-Player \d{2}$/.test(node.props.testID || ''));
    expect(rows).toHaveLength(72);
    expect(rows.map((node) => node.props.testID)).toContain('leaderboard-player-Player 72');
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});
