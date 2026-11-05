const fs = require('fs');
const ts = require('typescript');
const jsx = (type, props) => ({ type, props });
const nodes = n => !n || typeof n !== 'object' ? []
  : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];

test.each([[5, 'primary', 10], [4, 'transparent', 10], [3, 'transparent', 0], [2, 'error', 0]])(
  'recent-hole symbol uses active-round par %i when the course changes', (par, background, radius) => {
    const course = p => ({ name: `Par ${p}`, holes: [{ num: 1, par: p, hcp: 1 }] });
    const players = [{ id: 'p1', name: 'Player', handicap: 0, scores: [4] }];
    const contest = {
      id: 'c', name: 'Tournament', isTournament: true, currentRound: 2,
      course: course(4), games: ['stroke_play'], groups: [{ id: 'g', players }],
      rounds: [{ number: 2, course: course(par), groups: [{ id: 'g', players }] }],
    };
    let state = 0;
    const deps = {
      react: { useState: () => [++state === 1 ? 'individual' : 'daily', () => {}] },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView' },
      'expo-router': { useLocalSearchParams: () => ({ id: 'c' }) },
      'lucide-react-native': { Flag: 'Flag' },
      '../../../src/engine/contest-results': {
        liveRoundCourse: c => c.rounds[0].course, teamCardPlayers: () => [],
      },
      '../../../src/ui/theme': {
        COLORS: { primary: 'primary', error: 'error', onPrimary: 'onPrimary' },
        FONTS: {}, TYPOGRAPHY: {}, RADII: {},
      },
      '../../../src/stores/contest-store': {
        useContestStore: select => select({ contests: [contest] }),
        getActiveGroups: c => c.rounds[0].groups, getTournamentPlayers: () => players,
      },
      '../../../src/engine/calculators/stroke-play': {
        calcStrokePlay: (ps, c) => ps.map(p => ({
          playerId: p.id, name: p.name, total: 4, toPar: 4 - c.holes[0].par,
        })),
      },
      // Gross/Net toggle helper (AUG-246c). This fixture uses a 1-hole course,
      // so net is unavailable and the individual view renders gross rows.
      '../../../src/engine/calculators/leaderboard-view': {
        buildLeaderboard: (ps, c) => ({
          rows: ps.map(p => ({
            playerId: p.id, name: p.name, total: 4, toPar: 4 - c.holes[0].par,
          })),
          netAvailable: false,
          mode: 'gross',
        }),
      },
      '../../../src/utils/formatters': { formatToPar: n => String(n) },
      '../../../src/ui/AnimatedPressable': { AnimatedPressable: 'Pressable' },
    };
    const m = { exports: {} };
    new Function('require', 'module', 'exports', ts.transpileModule(
      fs.readFileSync('app/contest/[id]/index.tsx', 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
    ).outputText)(id => {
      if (!(id in deps)) throw Error(id);
      return deps[id];
    }, m, m.exports);
    const glyph = nodes(m.exports.default()).find(n =>
      n.props?.accessibilityLabel === 'Hole 1: 4 strokes');
    expect(glyph.props.style.backgroundColor).toBe(background);
    expect(glyph.props.style.borderRadius).toBe(radius);
  },
);
