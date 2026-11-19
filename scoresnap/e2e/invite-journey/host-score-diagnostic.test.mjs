import test from 'node:test';
import assert from 'node:assert/strict';
import {readHostScoreState} from './host-score-diagnostic.mjs';
const input={contestId:'contest',playerId:'host',playerName:'Journey Host',hole:1};
function storage(values) {return {length:Object.keys(values).length,key:i=>Object.keys(values)[i],getItem:k=>values[k]??null};}
const local=score=>JSON.stringify({state:{contests:[{id:'contest',status:'active',remoteRestored:true,currentRound:1,groups:[{players:[{id:'host',name:'Journey Host',scores:[score,0]}]}]}]}});
test('diagnostic distinguishes populated score no-op from unset score',()=>{
  for(const score of [0,4]) {
    const r=readHostScoreState(input,storage({'snapscore-contests':local(score)}));
    assert.equal(r.contestPresent,true);assert.equal(r.remoteRestored,true);
    assert.equal(r.players[0].strokes,score);assert.equal(r.players[0].hasScore,score>0);
  }
});
test('diagnostic reports target queued write without leaking storage secrets or other cells',()=>{
  const entry={state:'queued',draft:{contest_id:'contest',player_id:'host',hole:1,strokes:4},request:{token:'SECRET_REQUEST'}};
  const box={format:1,actor:'SECRET_ACTOR',entries:[entry,{...entry,draft:{...entry.draft,player_id:'other',strokes:99}},{...entry,draft:{...entry.draft,hole:2,strokes:88}}]};
  const r=readHostScoreState(input,storage({'snapscore-contests':local(0),'snapscore-auth':'SECRET_AUTH','snapscore.outbox.v1.SECRET_KEY':JSON.stringify(box)}));
  assert.deepEqual(r.outboxes,[{valid:true,entries:[{state:'queued',strokes:4,requestMaterialized:true}]}]);
  assert(!JSON.stringify(r).includes('SECRET'));assert(!JSON.stringify(r).includes('99'));assert(!JSON.stringify(r).includes('88'));
});
test('diagnostic handles missing, damaged and unavailable storage without exposing errors',()=>{
  assert.equal(readHostScoreState(input,storage({})).contestPresent,false);
  assert.deepEqual(readHostScoreState(input,storage({'snapscore.outbox.v1.actor':'SECRET_INVALID'})).outboxes,[{valid:false}]);
  const r=readHostScoreState(input,{getItem(){throw Error('SECRET_ERROR');}});
  assert.equal(r.storageReadable,false);assert(!JSON.stringify(r).includes('SECRET'));
});
