const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, imports = {}) {
  const module = { exports: {} };
  // target must be ES2015+: the real Metro/Babel bundle handles for-of over Map/Set natively,
  // but transpileModule's default (pre-ES2015) target silently downlevels it to broken
  // array-style `.length` indexing, which partial-import.ts's Map/Set iteration relies on.
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id.endsWith('/ui/SafeScreen')) {
        return { SafeScreen: 'SafeScreen', SheetSurface: 'View', FullScreenSheet: 'Modal' };
      }
      if (!(id in imports)) throw new Error(id);
      return imports[id];
    },
    module,
    module.exports,
  );
  return module.exports;
}

// AUG-1171: AUG-348 slice 1 -- mounts the real partial-card review/confirm screen (no mocked
// business logic) against the real partial-import service chain, loaded the same way the
// existing scan-quick-settle-completed.test.cjs loads app/scan/review.tsx.
const theme = load('src/ui/theme.ts');
const ocrReview = load('src/services/ocr-review.ts');
const partialImport = load('src/services/partial-import.ts', { './ocr-review': ocrReview });
const partialImportSession = load('src/services/partial-import-session.ts', { './partial-import': partialImport });
const partialImportConfirm = load('src/services/partial-import-confirm.ts');

const COURSE = {
  name: 'Test Links',
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 400 })),
};

function player(id, name) {
  return { id, name, handicap: 10, scores: Array(18).fill(0) };
}

// Regression-plan case 1: 4 players, 2 played holes (1, 2), hole 2 is uncertain for one
// player, holes 3-18 unplayed (null) for everyone.
function scanRow(name, matchedPlayerId, hole2Confidence = 0.95) {
  const scores = Array(18).fill(null);
  const confidence = Array(18).fill(0);
  scores[0] = 4; confidence[0] = 0.95;
  scores[1] = 5; confidence[1] = hole2Confidence;
  return { name, source: 'ocr', requiredHoles: Array.from({ length: 18 }, (_, i) => i + 1), scores, confidence, nameConfidence: 0.95, matchedPlayerId };
}

function mountScreen({ contestId = 'c1', groupId, scanData, contest, back = () => {}, applyReviewedPartialImport, isAnonymous = true }) {
  const element = (tag) => (props) => React.createElement(tag, props, props.children);
  const screen = load('app/scan/partial-review.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      View: element('View'), Text: element('Text'), ScrollView: element('ScrollView'),
      Pressable: element('Pressable'), TextInput: element('TextInput'),
    },
    'expo-router': { useRouter: () => ({ back }), useLocalSearchParams: () => ({ contestId, groupId, scanData }) },
    'lucide-react-native': Object.fromEntries(['X', 'Check', 'AlertTriangle'].map((n) => [n, () => null])),
    '../../src/ui/theme': theme,
    '../../src/stores/contest-store': {
      useContestStore: (select) => select({ contests: [contest], applyReviewedPartialImport }),
    },
    '../../src/stores/auth-store': { useAuthStore: () => ({ session: null, isAnonymous }) },
    '../../src/services/ocr-review': ocrReview,
    '../../src/services/partial-import': partialImport,
    '../../src/services/partial-import-session': partialImportSession,
    '../../src/services/partial-import-confirm': partialImportConfirm,
  }).default;

  let tree;
  act(() => {
    tree = create(React.createElement(screen));
  });
  return tree;
}

function press(tree, testID) {
  const node = tree.root.find((n) => n.props.testID === testID && typeof n.props.onPress === 'function');
  act(() => { node.props.onPress(); });
}

function group4() {
  return {
    id: 'g1', name: 'Group 1',
    players: [player('p1', 'Alice'), player('p2', 'Bob'), player('p3', 'Cara'), player('p4', 'Dana')],
  };
}

test('blocks confirm until the uncertain hole-2 cell is resolved, then saves exactly 8 reviewed cells once', () => {
  const group = group4();
  const contest = { id: 'c1', name: 'Test', course: COURSE, status: 'active', groups: [group], isTournament: false };
  const scanData = JSON.stringify([
    scanRow('Alice', null),
    scanRow('Bob', null),
    scanRow('Cara', null),
    scanRow('Dana', null, 0.4), // the uncertain cell
  ]);
  const calls = [];
  const tree = mountScreen({
    groupId: 'g1', scanData, contest,
    applyReviewedPartialImport: (...args) => calls.push(args),
  });
  try {
    const confirmBtn = () => tree.root.find((n) => n.props.testID === 'partial-confirm');
    expect(confirmBtn().props.disabled).toBe(true);
    expect(tree.root.findAll((n) => n.props.testID === 'partial-blocker-0').length).toBeGreaterThan(0);

    // Resolve Dana's uncertain hole-2 reading by explicitly confirming the OCR value as-is.
    press(tree, 'partial-cell-confirm-3:2');

    expect(confirmBtn().props.disabled).toBe(false);
    press(tree, 'partial-confirm');

    expect(calls).toHaveLength(1);
    const [cId, roundId, groupId, patch] = calls[0];
    expect(cId).toBe('c1');
    expect(roundId).toBeNull();
    expect(groupId).toBe('g1');
    expect(patch).toHaveLength(8);
    expect(patch.every((cell) => cell.strokes > 0)).toBe(true);
    expect(new Set(patch.map((c) => c.hole))).toEqual(new Set([1, 2]));
    expect(new Set(patch.map((c) => c.playerId))).toEqual(new Set(['p1', 'p2', 'p3', 'p4']));
  } finally {
    act(() => tree.unmount());
  }
});

test('Cancel never writes to the store', () => {
  const group = group4();
  const contest = { id: 'c1', name: 'Test', course: COURSE, status: 'active', groups: [group], isTournament: false };
  const scanData = JSON.stringify([
    scanRow('Alice', null), scanRow('Bob', null), scanRow('Cara', null), scanRow('Dana', null, 0.4),
  ]);
  const calls = [];
  let backCalled = false;
  const tree = mountScreen({
    groupId: 'g1', scanData, contest, back: () => { backCalled = true; },
    applyReviewedPartialImport: (...args) => calls.push(args),
  });
  try {
    press(tree, 'partial-cell-confirm-3:2');
    press(tree, 'partial-cancel');
    expect(backCalled).toBe(true);
    expect(calls).toHaveLength(0);
  } finally {
    act(() => tree.unmount());
  }
});

test('ambiguous same-name rows require explicit mapping before confirm is possible', () => {
  // Two roster players share the name "Alice" (twins); the two scanned "Alice" rows cannot
  // silently auto-attach to either one and must be explicitly resolved.
  const group = {
    id: 'g1', name: 'Group 1',
    players: [player('p1', 'Alice'), player('p2', 'Alice'), player('p3', 'Cara'), player('p4', 'Dana')],
  };
  const contest = { id: 'c1', name: 'Test', course: COURSE, status: 'active', groups: [group], isTournament: false };
  const scanData = JSON.stringify([
    scanRow('Alice', null), scanRow('Alice', null), scanRow('Cara', null), scanRow('Dana', null),
  ]);
  const calls = [];
  const tree = mountScreen({
    groupId: 'g1', scanData, contest,
    applyReviewedPartialImport: (...args) => calls.push(args),
  });
  try {
    const confirmBtn = () => tree.root.find((n) => n.props.testID === 'partial-confirm');
    // Both "Alice" rows are ambiguous against the two same-named roster players and cannot
    // silently auto-attach, so full-group coverage is blocked until mapped explicitly.
    expect(confirmBtn().props.disabled).toBe(true);

    // Explicit resolution: map each "Sam" row to a distinct remaining roster player.
    press(tree, 'partial-map-0-p1');
    press(tree, 'partial-map-1-p1'); // assigning the same target clears row 0's assignment.
    press(tree, 'partial-map-0-p2');

    expect(confirmBtn().props.disabled).toBe(false);
    press(tree, 'partial-confirm');
    expect(calls).toHaveLength(1);
    const patch = calls[0][3];
    expect(new Set(patch.map((c) => c.playerId))).toEqual(new Set(['p1', 'p2', 'p3', 'p4']));
  } finally {
    act(() => tree.unmount());
  }
});
