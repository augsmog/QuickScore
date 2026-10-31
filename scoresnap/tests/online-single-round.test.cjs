const runNode=require('./helpers/run-node.cjs');
test('an enrolled single-round score queues through the same round mapping as enrollment',()=>{runNode(['--import','tsx','--input-type=module','-e',`
 import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';
 const validators=await import('./src/engine/contest-validation.ts').then(m=>m.default??m);
 let state;const calls=[];const syncScore=async(...args)=>{calls.push(args);};
 const deps={'expo-crypto':{randomUUID:()=> 'edit-token'},'./scan-store':{useScanStore:{getState:()=>({tier:'free'})}},'../engine/contest-validation':validators,zustand:{create:()=>factory=>{state=factory(update=>{state={...state,...(typeof update==='function'?update(state):update)}},()=>state);return {getState:()=>state,subscribe:()=>()=>{}}}},'zustand/middleware':{persist:f=>f,createJSONStorage:()=>({})},'../config/auth':{REAL_AUTH_CONFIGURED:false},'../stores/online-store':{useOnlineStore:{getState:()=>({events:{c:{snapshot:{protocol:1}}}})}},'./online-store':{useOnlineStore:{getState:()=>({events:{c:{snapshot:{protocol:1}}}})}},'../services/tournament-sync':{syncScore},'../services/guest-join':{generateJoinCode:()=> 'ABC234'},'./auth-store':{useAuthStore:{getState:()=>({})}}};
 const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/stores/contest-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(n=>deps[n]??{},m,m.exports);
 state.addContest({id:'c',games:['stroke_play'],groups:[{id:'g',players:[{id:'p',scores:Array(18).fill(0)}]}]});
 state.updateScore('c','g','p',1,4);
 assert.equal(state.contests[0].groups[0].players[0].scores[0],4);
 assert.equal(state.contests[0].onlineEdits['[\"c\",\"p\",1]'].token,'edit-token');
 assert.deepEqual(calls,[['c','c','p',1,4,1,'edit-token']]);
`]);});
