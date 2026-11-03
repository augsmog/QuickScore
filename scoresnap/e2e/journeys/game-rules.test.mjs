import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cases} from './adapter.mjs';

const manifest=JSON.parse(fs.readFileSync(new URL('./journeys.json',import.meta.url)));
const journey=manifest.journeys.find(j=>j.id==='J-game-rules');

test('game-rules journey is gated with exact-name discovery and a bounded outcome',()=>{
  assert.equal(journey.status,'gated');
  assert.equal(typeof cases['J-game-rules'],'function');
  assert.equal(journey.start,'home');
  assert.equal(journey.budget.activations,3);
  assert.deepEqual(journey.assertions,['entry','library','rule','outcome']);
  assert.deepEqual(journey.requiredSteps,['entry','game-library','game-modes-scroll','skins-rules','home-restored']);
  assert.deepEqual(journey.features.map(({role,accessibleName,testId})=>({role,accessibleName,testId})),[
    {role:'button',accessibleName:'See all game modes',testId:'home-see-all-modes'},
    {role:'button',accessibleName:'Skins',testId:'game-mode-row-skins'},
  ]);
  assert.equal(journey.features[1].maxActivations,2);
  assert.equal(journey.features[1].maxScrolls,1);
});
