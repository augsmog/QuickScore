const fs = require('fs');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function screen(contest, push) {
  const deps = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable' },
    'lucide-react-native': { Flag: 'Flag', Plus: 'Plus' },
    'expo-router': { useLocalSearchParams: () => ({ id: contest.id }), useRouter: () => ({ push }) },
    '../../../src/ui/theme': { COLORS: {}, FONTS: {}, RADII: {}, TYPOGRAPHY: {} },
    '../../../src/stores/contest-store': { useContestStore: fn => fn({ contests: [contest] }) },
    '../../../src/engine/types': {
      executionGameConfig: () => ({}),
      ALL_GAMES: [{ id: 'stroke_play', name: 'Stroke Play', rules: 'Lowest total wins.' }],
    },
    '../../../src/engine/contest-results': { contestPrimaryRounds: c => [{ key: 'r1', contest: c }] },
    '../../../src/engine/actual-inputs': { ACTUAL_INPUT_GAMES: [] },
    '../../../src/engine/calculators/stroke-play': {
      calcStrokePlay: () => [
        { playerId: 'a', name: 'Alice', total: 70, toPar: -2 },
        { playerId: 'b', name: 'Bob', total: 70, toPar: -2 },
        { playerId: 'c', name: 'Cam', total: 72, toPar: 0 },
      ],
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(process.env.GAMES_SOURCE || 'app/contest/[id]/games.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(id => {
    if (id in deps) return deps[id];
    if (id.includes('/calculators/')) return {};
    throw new Error(`Unmocked dependency: ${id}`);
  }, module, module.exports);
  return module.exports.default;
}
const text = node => node.children.map(c => typeof c === 'string' ? c : text(c)).join('');
function fixture(status, scores = [4, 0]) {
  return { id: 'round-a', status, games: ['stroke_play'], betUnit: 0,
    groups: [{ players: [{ scores }] }] };
}
async function render(contest, check) {
  const push = jest.fn();
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(screen(contest, push))); });
    await check(tree.root, push);
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
}

test.each([['active', 'In progress · thru 1'], ['completed', 'Final']])('Games %s status, tied ranks and to-par values render', async (status, expected) => {
  await render(fixture(status), root => {
    expect(text(root.findByProps({ testID: 'games-status-stroke_play' }))).toBe(expected);
    const labels = root.findAllByType('Text').map(text);
    expect(labels.filter(s => s === 'T1')).toHaveLength(2);
    expect(labels).toContain('3');
    expect(labels).toContain('70 · −2');
    expect(labels).toContain('72 · E');
    expect(labels).toContain('Lowest total wins.');
  });
});

test('Games add button keeps approved copy, touch size and edit destination', async () => {
  await render(fixture('active'), async (root, push) => {
    const button = root.findByProps({ testID: 'games-add-game' });
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Add a game');
    expect(button.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(root.findAllByType('Text').map(text)).toContain('Choose from 50+ game modes.');
    await act(async () => button.props.onPress());
    expect(push).toHaveBeenCalledWith('/contest/round-a/edit');
  });
});

test('Games without scores keeps the honest empty state and no ranking rows', async () => {
  await render(fixture('active', [0, 0]), root => {
    expect(root.findAllByType('Flag')).toHaveLength(1);
    const labels = root.findAllByType('Text').map(text);
    expect(labels).toContain('Enter scores to see game results');
    expect(labels).not.toContain('T1');
    expect(root.findAllByProps({ testID: 'games-status-stroke_play' })).toHaveLength(0);
  });
});

// GAP-06: the early empty-state return must preserve the same reachable editor action.
test.each([['configured game', ['stroke_play']], ['no configured games', []]])(
  'Games before any scores has an actionable Add a game CTA (%s)', async (_, games) => {
    await render({ ...fixture('active', [0, 0]), games }, async (root, push) => {
      const button = root.findByProps({ testID: 'games-add-game' });
      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.accessibilityLabel).toBe('Add a game');
      expect(button.props.disabled).not.toBe(true);
      expect(button.props.style.minHeight).toBeGreaterThanOrEqual(44);
      expect(text(button)).toBe('Add a game');
      expect(root.findAllByType('Text').map(text)).toContain('Choose from 50+ game modes.');
      await act(async () => button.props.onPress());
      expect(push).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith('/contest/round-a/edit');
    });
  }
);
