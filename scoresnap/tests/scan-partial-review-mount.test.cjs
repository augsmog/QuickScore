const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
jest.mock('react-native', () => ({
  StyleSheet: { flatten: style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) },
  Platform: { OS: 'ios' },
}));
const { render, act, fireEvent } = require('@testing-library/react-native/pure');

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

function mountScreen({ contestId = 'c1', groupId, scanData, contest, back = () => {}, applyReviewedPartialImport, isAnonymous = true, live = {} }) {
  const element = (tag) => (props) => React.createElement(tag, props, props.children);
  const canonical = () => ({ contests: [live.contest ?? contest], applyReviewedPartialImport });
  const authState = () => live.auth ?? { session: null, isAnonymous };
  const authStore = Object.assign(() => authState(), { getState: authState, subscribe: listener => { live.authListener = listener; return () => {}; } });
  const screen = load('app/scan/partial-review.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      View: element('View'), Text: element('Text'), ScrollView: element('ScrollView'),
      Pressable: element('Pressable'), TextInput: element('TextInput'),
    },
    'expo-router': { useRouter: () => ({ back }), useLocalSearchParams: () => ({ contestId, groupId, scanData, sourceContext: JSON.stringify([isAnonymous?'anonymous':'signed-out',contestId,contest.isTournament?contest.rounds.find(r=>r.number===contest.currentRound)?.id??null:null]) }) },
    'lucide-react-native': Object.fromEntries(['X', 'Check', 'AlertTriangle'].map((n) => [n, () => null])),
    '../../src/ui/theme': theme,
    '../../src/stores/contest-store': {
      useContestStore: Object.assign((select) => select(canonical()), { getState: canonical }),
    },
    '../../src/stores/auth-store': { useAuthStore: authStore },
    '../../src/services/ocr-review': ocrReview,
    '../../src/services/partial-import': partialImport,
    '../../src/services/partial-import-session': partialImportSession,
    '../../src/services/partial-import-confirm': partialImportConfirm,
  }).default;

  const rendered = render(React.createElement(screen));
  return { get root() { return rendered.UNSAFE_root; }, unmount: rendered.unmount, Screen: screen, rendered };
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

for (const replacement of ['0', '-1', 'NaN', '2.5', '']) {
  test(`invalid edited score ${JSON.stringify(replacement)} cannot fall back to confirmed OCR`, () => {
    const group = group4();
    const contest = { id: 'c1', course: COURSE, status: 'active', groups: [group], isTournament: false };
    const calls = [];
    const tree = mountScreen({ contest, scanData: JSON.stringify([
      scanRow('Alice', null), scanRow('Bob', null), scanRow('Cara', null), scanRow('Dana', null, 0.4),
    ]), applyReviewedPartialImport: (...args) => calls.push(args) });
    try {
      press(tree, 'partial-cell-confirm-3:2');
      act(() => tree.root.find(n => n.type === 'TextInput' && n.props.testID === 'partial-cell-input-3:2').props.onChangeText(replacement));
      expect(tree.root.find(n => n.props.testID === 'partial-confirm').props.disabled).toBe(true);
      press(tree, 'partial-confirm');
      expect(calls).toHaveLength(0);
    } finally { act(() => tree.unmount()); }
  });
}

test('a rejected write retains edits and cannot immediately repeat the same write', () => {
  const group = group4();
  const contest = { id: 'c1', course: COURSE, status: 'active', groups: [group], isTournament: false };
  const calls = [];
  const tree = mountScreen({ contest, scanData: JSON.stringify([
    scanRow('Alice', null), scanRow('Bob', null), scanRow('Cara', null), scanRow('Dana', null, 0.4),
  ]), applyReviewedPartialImport: (...args) => { calls.push(args); throw new Error('denied'); } });
  try {
    act(() => tree.root.find(n => n.type === 'TextInput' && n.props.testID === 'partial-cell-input-3:2').props.onChangeText('6'));
    press(tree, 'partial-confirm');
    press(tree, 'partial-confirm');
    expect(calls).toHaveLength(1);
    expect(tree.root.find(n => n.type === 'TextInput' && n.props.testID === 'partial-cell-input-3:2').props.value).toBe('6');
  } finally { act(() => tree.unmount()); }
});

for (const change of ['account', 'round', 'completed', 'conflict']) {
  test(`a stale event cannot write after ${change} changes`, () => {
    const group = group4();
    const contest = { id: 'c1', course: COURSE, status: 'active', groups: [group], isTournament: false };
    const calls = [], live = {};
    const tree = mountScreen({ contest, live, scanData: JSON.stringify([
      scanRow('Alice', null), scanRow('Bob', null), scanRow('Cara', null), scanRow('Dana', null),
    ]), applyReviewedPartialImport: (...args) => calls.push(args) });
    try {
      if (change === 'account') live.auth = { session: { user: { id: 'other' } }, isAnonymous: false };
      if (change === 'round') live.contest = { ...contest, isTournament: true, currentRound: 2, rounds: [{ id:'r2', number:2, groups:[group], course:COURSE }] };
      if (change === 'completed') live.contest = { ...contest, status:'completed' };
      if (change === 'conflict') live.contest = { ...contest, groups:[{...group, players:group.players.map((p,i)=>i===0?{...p,scores:[7,...p.scores.slice(1)]}:p)}] };
      press(tree, 'partial-confirm');
      expect(calls).toHaveLength(0);
    } finally { act(() => tree.unmount()); }
  });
}

test('Cancel/remount retains corrections; switching accounts while unmounted clears them', () => {
  const group = group4(), live = {};
  const contest = { id:'c1', course:COURSE, status:'active', groups:[group], isTournament:false };
  const calls = [];
  const tree = mountScreen({ contest, live, scanData:JSON.stringify([
    scanRow('Alice',null),scanRow('Bob',null),scanRow('Cara',null),scanRow('Dana',null,0.4),
  ]), applyReviewedPartialImport:(...args)=>calls.push(args) });
  fireEvent.changeText(tree.rendered.getByTestId('partial-cell-input-3:2'), '6');
  fireEvent.press(tree.rendered.getByTestId('partial-cancel'));
  tree.unmount();
  const again = render(React.createElement(tree.Screen));
  expect(again.getByTestId('partial-cell-input-3:2').props.value).toBe('6');
  expect(calls).toHaveLength(0);
  again.unmount();
  act(() => live.authListener({session:{user:{id:'other'}},isAnonymous:false},{session:null,isAnonymous:true}));
  const cleared = render(React.createElement(tree.Screen));
  expect(cleared.getByTestId('partial-cell-input-3:2').props.value).toBe('');
  expect(cleared.getByTestId('partial-confirm').props.disabled).toBe(true);
  cleared.unmount();
});

test('six players and back-nine numbered holes save their actual identities, leaving future holes blank', () => {
  const course = {...COURSE,holes:COURSE.holes.slice(9)};
  const players = Array.from({length:6},(_,i)=>player(`p${i}`,`Player ${i}`));
  const group={id:'g1',name:'Group',players};
  const contest={id:'c1',course,status:'active',groups:[group],isTournament:false};
  const calls=[];
  const rows=players.map(p=>({...scanRow(p.name,null),requiredHoles:course.holes.map(h=>h.num),
    scores:[4,5,...Array(7).fill(null)],confidence:[0.95,0.95,...Array(7).fill(0)]}));
  const tree=mountScreen({contest,scanData:JSON.stringify(rows),applyReviewedPartialImport:(...args)=>calls.push(args)});
  try {
    expect(tree.rendered.queryByTestId('partial-hole-1')).toBeNull();
    expect(tree.rendered.getAllByText('Unplayed')).toHaveLength(6);
    fireEvent.press(tree.rendered.getByTestId('partial-confirm'));
    expect(calls).toHaveLength(1);
    expect(calls[0][3]).toEqual(players.flatMap(p=>[{playerId:p.id,hole:10,strokes:4},{playerId:p.id,hole:11,strokes:5}]));
  } finally {tree.unmount();}
});

test('uncertain player identity requires an explicit roster choice', () => {
  const group=group4(),contest={id:'c1',course:COURSE,status:'active',groups:[group],isTournament:false};
  const rows=[scanRow('Alice',null),scanRow('Bob',null),scanRow('Cara',null),scanRow('Dana',null)];
  rows[0].nameConfidence=0.1;
  const calls=[];
  const tree=mountScreen({contest,scanData:JSON.stringify(rows),applyReviewedPartialImport:(...args)=>calls.push(args)});
  try {
    expect(tree.rendered.getByTestId('partial-confirm').props.disabled).toBe(true);
    fireEvent.press(tree.rendered.getByTestId('partial-map-0-p1'));
    fireEvent.press(tree.rendered.getByTestId('partial-confirm'));
    expect(calls).toHaveLength(1);
  } finally {tree.unmount();}
});

for (const partial of [false, true]) {
  test(`text intake preserves ${partial ? 'partial' : 'full-card'} routing and hole handling`, () => {
    const element = tag => props => React.createElement(tag,props,props.children);
    const parser = load('src/services/score-parser.ts');
    const calls=[];
    const contest={id:'c1',course:COURSE,status:'active',groups:[group4()]};
    const noop=()=>{};
    const Screen=load('app/scan/index.tsx', {
      react:React,'react/jsx-runtime':require('react/jsx-runtime'),
      'react-native':Object.fromEntries(['View','Text','Pressable','Image','TextInput','ScrollView'].map(tag=>[tag,element(tag)]).concat([
        ['Dimensions',{get:()=>({width:390,height:844})}],['Platform',{OS:'web'}],
      ])),
      'expo-router':{useRouter:()=>({push:value=>calls.push(value)}),useLocalSearchParams:()=>({contestId:'c1',mode:partial?'partial':undefined})},
      'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},
      'expo-camera':{CameraView:element('CameraView'),useCameraPermissions:()=>[{granted:true},noop]},
      'lucide-react-native':Object.fromEntries(['X','Camera','Lock','RotateCcw','Check','SwitchCamera','ImageIcon','Zap','ZapOff'].map(n=>[n,()=>null])),
      'expo-haptics':{},'../../src/ui/theme':theme,
      '../../src/stores/contest-store':{useContestStore:select=>select({contests:[contest]})},
      '../../src/stores/auth-store':{useAuthStore:{getState:()=>({isAnonymous:true,session:null})}},
      '../../src/stores/scan-store':{useScanStore:()=>({canScan:()=>true,getRemainingFreeScans:()=>3,isPro:false})},
      '../../src/services/ocr-consent':{requestOCRConsent:()=>Promise.resolve(true)},
      '../../src/services/ocr-review':ocrReview,'../../src/services/ocr-service':{},
      '../../src/services/entitlements':{proEnabled:()=>false},
      '../../src/services/analytics':{webAnalytics:{capture:()=>Promise.resolve()}},
      '../../src/config/offline':{OFFLINE_MODE:true},'../../src/config/native-ocr':{NATIVE_OCR_DISABLED:false},
      '../../src/services/score-parser':parser,'../../src/config/posthog':{posthog:null},'../../src/services/posthog-log':{},
    }).default;
    const screen=render(React.createElement(Screen));
    try {
      fireEvent.changeText(screen.getByTestId('scorecard-text-input'),'Alice,4,5\nBob,4,5\nCara,4,5\nDana,4,5');
      fireEvent.press(screen.getByText('Parse Scorecard'));
      expect(calls).toHaveLength(1);
      expect(calls[0].pathname).toBe(partial?'/scan/partial-review':'/scan/review');
      expect(calls[0].params.sourceContext).toBe(partial?JSON.stringify(['anonymous','c1',null]):undefined);
      const rows=JSON.parse(calls[0].params.scanData);
      if (partial) expect(rows.every(r=>!r.alignmentError)).toBe(true);
      else expect(rows).toEqual(ocrReview.applyCourseHoles(parser.parseScoreGrid(parser.textToGrid('Alice,4,5\nBob,4,5\nCara,4,5\nDana,4,5'),undefined,'paste').players,COURSE.holes.map(h=>h.num)));
    } finally {screen.unmount();}
  });
}
