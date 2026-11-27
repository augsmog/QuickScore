import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateArtifact } from './native-manual.mjs';
import { validateFixture } from './contract.mjs';
import { hostCreateSteps, guestRequestSteps, guestReconnectSteps, hostReopenSteps, hiddenEntrySteps, deriveFreshFixture } from './native-manual-flow.mjs';
const name='Native Journey abc123abcdef', code='ABC234';
const options=(keys,s)=>s.filter(step=>keys.some(k=>k in step));
test('guest starts via onboarding UI and explicitly types the six-character code before requesting',()=>{
  const steps=guestRequestSteps(code);
  assert.deepEqual(options(['tapOn','inputText'],steps).slice(0,4),[
    {tapOn:'Join a group'},{tapOn:'^Join code$'},{inputText:code},{tapOn:'^Display name$'}]);
  assert(!steps.some(s=>'openLink' in s));
  assert(steps.some(s=>s?.extendedWaitUntil?.visible==='Request sent.*'));
  assert.throws(()=>guestRequestSteps('DGTWEW'));
  assert.throws(()=>guestRequestSteps('wrong'));
});
test('host uses setup, group assign, Start, and explicit sharing; no pre-seeded round',()=>{
  const steps=hostCreateSteps(name);
  const ids=steps.map(s=>s.tapOn?.id??s.tapOn).filter(Boolean);
  assert.deepEqual(ids.slice(-6),['add-group','wizard-player-group-2','contest-continue','contest-continue','contest-start','Enable online sharing']);
  assert(steps.some(s=>s.inputText===name));
  assert(!steps.some(s=>'openLink' in s));
  // The id the host taps must be one the iPhone app renders for Player 2.
  const app=readFileSync(new URL('../../app/contest/new.tsx',import.meta.url),'utf8');
  assert(app.includes('testID={Platform.OS === "ios" && idx > 0 ? `wizard-player-group-${idx + 1}` : `player-group-${player.name}`}'));
});
test('cold re-entry only navigates app UI; never replays the guest request',()=>{
  const guest=guestReconnectSteps(name), host=hostReopenSteps(name);
  assert(guest.some(s=>s.tapOn?.id==='home-join-code'));
  assert(host.some(s=>s.tapOn==='^Contests$') && host.some(s=>s.tapOn===name));
  assert(![...guest,...host].some(s=>'openLink' in s||'inputText' in s||s.tapOn==='Find contest'));
});
test('negative guards onboarding, auth, and actual Home entry',()=>{
  const a=hiddenEntrySteps('me@example.test','secret');
  assert.deepEqual(a.filter(x=>'assertNotVisible' in x).map(x=>x.assertNotVisible),
    ['Join a group','^Join with code$',{id:'home-join-code'}]);
  assert(a.some(x=>x.extendedWaitUntil?.visible?.id==='home-new-contest'));
});
const u=(n)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function runData(){
  const startedAt=Date.parse('2026-11-25T17:00:00.000Z');
  const seed={name,startedAt,api:'http://127.0.0.1:54321',hostSession:{user:{id:u(1)}}};
  const row={id:u(2),owner_id:u(1),name,created_at:'2026-11-25T17:00:01Z'};
  const groups=[{id:u(3),name:'Group 1'},{id:u(4),name:'Group 2'}];
  const players=[{id:u(5),displayName:'JourneyHost',group_id:u(3)},{id:u(6),displayName:'Journey Guest',group_id:u(4)}].map(p=>({...p,cells:Array.from({length:18},(_,i)=>({hole:i+1,strokes:null}))}));
  const snapshot={contest_id:u(2),name,invite_code:code,rounds:[{id:u(7),name,groups,players,course:{holes:Array.from({length:18},(_,i)=>({num:i+1,par:4}))}}]};
  return [seed,row,snapshot];
}
test('fixture derives exact actor, freshly observed round, unique groups and same row/snapshot IDs',()=>{
  const f=deriveFreshFixture(...runData());
  validateFixture(f);
  assert.equal(f.code,code);
  assert.equal(f.roundId,u(7));
  assert.equal(f.players[1].id,u(6));
});
test('preexisting row, wrong owner, wrong group, scored round and wrong snapshot rejected',()=>{
  for(const mutate of [
    d=>d[1].created_at='2026-11-25T16:59:00Z',
    d=>d[1].owner_id=u(99),
    d=>d[2].rounds[0].players[1].group_id=u(3),
    d=>d[2].rounds[0].players[0].cells[0].strokes=4,
    d=>d[2].contest_id=u(44),
  ]){const d=runData();mutate(d);assert.throws(()=>deriveFreshFixture(...d));}
});
test('artifact flags, exact source, local API and digest proofs fail closed',()=>{
  const expected='a'.repeat(40), api='http://127.0.0.1:54321', sha='e'.repeat(64);
  const meta={schema:'invite-journey-app/1',source_sha:expected,api,cross_device_sharing:true,offline:false,executable_sha256:sha,bundle_sha256:sha};
  validateArtifact(meta,api,expected,true);
  assert.throws(()=>validateArtifact(meta,api,expected,false));
  assert.throws(()=>validateArtifact(meta,api,'b'.repeat(40),true));
  assert.throws(()=>validateArtifact({...meta,bundle_sha256:undefined},api,expected,true));
  assert.throws(()=>validateArtifact({...meta,api:'http://example.test'},api,expected,true));
});
test('orchestrator never seeds contest; PASS receipt follows terminal readback and negative UI health',()=>{
  const native=readFileSync(new URL('./native-manual.mjs',import.meta.url),'utf8');
  assert(!native.includes("'/rest/v1/contests',{method:'POST'"));
  assert(!native.includes('seed.mts'));
  assert(!native.includes('snapscore://'));
  assert(native.includes('assert.deepEqual(await contests(),[]'));
  assert(native.lastIndexOf('await checkBinding();assertScores')<native.indexOf("path.join(out,'receipt.json')"));
  assert(native.indexOf("await flow(negative,hiddenEntrySteps")<native.lastIndexOf("await responseJSON(seed,'/auth/v1/health')"));
});
