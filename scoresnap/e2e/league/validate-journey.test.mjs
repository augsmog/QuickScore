import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadJourney, validateJourney, checkFixtureWiring } from './validate-journey.mjs';

const fresh = () => structuredClone(loadJourney());

test('shipped league journey is valid', () => assert.deepEqual(validateJourney(loadJourney()), []));

test('journey wiring matches the xdevice four-identity fixture', () => {
  const src = readFileSync(new URL('../xdevice/four-identities.mts', import.meta.url), 'utf8');
  assert.deepEqual(checkFixtureWiring(src), []);
  assert.ok(checkFixtureWiring('').length > 0);
});

const mutations = {
  'device execution enabled': j => { j.execution.deviceExecutionInThisSlice = true; },
  'physical phones': j => { j.execution.physicalPhones = true; },
  'non-loopback backend': j => { j.execution.backend = 'prod'; },
  'sharing flag dropped': j => { delete j.execution.requiredFlags; },
  'only three identities': j => { j.identities.pop(); },
  'shared simulator': j => { j.identities[1].simulator = 'sim-1'; },
  'non-anonymous guest': j => { j.identities[2].anonymous = false; },
  'duplicate player mapping': j => { j.identities[2].player = 'p1'; },
  'isolation step removed': j => { j.steps = j.steps.filter(s => s.phase !== 'isolation'); },
  'approval before isolation': j => { j.steps.reverse(); },
  'isolation misses a guest': j => { j.steps[0].expect = j.steps[0].expect.filter(e => !(e.actor === 'delta' && e.assert === 'no-roster-visible')); },
  'no exactly-once count': j => { j.steps[3].expect = j.steps[3].expect.filter(e => e.assert !== 'score-event-count-delta'); },
  'no relaunch recovery': j => { j.steps[4].expect = j.steps[4].expect.filter(e => e.assert !== 'membership-restored'); },
  'unknown actor': j => { j.steps[2].actors.push('zed'); },
  'no unmapped-write denial': j => { j.steps[1].expect = j.steps[1].expect.filter(e => e.assert !== 'write-denied'); },
};
for (const [name, mutate] of Object.entries(mutations))
  test(`rejects: ${name}`, () => { const j = fresh(); mutate(j); assert.ok(validateJourney(j).length > 0); });
