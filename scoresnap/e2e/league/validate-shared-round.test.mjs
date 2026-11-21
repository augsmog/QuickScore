import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSharedRound, validateSharedRound, checkFixtureWiring } from './validate-shared-round.mjs';

const fresh = () => structuredClone(loadSharedRound());
test('shipped shared-round journey is valid', () => assert.deepEqual(validateSharedRound(loadSharedRound()), []));
test('wiring matches the xdevice four-identity fixture', () => {
  const src = readFileSync(new URL('../xdevice/four-identities.mts', import.meta.url), 'utf8');
  assert.deepEqual(checkFixtureWiring(src), []);
  assert.ok(checkFixtureWiring('').length > 0);
});
test('league exclusion points at the AUG-1273 journey that exists', () => {
  assert.match(loadSharedRound().branches.league.exclusion, /AUG-1273/);
  assert.ok(readFileSync(new URL('./four-sim-league.journey.json', import.meta.url), 'utf8').length > 0);
});
const mutations = {
  'device execution enabled': j => { j.execution.deviceExecutionInThisSlice = true; },
  'production writes': j => { j.execution.productionWrites = true; },
  'new build': j => { j.execution.newBuild = true; },
  'non-loopback backend': j => { j.execution.backend = 'prod'; },
  'sharing flag dropped': j => { delete j.execution.requiredFlags; },
  'three identities': j => { j.identities.pop(); },
  'shared simulator': j => { j.identities[1].simulator = 'sim-1'; },
  'non-anonymous guest': j => { j.identities[2].anonymous = false; },
  'duplicate player': j => { j.identities[2].player = 'p1'; },
  'tournament excluded silently': j => { j.branches.tournament.exclusion = ''; },
  'league undeclared': j => { delete j.branches.league; },
  'shared-round excluded': j => { j.branches['shared-round'].included = false; },
  'join step removed': j => { j.steps = j.steps.filter(s => s.phase !== 'join'); },
  'phases reversed': j => { j.steps.reverse(); },
  'no roster assertion': j => { j.steps[1].expect = j.steps[1].expect.filter(e => e.assert !== 'roster-lists-all-players'); },
  'no write-denied': j => { j.steps[1].expect = j.steps[1].expect.filter(e => e.assert !== 'write-denied'); },
  'single writer': j => { j.steps[2].actors = ['bravo']; },
  'no conflict resolution': j => { j.steps[3].expect = j.steps[3].expect.filter(e => e.assert !== 'conflict-resolved-deterministically'); },
  'no reopen recovery': j => { j.steps[4].expect = j.steps[4].expect.filter(e => e.assert !== 'membership-restored'); },
  'unknown actor': j => { j.steps[2].actors.push('zed'); },
};
for (const [name, m] of Object.entries(mutations))
  test(`rejects: ${name}`, () => { const j = fresh(); m(j); assert.ok(validateSharedRound(j).length > 0); });
