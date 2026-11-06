// AUG-744 (Gap 2): a finished round must publish a completed snapshot to Supabase so activation
// (first_round_finishes) counts it, even when Live Share was never toggled. completeContest fills the
// off-path for an authenticated, non-anonymous owner; the live-share subscription still covers the
// on-path (liveShareEnabled) without a double publish; anonymous owners stay excluded.
const runNode = require('./helpers/run-node.cjs');

function harness(body) {
  return runNode(['--import', 'tsx', '--input-type=module', '-e', `
 import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';
 const UUID='11111111-1111-4111-8111-111111111111';
 let state, listeners=[];
 const publishCalls=[];
 let auth={session:{user:{id:UUID}},isAnonymous:false,user:{id:UUID},remoteUserId:null};
 const setAuth=a=>{auth=a;};
 const zcreate=()=>factory=>{
   const setState=u=>{const prev=state;const patch=typeof u==='function'?u(state):u;state={...state,...patch};for(const l of [...listeners])l(state,prev);};
   state=factory(setState,()=>state);
   return {getState:()=>state,setState,subscribe:l=>{listeners.push(l);return ()=>{listeners=listeners.filter(x=>x!==l);};}};
 };
 const deps={
   'expo-crypto':{randomUUID:()=>'tok'},
   './scan-store':{useScanStore:{getState:()=>({tier:'free'})}},
   '../services/live-share':{publishSnapshot:(contest,actor)=>{publishCalls.push({id:contest.id,status:contest.status,actor});return Promise.resolve();}},
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

test('off-path: a finished round with Live Share never toggled still publishes for an authenticated owner', () => {
  harness(`
   seed({liveShareEnabled:false});
   await tick(); publishCalls.length=0;
   store.getState().completeContest('c');
   await tick(); await tick();
   assert.equal(completedPublishes().length,1,'exactly one completed publish on the off-path');
   assert.equal(completedPublishes()[0].actor,UUID,'publish carries the authenticated actor id');
  `);
});

test('anonymous owner is excluded even when completing a round', () => {
  harness(`
   seed({liveShareEnabled:false});
   await tick(); publishCalls.length=0;
   setAuth({session:null,isAnonymous:true,user:{id:'anon-1'},remoteUserId:null});
   store.getState().completeContest('c');
   await tick(); await tick();
   assert.equal(completedPublishes().length,0,'anonymous completion must not publish');
  `);
});

test('on-path: Live Share enabled still publishes the completed snapshot exactly once (no double)', () => {
  harness(`
   seed({liveShareEnabled:true});
   await tick(); publishCalls.length=0;
   store.getState().completeContest('c');
   await tick(); await tick();
   assert.equal(completedPublishes().length,1,'on-path publishes the completed snapshot exactly once via the subscription');
   assert.equal(completedPublishes()[0].actor,UUID,'on-path publish carries the authenticated actor id');
  `);
});
