import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gate,required} from './shared/usability-gate.mjs';
const report=()=>({required:[...required],results:required.map(id=>({id,status:'passed'}))});
test('complete execution passes',()=>gate(report()));
for(const [name,mutate] of [
  ['zero tests',r=>r.results=[]],
  ['missing result',r=>r.results.pop()],
  ['unexpected skip',r=>r.results[0].status='skipped'],
  ['failed check',r=>r.results[0].status='failed'],
  ['startup failure',r=>r.results=[{id:'startup',status:'failed'}]],
  ['duplicate case',r=>r.results[0].id=r.results[1].id],
  ['missing required inventory',r=>r.required=[]],
]) test(name+' blocks green',()=>{const r=report();mutate(r);assert.throws(()=>gate(r));});
test('only the expected missing-dismiss failure proves regression',()=>{
  const r=report(); r.results[0]={id:'join-empty',status:'failed',error:'Back to home missing dismiss'};
  gate(r,{regression:true});
  r.results[0].error='unrelated startup failure';assert.throws(()=>gate(r,{regression:true}));
});
