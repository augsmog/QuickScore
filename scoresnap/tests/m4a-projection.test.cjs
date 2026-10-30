const {execFileSync}=require('node:child_process');
test('projection isolates cells, shows newest queued clear, and never masks conflict or denial',()=>{
execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
import * as loaded from './src/services/score-projection.ts';
const {projectScore, pendingConfirmation}=loaded.default??loaded;
const d={contest_id:'c',round_id:'r',player_id:'p',hole:1};
const e=(id,state,strokes,overrides={})=>({id,state,draft:{...d,strokes,...overrides}});
assert.deepEqual(projectScore(d,4,[]),{strokes:4,state:'current'});
assert.deepEqual(projectScore(d,4,[e('1','queued',5),e('2','queued',null)]),{strokes:null,state:'queued'});
assert.deepEqual(projectScore(d,4,[e('1','queued',8,{round_id:'other'})]),{strokes:4,state:'current'});
for(const state of ['conflict','denied'])assert.deepEqual(projectScore(d,4,[e('1',state,5),e('2','queued',6)]),{strokes:4,state});
assert.deepEqual(projectScore(d,null,[]),{strokes:null,state:'current'});
const previous=[e('accepted','queued',5),e('blocked','queued',6)];
const durable=[e('blocked','conflict',6)];
assert.deepEqual(pendingConfirmation(previous,durable),[previous[0],durable[0]]);
assert.deepEqual(pendingConfirmation(previous,[]),previous);
`],{stdio:'pipe'});
});
