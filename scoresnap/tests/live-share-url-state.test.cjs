const { execFileSync } = require('node:child_process');
const { test } = require('@jest/globals');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const run = body => void execFileSync(process.execPath, ['--import','tsx','--input-type=module','-e', `
import assert from 'node:assert/strict';
const loaded = await import('./src/services/live-share-url-state.ts');
const state = loaded.default ?? loaded;
const operationModule = await import('./src/services/live-share-operation.ts');
const operation = operationModule.default ?? operationModule;
${body}`], { encoding:'utf8' });

test('active URL follows actor and contest across route remounts and clears on revoke', () => run(`
const ownerRound = state.liveShareScope('owner-a', 'round-1');
const otherActor = state.liveShareScope('owner-b', 'round-1');
const otherRound = state.liveShareScope('owner-a', 'round-2');
state.setLiveShareUrl(ownerRound, 'https://example.test/r/capability');
assert.equal(state.getLiveShareUrl(ownerRound), 'https://example.test/r/capability');
assert.equal(state.getLiveShareUrl(otherActor), undefined);
assert.equal(state.getLiveShareUrl(otherRound), undefined);
state.clearLiveShareUrl(ownerRound);
assert.equal(state.getLiveShareUrl(ownerRound), undefined);
`));

test('subscribers see create and revoke updates and unsubscribe cleanly', () => run(`
const scope = state.liveShareScope('owner', 'round');
let notifications = 0;
const unsubscribe = state.subscribeLiveShareUrl(scope, () => notifications++);
state.setLiveShareUrl(scope, 'https://example.test/r/one');
state.clearLiveShareUrl(scope);
unsubscribe();
state.setLiveShareUrl(scope, 'https://example.test/r/two');
assert.equal(notifications, 2);
assert.equal(state.getLiveShareUrl(scope), 'https://example.test/r/two');
`));

test('pending create, revoke, or snapshot completion cannot commit after scope invalidation', () => run(`
for (const action of ['create', 'revoke', 'snapshot']) {
  const gate = operation.createLiveShareOperationGate();
  const scope = state.liveShareScope('owner', action);
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const operationId = gate.begin();
  const completion = pending.then(() => {
    if (!gate.isCurrent(operationId)) return;
    state.setLiveShareUrl(scope, 'https://example.test/r/stale');
  });
  gate.invalidate();
  finish();
  await completion;
  assert.equal(state.getLiveShareUrl(scope), undefined);
}
`));

test('contest layout owns the only share control and settlement reads shared state', () => {
  const layout = readFileSync('app/contest/[id]/_layout.tsx', 'utf8');
  const settlement = readFileSync('app/contest/[id]/settlement.tsx', 'utf8');
  assert.equal((layout.match(/<LiveShare\b/g) ?? []).length, 1);
  assert.doesNotMatch(settlement, /<LiveShare\b/);
  assert.match(settlement, /useLiveShareUrl\(liveShareScope\(accountId, id\)\)/);
  const liveShare = readFileSync('src/ui/LiveShare.tsx', 'utf8');
  assert.match(liveShare, /activeOperation\.current\.isCurrent\(operationId\)/);
  assert.match(liveShare, /activeOperation\.current\.invalidate\(\)/);
  assert.match(liveShare, /setBusy\(false\)/);
  assert.match(liveShare, /await Share\.share\(\{ message: url \}\);\s+if \(!activeOperation\.current\.isCurrent\(operationId\)\) return;/);
});

test('store-only account A-B-A invalidates pending create and stops old publisher interval', () => run(`
const fs = await import('node:fs');
const ts = await import('typescript');
let auth = { user: { id: 'a' } }, contest = { id: 'round', liveShareEnabled: true };
let finishCreate, publishCalls = 0, updates = 0, tick;
const authListeners = new Set(), effects = [], refs = [];
const deps = {
  react: { useState: value => [value, () => {}], useRef: value => { const ref = refs.shift() ?? { current: value }; return ref; }, useEffect: effect => effects.push(effect) },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'web' }, Share: { share: async () => {} } },
  '../services/live-share': { createLiveLink: () => new Promise(resolve => { finishCreate = resolve; }), revokeLiveLinks: async () => {}, publishSnapshot: async () => { publishCalls++; } },
  '../stores/contest-store': { useContestStore: Object.assign(select => select({ contests: [contest] }), { getState: () => ({ contests: [contest], updateContest: (_id, patch) => { updates++; Object.assign(contest, patch); } }) }) },
  './LiveChat': {}, './theme': { COLORS: {} }, '../config/features': { CROSS_DEVICE_SHARING_ENABLED: true },
  '../stores/auth-store': { useAuthStore: Object.assign(select => select(auth), { getState: () => auth, subscribe: listener => { authListeners.add(listener); return () => authListeners.delete(listener); } }) },
  '../services/live-share-url-state': { clearLiveShareUrl: scope => state.clearLiveShareUrl(scope), liveShareScope: state.liveShareScope, setLiveShareUrl: state.setLiveShareUrl },
  '../services/live-share-operation': operation,
};
globalThis.window = { location: { origin: 'https://example.test' } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });
globalThis.setInterval = callback => { tick = callback; return 1; };
globalThis.clearInterval = () => {};
const source = fs.readFileSync('src/ui/LiveShare.tsx', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', js)(id => deps[id], module, module.exports);
const tree = module.exports.LiveShare({ contest });
effects.forEach(effect => effect());
const creating = tree.props.children[0].props.onPress();
for (const id of ['b', 'a']) { const previous = auth; auth = { user: { id } }; authListeners.forEach(listener => listener(auth, previous)); }
finishCreate('stale-token');
await creating;
assert.equal(state.getLiveShareUrl(state.liveShareScope('a', 'round')), undefined);
assert.equal(updates, 0);
tick();
await Promise.resolve();
assert.equal(publishCalls, 0);
effects.map(effect => effect()).forEach(cleanup => cleanup?.());
`));
