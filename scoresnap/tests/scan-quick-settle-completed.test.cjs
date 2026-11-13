const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
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

// AUG-737 (AUG-277 Gap 1): a scanned Quick Settle round is finished, so the created
// contest must be status "completed" (not "active"). For a non-anonymous owner that
// completed status is what the server first_round_finish trigger records once it
// syncs — previously the contest stayed "active" forever and scan-only users never
// activated. This test exercises the real review screen's Quick Settle commit and
// asserts (a) the contest handed to addContest is completed and (b) the existing
// quick_settlement_created analytics event still fires.
const review = load('src/services/ocr-review.ts');

function mountQuickSettle({ addContest, capture, enqueue = () => {} }) {
  const element = (tag) => (props) => React.createElement(tag, props, props.children);
  const scanData = JSON.stringify([
    { name: 'Player A', scores: Array(18).fill(4), confidence: Array(18).fill(0.95), nameConfidence: 1 },
  ]);
  const screen = load('app/scan/review.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      View: element('View'), Text: element('Text'), ScrollView: element('ScrollView'),
      Pressable: element('Pressable'), TextInput: element('TextInput'), Modal: () => null,
      Image: () => null, AccessibilityInfo: { announceForAccessibility: () => {} },
    },
    'expo-router': { useRouter: () => ({ replace: () => {} }), useLocalSearchParams: () => ({ scanData }) },
    'react-native-safe-area-context': { SafeAreaView: element('SafeAreaView') },
    'lucide-react-native': Object.fromEntries(
      ['Check', 'AlertTriangle', 'Camera', 'Edit3', 'UserCheck', 'HelpCircle', 'Delete'].map((n) => [n, () => null]),
    ),
    'expo-haptics': { notificationAsync: () => {}, NotificationFeedbackType: { Success: 'Success' } },
    '../../src/ui/theme': load('src/ui/theme.ts'),
    '../../src/services/entitlements': load('src/services/entitlements.ts'),
    '../../src/stores/scan-store': { useScanStore: { getState: () => ({ tier: 'free' }) } },
    '../../src/services/ocr-review': review,
    '../../src/ui/animations/ConfettiOverlay': { ConfettiOverlay: () => null },
    '../../src/config/posthog': { posthog: { capture } },
    '../../src/services/posthog-log': { posthogAppLogger: { scorecardScoresCommitted() {} } },
    '../../src/services/quick-settle-completion-sync': { enqueueQuickSettleCompletion: enqueue },
    '../../src/stores/auth-store': { useAuthStore: { getState: () => ({ session: { user: { id: '11111111-1111-4111-8111-111111111111' } }, isAnonymous: false }) } },
    'expo-crypto': { randomUUID: () => '22222222-2222-4222-8222-222222222222' },
    '../../src/stores/contest-store': {
      useContestStore: (select) => select({ contests: [], addContest, importScores: () => {} }),
      generateId: (() => { let n = 0; return () => `test-id-${n++}`; })(),
      defaultCourse: (name) => ({ name, holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1 })) }),
    },
  }).default;

  let tree;
  act(() => {
    tree = create(React.createElement(screen));
  });
  return tree;
}

test('Quick Settle creates a completed contest, queues its completion, and still fires analytics', () => {
  const created = [];
  const events = [];
  const queued = [];
  const tree = mountQuickSettle({
    addContest: (c) => created.push(c),
    capture: (name, props) => events.push({ name, props }),
    enqueue: (id, ownerId) => { queued.push([id, ownerId]); return Promise.resolve(true); },
  });
  try {
    // The bottom commit CTA (quick-settle flow, no existing contest).
    const commit = tree.root.find(
      (node) => node.props.testID === 'scan-commit' && typeof node.props.onPress === 'function',
    );
    act(() => {
      commit.props.onPress();
    });

    expect(created).toHaveLength(1);
    expect(created[0].status).toBe('completed');
    expect(queued).toEqual([[created[0].id, '11111111-1111-4111-8111-111111111111']]);
    expect(created[0].id).toBe('22222222-2222-4222-8222-222222222222');
    // The scanned scores survive into the created round (fully scored => completable).
    expect(created[0].groups[0].players[0].scores).toEqual(Array(18).fill(4));

    const quickSettle = events.find((e) => e.name === 'quick_settlement_created');
    expect(quickSettle).toBeTruthy();
    expect(quickSettle.props.player_count).toBe(1);
  } finally {
    act(() => tree.unmount());
  }
});
