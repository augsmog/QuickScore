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
