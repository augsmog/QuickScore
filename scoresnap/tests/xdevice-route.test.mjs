import test from 'node:test';
import assert from 'node:assert/strict';
import { isSavedContestPath } from '../e2e/xdevice-route.mjs';

test('only a saved contest UUID route qualifies for the post-create flow', () => {
  assert.equal(isSavedContestPath('/contest/new'), false);
  assert.equal(isSavedContestPath('/contest/'), false);
  assert.equal(isSavedContestPath('/contest/123'), false);
  assert.equal(isSavedContestPath('/contest/7f857f4c-8d09-4ae7-a251-047d9dc79c21'), true);
  assert.equal(isSavedContestPath('/contest/7F857F4C-8D09-4AE7-A251-047D9DC79C21'), true);
});
