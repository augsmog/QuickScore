import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {seedAcceptance,completedRounds} from './acceptance-common.mjs';
import {cases} from './adapter.mjs';
import {evaluate} from './metrics.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('./journeys.json',import.meta.url)));
const added=manifest.journeys.filter(j=>j.fixture==='render-acceptance-v1');
test('synthetic fixture never seeds completion marks and preserves later changes on reload',async()=>{
 const scripts=[];await seedAcceptance({addInitScript:async(fn,arg)=>scripts.push([fn.toString(),arg])},{kind:'settlement',tier:'pro'});
 const values=new Map();const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const run=()=>{for(const [fn,arg] of scripts)vm.runInNewContext(`(${fn})(arg)`,{localStorage,arg:structuredClone(arg)});};
 run();assert.equal(values.has('snapscore-settlement-marks'),false);
 const rounds=JSON.parse(values.get('snapscore-contests')).state.contests;
 assert.equal(rounds.length,2);assert.notEqual(rounds[0].id,rounds[1].id);assert.deepEqual(rounds[0].groups,rounds[1].groups);
 const changed=JSON.parse(values.get('snapscore-contests'));changed.state.contests[0].name='User edit';values.set('snapscore-contests',JSON.stringify(changed));
 values.set('snapscore-settlement-marks','{"state":{"ledgers":{"sentinel":{"marks":{"row":"2026-11-02T00:00:00Z"}}}}}');
 const before=new Map(values);run();assert.deepEqual(values,before);
});
test('fixture has distinguishable per-game oracle, independent of app settlement code',()=>{
 for(const c of completedRounds()){
  const [a,b]=c.groups[0].players;assert.equal(c.course.holes.length,18);assert(a.scores.every((s,i)=>s<b.scores[i]));
  const stroke=c.betUnit;const nassau=[a.scores.slice(0,9),a.scores.slice(9),a.scores].length*c.betUnit;
  assert.equal(stroke,5);assert.equal(nassau,15);assert.equal(stroke+nassau,20);assert.notEqual(stroke,nassau);
 }
});
test('new cases are executable and missing assertion/capture/runtime failures remain red',()=>{
 assert(added.length>0);
 for(const j of added){
  assert.equal(typeof cases[j.id],'function');assert.equal(j.status,'gated');assert.equal(j.knownIssue,undefined);assert.equal(j.baseline,undefined);
  const attempt={metrics:{activations:0,screens:[],durationMs:0,reachability:[]},assertions:[...j.assertions],steps:j.requiredSteps.map(name=>({name})),pageErrors:[]};
  assert.equal(evaluate(j,attempt).status,'passed');
  for(const missing of j.assertions)assert.equal(evaluate(j,{...attempt,assertions:j.assertions.filter(a=>a!==missing)}).status,'failed',missing);
  for(const missing of j.requiredSteps)assert.equal(evaluate(j,{...attempt,steps:attempt.steps.filter(s=>s.name!==missing)}).status,'failed',missing);
  assert.equal(evaluate(j,{...attempt,pageErrors:['sentinel']}).status,'failed');
 }
});
