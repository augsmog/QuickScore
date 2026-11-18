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

for (const settles of [true,false]) {
  test(`library capture waits for sheet stability (${settles?'settles':'timeout'})`,async()=>{
    let release,entered;
    const stability=new Promise((resolve,reject)=>{release=settles?resolve:reject;});
    const reachedStability=new Promise(resolve=>{entered=resolve;});
    const events=[];
    const stop=new Error('stop after library capture');
    const timeout=new Error('control did not settle inside viewport');
    const locator={
      waitFor:async()=>{events.push('visible');},
      evaluate:async()=>{events.push('stability');entered();await stability;events.push('settled');},
    };
    const run=cases['J-game-rules']({
      page:{getByTestId:()=>({}),getByText:()=>locator},
      act:{activate:async()=>{events.push('open');}},
      // Layout/entry checks have their own browser coverage. Exercise the real
      // adapter's async capture ordering without a browser animation clock.
      check:async()=>{},
      step:async name=>{events.push(name);throw stop;},
    });
    const outcome=run.then(()=>({}),error=>({error}));
    // The old capture-before-wait path stops without reaching stability.
    await Promise.race([reachedStability,outcome]);
    assert.deepEqual(events,['open','visible','stability']);
    release(settles?undefined:timeout);
    assert.equal((await outcome).error,settles?stop:timeout);
    assert.deepEqual(events,settles
      ?['open','visible','stability','settled','game-library']
      :['open','visible','stability']);
  });
}
