const {execFileSync}=require('node:child_process');
test('completion blocks unsent/conflicting drafts and identity changes; server CAS errors never become success',()=>{
execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
import * as mod from './src/services/tournament-completion.ts';
const {tournamentCompletion}=mod.default??mod;
let actor='a', entries=[], calls=[], refreshes=0, error=null;
const snapshot={revision:17,completed:false,capabilities:{enabled:true}};
const api=tournamentCompletion({actor:async()=>actor,queue:async()=>({entries}),refresh:async()=>{refreshes++;return snapshot},rpc:async(name,args)=>{calls.push({name,args});return {data:{status:'submitted'},error}}});
for (const state of ['queued','conflict','denied']) {
 entries=[{state,draft:{contest_id:'c'}}];
 await assert.rejects(api.submit('c','r','g'),/Resolve and sync/);
}
assert.equal(calls.length,0);
entries=[];await api.submit('c','r','g');
assert.deepEqual(calls.pop(),{name:'submit_group',args:{contest_id:'c',round_id:'r',group_id:'g',expected_revision:17}});
await api.finalize('c');assert.equal(calls.pop().name,'finalize_tournament');
error={code:'40001'};await assert.rejects(api.finalize('c'),e=>e.code==='40001');error=null;
snapshot.completed=true;await assert.rejects(api.submit('c','r','g'),/active online/);snapshot.completed=false;
snapshot.capabilities.enabled=false;await assert.rejects(api.finalize('c'),/active online/);snapshot.capabilities.enabled=true;
let checks=0;
const changed=tournamentCompletion({actor:async()=>++checks===1?'a':'b',queue:async()=>({entries:[]}),refresh:async()=>snapshot,rpc:async()=>{throw Error('must not send')}});
await assert.rejects(changed.finalize('c'),/Identity changed/);
let queues=0;
const appeared=tournamentCompletion({actor:async()=>'a',queue:async()=>({entries:++queues===1?[]:[{draft:{contest_id:'c'}}]}),refresh:async()=>snapshot,rpc:async()=>{throw Error('must not send')}});
await assert.rejects(appeared.finalize('c'),/Resolve and sync/);
`],{stdio:'pipe'});
});
