const {execFileSync}=require('node:child_process');
test('enrollment creates only empty rounds, enrolls before bundle and retains server invite',()=>{
execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
const m=await import('./src/services/online-enrollment.ts');const {enrollNewRound}=m.default??m;
const calls=[];const c={id:'c',joinCode:'ABC234',name:'Round',course:{},groups:[{id:'g',name:'Group 1',players:[{id:'a',name:'A',scores:[0]},{id:'b',name:'B',scores:[0]}]}]};
const api={create:async row=>{calls.push('create');assert.equal(row.protocol,0)},rpc:async(n,a)=>{calls.push(n);return n==='sync_capabilities'?{protocol:0,revision:0}:n==='fetch_snapshot'?{invite_code:'ABC234'}:{}}};
assert.equal(await enrollNewRound(c,'actor',api),'ABC234');assert.deepEqual(calls,['create','sync_capabilities','enroll_contest','sync_round_bundle','fetch_snapshot']);
c.groups[0].players[0].scores=[4];await assert.rejects(enrollNewRound(c,'actor',api),/empty/);
`],{stdio:'pipe'});
});
