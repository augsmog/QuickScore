// AUG-774 (AUG-277c, Gap 2 client→server linkage): the server-side CI fixture
// `scripts/ci/test-first-round-finished.sql` writes `published_rounds`/`first_round_finishes` rows
// *directly*, so the CLIENT→SERVER edge for Gap 2 — i.e. `completeContest` actually handing a
// `status:"completed"` snapshot to `publishSnapshot` (→ RPC `publish_shared_round` → `ended_at`) —
// was never exercised by a test. AUG-744's `activation-complete-publish.test.cjs` covers the
// off-path (liveShareEnabled:false) and on-path (true) and anonymous exclusion. This file adds the
// two linkage/robustness cases that fixture leaves open:
//   1. `liveShareEnabled` UNDEFINED (not just false) still drives exactly one completed-snapshot
//      publish carrying the authenticated actor id — the payload the server trigger keys on.
//   2. An offline / auth / RPC failure (publishSnapshot rejects) is BOUNDED: completeContest does not
//      throw, local completion stands, and no unhandled promise rejection escapes.
// Source under test: scoresnap/src/stores/contest-store.ts completeContest off-path enqueue
// (contest-store.ts:343-347) and the live-share subscription (contest-store.ts:610-619).
const runNode = require('./helpers/run-node.cjs');

// `publishMode`: 'resolve' => publishSnapshot resolves; 'reject' => it rejects (offline/auth/RPC failure).
function harness(body, publishMode = 'resolve') {
  return runNode(['--import', 'tsx', '--input-type=module', '-e', `
 import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';
 const UUID='11111111-1111-4111-8111-111111111111';
 // Fail loudly if any rejection from the publish path escapes unhandled.
 const unhandled=[];
 process.on('unhandledRejection',(r)=>{unhandled.push(r);});
 let state, listeners=[];
 const publishCalls=[];
 let auth={session:{user:{id:UUID}},isAnonymous:false,user:{id:UUID},remoteUserId:null};
 const setAuth=a=>{auth=a;};
 const PUBLISH_MODE=${JSON.stringify(publishMode)};
 const zcreate=()=>factory=>{
   const setState=u=>{const prev=state;const patch=typeof u==='function'?u(state):u;state={...state,...patch};for(const l of [...listeners])l(state,prev);};
   state=factory(setState,()=>state);
   return {getState:()=>state,setState,subscribe:l=>{listeners.push(l);return ()=>{listeners=listeners.filter(x=>x!==l);};}};
 };
 const deps={
   'expo-crypto':{randomUUID:()=>'tok'},
   './scan-store':{useScanStore:{getState:()=>({tier:'free'})}},
   '../services/live-share':{publishSnapshot:(contest,actor)=>{publishCalls.push({id:contest.id,status:contest.status,actor});return PUBLISH_MODE==='reject'?Promise.reject(new Error('offline: publish_shared_round failed')):Promise.resolve();}},
   '../services/ocr-review':{completeScores:()=>[]},
   '../config/auth':{REAL_AUTH_CONFIGURED:true},
   './auth-store':{useAuthStore:{getState:()=>auth}},
   './online-store':{useOnlineStore:{getState:()=>({events:{}})}},
   '../stores/online-store':{useOnlineStore:{getState:()=>({events:{}})}},
   '../services/tournament-sync':{syncScore:()=>{},syncRound:()=>{},syncRoundGroups:()=>{},syncContestTournamentMeta:()=>Promise.resolve()},
   '../services/guest-join':{generateJoinCode:()=>'ABC234'},
   zustand:{create:zcreate},
   'zustand/middleware':{persist:f=>f,createJSONStorage:()=>({})},
 };
 const m={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/stores/contest-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(n=>deps[n]??{},m,m.exports);
 const store=m.exports.useContestStore;
 const tick=()=>new Promise(r=>setImmediate(r));
 const seed=(patch)=>store.setState({contests:[{id:'c',name:'Round',status:'active',games:['stroke_play'],groups:[{id:'g',players:[{id:'p',scores:[]}]}],...patch}]});
 const completedPublishes=()=>publishCalls.filter(c=>c.status==='completed'&&c.id==='c');
 ${body}
`]);
}

test('client→server linkage: completeContest with liveShareEnabled UNDEFINED hands one completed snapshot to publishSnapshot', () => {
  harness(`
   seed({});                 // no liveShareEnabled key at all → undefined, the real default for a never-shared round
   await tick(); publishCalls.length=0;
   assert.equal(store.getState().contests[0].liveShareEnabled,undefined,'precondition: liveShareEnabled is undefined, not false');
   store.getState().completeContest('c');
   await tick(); await tick();
   assert.equal(completedPublishes().length,1,'exactly one completed-snapshot publish reaches the client→server boundary');
   assert.equal(completedPublishes()[0].status,'completed','snapshot carries status=completed — the flag publish_shared_round maps to published_rounds.ended_at');
   assert.equal(completedPublishes()[0].actor,UUID,'publish carries the authenticated owner id (server attributes activation to owner_id)');
   assert.equal(store.getState().contests[0].status,'completed','local completion stands');
   assert.equal(unhandled.length,0,'no unhandled rejection on the happy path');
  `);
});

test('bounded failure: a rejecting publish (offline/auth/RPC) does not throw, keeps local completion, and never leaks an unhandled rejection', () => {
  harness(`
   seed({});
   await tick(); publishCalls.length=0;
   // completeContest must not throw even though the enqueued publish will reject.
   store.getState().completeContest('c');
   await tick(); await tick(); await tick();
   assert.equal(completedPublishes().length,1,'the publish was still attempted exactly once');
   assert.equal(store.getState().contests[0].status,'completed','local scoring/completion is unaffected by the server failure');
   assert.equal(unhandled.length,0,'the rejected publish is swallowed — no unhandled rejection storm');
  `, 'reject');
});

test('negative guard: anonymous owner produces no client→server publish (mirrors server anonymous exclusion)', () => {
  harness(`
   seed({});
   await tick(); publishCalls.length=0;
   setAuth({session:null,isAnonymous:true,user:{id:'anon-1'},remoteUserId:null});
   store.getState().completeContest('c');
   await tick(); await tick();
   assert.equal(completedPublishes().length,0,'anonymous completion must not reach the server');
   assert.equal(unhandled.length,0,'no unhandled rejection on the guarded path');
  `);
});
