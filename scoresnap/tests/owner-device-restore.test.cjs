const {execFileSync}=require('node:child_process');
function run(body){execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',body],{stdio:'pipe'});}
const setup=`import assert from 'node:assert/strict';
const m=await import('./src/services/online-client.ts'); const {onlineClient}=m.default??m;
const r=await import('./src/services/restore-owner-contest.ts');const {restoreOwnerContest}=r.default??r;
const cap={api_version:1,contract:'snapscore-sync-v1',protocol:1,enabled:true,channel:{private:true,event:'revision',topic:'snapscore:c'}};
const snapshot={contest_id:'c',name:'Restored',protocol:1,revision:4,capabilities:cap,course:{name:'Course',holes:[]},games:[],id_map:[],rounds:[{id:'r',number:1,name:'Round',course:{name:'Course',holes:[]},groups:[{id:'g',name:'Group'}],players:[{id:'p',displayName:'Player',handicap:0,group_id:'g',cells:[{hole:1,strokes:4}]}]}]};
const calls=[],contests=[];let fail=false;
const rpc=async n=>{calls.push(n);if(n==='list_join_requests'&&fail) return {error:{code:'42501'}};return {data:n==='my_sync_status'?{api_version:1,memberships:[],requests:[]}:n==='sync_capabilities'?cap:n==='fetch_snapshot'?snapshot:[]}};
const read=async code=>{assert.ok(!code||code==='ABC234');return [{id:'c'}]};
const api=onlineClient(rpc,(id,member,s)=>{if(member)contests.push(restoreOwnerContest(s));},read);
`;
test('fresh-storage owner discovery restores list entry and accepted scores without membership',()=>run(setup+`
assert.equal(contests.length,0);await api.discover();assert.equal(contests[0].name,'Restored');assert.equal(contests[0].groups[0].players[0].scores[0],4);assert.ok(calls.includes('list_join_requests'));`));
test('own-code join restores host without creating self-request; denial never restores',()=>run(setup+`
assert.equal(await api.joinCode('abc234',''),'c');assert.ok(!calls.includes('request_join'));assert.equal(contests.length,1);
fail=true;await assert.rejects(api.joinCode('ABC234',''));assert.equal(contests.length,1);`));
test('member code still requests approval; ownership transport errors do not create requests',()=>run(setup+`
const member=onlineClient(rpc,()=>{},async()=>[]);await member.joinCode('ABC234','Guest');assert.ok(calls.includes('request_join'));
calls.length=0;const broken=onlineClient(rpc,()=>{},async()=>{throw Error('network')});await assert.rejects(broken.joinCode('ABC234','Guest'));assert.equal(calls.length,0);`));
test('selected games and settlement settings are included in the enrollment bundle',()=>run(`
import assert from 'node:assert/strict';const m=await import('./src/services/online-enrollment.ts');const {enrollNewRound}=m.default??m;
const c={id:'c',name:'Round',joinCode:'ABC234',course:{},groups:[],games:['stroke_play','skins'],betUnit:5,hasTeams:false,gameConfig:{rulesVersion:1}};
let bundle;await enrollNewRound(c,'owner',{create:async()=>{},rpc:async(n,a)=>{if(n==='sync_round_bundle')bundle=a.payload;return {protocol:1}}});
assert.deepEqual(bundle.games,c.games);assert.deepEqual(bundle.game_settings,{betUnit:5,hasTeams:false,gameConfig:c.gameConfig});`));
