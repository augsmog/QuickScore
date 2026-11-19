const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, deps) { const m = { exports: {} }; const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText; new Function('require', 'module', 'exports', code)(id => { if (id in deps)
    return deps[id]; if (id.startsWith('.'))
    return load(path.resolve(path.dirname(file), id + '.ts'), deps); throw Error('Unmocked ' + id); }, m, m.exports); return m.exports; }
const flatten = n => n == null ? '' : typeof n === 'string' ? n : Array.isArray(n) ? n.map(flatten).join('') : flatten(n.children);
const holes = Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 400 }));
const player = (id, scores) => ({ id, name: id, handicap: 0, scores });
function fixture(courseHoles = holes, start = 10) { return { id: 'c', name: 'Test', status: 'active', games: [], course: { name: 'Links', holes: courseHoles }, groups: [{ id: 'g', name: 'Golfers', startSlot: { hole: start }, players: [player('A', Array(courseHoles.length).fill(0)), player('B', Array(courseHoles.length).fill(0))] }] }; }
function mount(contest, params = { id: 'c' }) {
    const completeContest = jest.fn(), updateScore = jest.fn();
    const deps = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', Dimensions: { get: () => ({ width: 390, height: 844 }) } }, 'expo-router': { useLocalSearchParams: () => params, useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }, 'lucide-react-native': Object.fromEntries(['ChevronLeft', 'ChevronRight', 'CheckCircle', 'Minus', 'Plus'].map(n => [n, 'Icon'])), 'react-native-reanimated': { __esModule: true, default: { View: 'View', Text: 'Text' }, FadeIn: { delay: () => ({ duration: () => ({}) }), duration: () => ({}) }, SlideInUp: { duration: () => ({ springify: () => ({}) }) } }, 'expo-haptics': { impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }, '@/services/platform-alert': { showAlert: jest.fn() } };
    const extras = { 'ui/SafeScreen': { SafeScreen: 'SafeScreen' }, 'ui/theme': load('src/ui/theme.ts', {}), 'ui/compact-viewport': { isCompactViewport: () => false }, 'services/cross-device': { onlineEnabled: false }, 'stores/online-store': { useOnlineStore: s => s({ events: {} }) }, 'services/scorecard-overlay': {}, 'engine/types': { executionGameConfig: () => ({}) }, 'engine/actual-inputs': { ACTUAL_INPUT_GAMES: [] }, 'ui/PrePlayDeclarations': { PrePlayDeclarations: () => null }, 'engine/contest-results': { scopedAuxiliary: () => ({}), liveRoundCourse: c => c.isTournament ? c.rounds.find(r => r.number === c.currentRound).course ?? c.course : c.course }, 'engine/calculators/nassau': {}, 'stores/contest-store': { useContestStore: s => s({ contests: [contest], updateScore, completeContest, updateAuxiliaryData: jest.fn() }), getActiveGroups: c => c.isTournament ? c.rounds.find(r => r.number === c.currentRound).groups : c.groups }, 'ui/AuxiliaryPrompt': { __esModule: true, default: () => null, needsAuxiliaryPrompt: () => false }, 'engine/calculators/nassau-press': {}, 'engine/calculators/stroke-play': load('src/engine/calculators/stroke-play.ts', {}), 'config/posthog': { posthog: { capture: jest.fn() } } };
    for (const [k, v] of Object.entries(extras))
        deps['../../../src/' + k] = v;
    const Screen = load('app/contest/[id]/index.tsx', deps).default;
    let tree;
    act(() => { tree = create(React.createElement(Screen)); });
    return { tree, completeContest, updateScore, rerender: () => act(() => tree.update(React.createElement(Screen))), text: () => flatten(tree.toJSON()), dispose: () => act(() => tree.unmount()) };
}
test('selected shotgun group resumes at mixed/unscored hole 12', () => { const c = fixture(); c.groups[0].players.forEach(p => { p.scores[9] = 4; p.scores[10] = 5; }); c.groups[0].players[0].scores[11] = 3; c.groups.unshift({ id: 'other', name: 'Other', players: [player('Other', Array(18).fill(0))] }); const m = mount(c, { id: 'c', groupId: 'g', resumeImport: 'one' }); try {
    expect(m.text()).toContain('HOLE 12');
    expect(m.completeContest).not.toHaveBeenCalled();
}
finally {
    m.dispose();
} });
test('numbered back nine uses course-aligned scores to resume at identity 12', () => { const c = fixture(holes.slice(9)); c.groups[0].players.forEach(p => { p.scores[0] = 4; p.scores[1] = 5; }); const m = mount(c, { id: 'c', groupId: 'g', resumeImport: 'one' }); try {
    expect(m.text()).toContain('HOLE 12');
    expect(m.text()).toContain('PAR4');
}
finally {
    m.dispose();
} });
test('new confirm context resets mounted scoring but editing a score keeps the current hole', () => { const c = fixture(), params = { id: 'c', groupId: 'g', resumeImport: 'one' }, m = mount(c, params); try {
    expect(m.text()).toContain('HOLE 10');
    c.groups[0].players.forEach(p => { p.scores[9] = 4; });
    m.rerender();
    expect(m.text()).toContain('HOLE 10');
    params.resumeImport = 'two';
    m.rerender();
    expect(m.text()).toContain('HOLE 11');
}
finally {
    m.dispose();
} });
test('all scored never auto-finalizes and navigation honors rotated nonsequential order', () => { const c = fixture([holes[11], holes[9], holes[10]], 10); c.groups[0].players.forEach(p => p.scores.fill(4)); const m = mount(c, { id: 'c', groupId: 'g', resumeImport: 'one' }); try {
    expect(m.text()).toContain('HOLE 10');
    expect(m.completeContest).not.toHaveBeenCalled();
    act(() => m.tree.root.findByProps({ testID: 'score-next-hole' }).props.onPress());
    expect(m.text()).toContain('HOLE 11');
    act(() => m.tree.root.findByProps({ testID: 'score-next-hole' }).props.onPress());
    expect(m.text()).toContain('HOLE 12');
}
finally {
    m.dispose();
} });
