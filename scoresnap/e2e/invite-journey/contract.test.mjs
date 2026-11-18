import test from 'node:test';
import assert from 'node:assert/strict';
import { disposableURL, validateFixture, assertScores, assertBinding, assertShare } from './contract.mjs';
const fixture = () => ({ api: 'http://127.0.0.1:54321', contestId:'contest', code:'ABC234', roundId:'round',
  players:[{id:'host',groupId:'g1',name:'Journey Host',score:4},{id:'guest',groupId:'g2',name:'Journey Guest',score:6}], hole:1 });
const snapshot = () => ({contest_id:'contest',invite_code:'ABC234',rounds:[{id:'round',groups:[{id:'g1'},{id:'g2'}],players:[
  {id:'host',group_id:'g1',cells:[{hole:1,strokes:4},{hole:2,strokes:null}]},
  {id:'guest',group_id:'g2',cells:[{hole:1,strokes:6},{hole:2,strokes:null}]}]}]});
test('disposable boundary rejects remote, credentials, altered port and production invite',()=>{
  for(const url of ['https://example.com','http://127.0.0.1:54321.evil.test','http://user@127.0.0.1:54321','http://127.0.0.1:9999','http://127.0.0.1:54321/path']) assert.throws(()=>disposableURL(url));
  assert.equal(disposableURL(fixture().api),fixture().api);
  assert.throws(()=>validateFixture({...fixture(),code:'DGTWEW'}));
  assert.throws(()=>validateFixture({...fixture(),players:[fixture().players[0],fixture().players[0]]}));
  validateFixture(fixture());
});
test('persisted proof is keyed by contest, round, group, player and hole; wrong cells fail',()=>{
  assertScores(fixture(),snapshot());
  for(const mutate of [s=>s.contest_id='other',s=>s.rounds[0].id='other',s=>s.rounds[0].players[1].id='other',s=>s.rounds[0].players[1].group_id='g1',s=>s.rounds[0].players[1].cells[0].strokes=4,s=>s.rounds[0].players[0].cells[1].strokes=8,s=>s.rounds[0].players[0].cells.pop()]) {
    const s=snapshot();mutate(s);assert.throws(()=>assertScores(fixture(),s));
  }
});
test('intended anonymous binding and actual copied payload cannot use substitute identities/codes',()=>{
  const m={user_id:'anon',player_id:'guest',status:'approved'};
  assertBinding(fixture(),m,'anon');
  for(const patch of [{user_id:'other'},{player_id:'host'},{status:'pending'}]) assert.throws(()=>assertBinding(fixture(),{...m,...patch},'anon'));
  assertShare(fixture(),'Sign in. snapscore://join/ABC234');
  assertShare(fixture(),'http://127.0.0.1:8089/join/ABC234');
  for(const payload of ['ABC234','snapscore://join/XYZ234','snapscore://join/ABC234extra']) assert.throws(()=>assertShare(fixture(),payload));
});

test('native artifact requires matching provenance, sharing and disposable backend before execution',async()=>{
  const {validateArtifact}=await import('./native.mjs');
  const source='a'.repeat(40),meta={schema:'invite-journey-app/1',source_sha:source,api:fixture().api,cross_device_sharing:true,offline:false,executable_sha256:'b'.repeat(64)};
  validateArtifact(meta,fixture(),source);
  for(const patch of [{source_sha:'c'.repeat(40)},{api:'https://production.invalid'},{cross_device_sharing:false},{offline:true},{executable_sha256:''}]) assert.throws(()=>validateArtifact({...meta,...patch},fixture(),source));
});

test('canonical invite is owner-only; guest score proof must not demand or expose it',()=>{
  const guest=snapshot();delete guest.invite_code;
  assertScores(fixture(),guest,{owner:false});
  assert.throws(()=>assertScores(fixture(),guest));
  assert.throws(()=>assertScores(fixture(),snapshot(),{owner:false}));
});
