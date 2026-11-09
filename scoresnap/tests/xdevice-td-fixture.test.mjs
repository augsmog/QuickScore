import test from 'node:test';
import assert from 'node:assert/strict';
import { withTdFixtureEntitlement } from '../e2e/xdevice-td-fixture.mjs';

test('TD fixture changes only entitlement fields and preserves scan history', () => {
  const input = JSON.stringify({ state: { scansUsed: 2, scanMonth: '2026-11', tier: 'free', isPro: false, isTD: false }, version: 1 });
  const output = JSON.parse(withTdFixtureEntitlement(input));
  assert.deepEqual(output, { state: { scansUsed: 2, scanMonth: '2026-11', tier: 'td', isPro: true, isTD: true }, version: 1 });
});

test('TD fixture handles a fresh store and rejects malformed persisted data', () => {
  assert.deepEqual(JSON.parse(withTdFixtureEntitlement(null)), { state: { tier: 'td', isPro: true, isTD: true }, version: 0 });
  assert.throws(() => withTdFixtureEntitlement('{'), SyntaxError);
});
