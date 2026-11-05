// The recent-hole strip par logic now lives in LeaderboardResultsList (AUG-614 moved the
// individual rows out of the screen into the virtualized list component). This test loads
// that component, pulls the renderItem FlashList was handed, renders one player's row and
// asserts the hole glyph reads par from the contest course (AUG-620).
const fs = require('fs');
const ts = require('typescript');
const jsx = (type, props) => ({ type, props });
const nodes = n => !n || typeof n !== 'object' ? []
  : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
const holeStripModule = { exports: {} };
new Function('module', 'exports', ts.transpileModule(
  fs.readFileSync('src/ui/leaderboard-hole-strip.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText)(holeStripModule, holeStripModule.exports);

// AUG-620 brief item 8: the last-3-holes chips take par from contest.course.holes[i].par,
// not the active tournament round's course. The contest course par varies below while the
// active round course is pinned to par 4; the chip glyph must follow the contest course, so
// a round-course source would wrongly classify every case as par (transparent circle / r10).
test.each([[5, 'primary', 10], [4, 'transparent', 10], [3, 'transparent', 0], [2, 'error', 0]])(
  'recent-hole symbol uses contest-course par %i regardless of active round', (par, background, radius) => {
    const course = p => ({ name: `Par ${p}`, holes: [{ num: 1, par: p, hcp: 1 }] });
    const players = [{ id: 'p1', name: 'Player', handicap: 0, scores: [4] }];
    const contest = {
      id: 'c', name: 'Tournament', isTournament: true, currentRound: 2, hasTeams: false,
      course: course(par), games: ['stroke_play'], groups: [{ id: 'g', players }],
      rounds: [{ number: 2, course: course(4), groups: [{ id: 'g', players }] }],
    };
    const results = [{ playerId: 'p1', name: 'Player', total: 4, toPar: 4 - par }];
    const deps = {
      react: {},
      'react/jsx-runtime': { jsx, jsxs: jsx },
      '@shopify/flash-list': { FlashList: 'FlashList' },
      'react-native': { View: 'View', Text: 'Text' },
      '../ui/leaderboard-hole-strip': holeStripModule.exports,
      '../ui/theme': {
        COLORS: new Proxy({}, { get: (_, key) => String(key) }),
        FONTS: {}, RADII: {},
      },
      '../utils/formatters': { formatToPar: n => String(n) },
    };
    const m = { exports: {} };
    new Function('require', 'module', 'exports', ts.transpileModule(
      fs.readFileSync('src/components/LeaderboardResultsList.tsx', 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } },
    ).outputText)(id => {
      if (!(id in deps)) throw Error(id);
      return deps[id];
    }, m, m.exports);

    const element = m.exports.LeaderboardResultsList({
      results, allPlayers: players, recentPlayers: players, contest,
      ListHeaderComponent: null, ListFooterComponent: null,
    });
    const flashList = nodes(element).find(n => typeof n.props?.renderItem === 'function');
    const row = flashList.props.renderItem({ item: results[0], index: 0 });
    const glyph = nodes(row).find(n =>
      n.props?.accessibilityLabel === 'Hole 1: 4 strokes');
    expect(glyph.props.style.backgroundColor).toBe(background);
    expect(glyph.props.style.borderRadius).toBe(radius);
  },
);
