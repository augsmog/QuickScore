const fs=require('node:fs'),ts=require('typescript');
test('an enrolled single-round score queues through the same round mapping as enrollment',()=>{
 let state;const syncScore=jest.fn(async()=>{});
 const deps={zustand:{create:()=>factory=>{state=factory(update=>{state={...state,...(typeof update==='function'?update(state):update)}},()=>state);return {getState:()=>state,subscribe:()=>()=>{}}}},'zustand/middleware':{persist:f=>f,createJSONStorage:()=>({})},'../config/auth':{REAL_AUTH_CONFIGURED:false},'../stores/online-store':{useOnlineStore:{getState:()=>({events:{c:{snapshot:{protocol:1}}}})}},'./online-store':{useOnlineStore:{getState:()=>({events:{c:{snapshot:{protocol:1}}}})}},'../services/tournament-sync':{syncScore},'../services/guest-join':{generateJoinCode:()=> 'ABC234'},'./auth-store':{useAuthStore:{getState:()=>({})}}};
 const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/stores/contest-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(n=>deps[n]??{},m,m.exports);
 state.addContest({id:'c',groups:[{id:'g',players:[{id:'p',scores:Array(18).fill(0)}]}]});
 state.updateScore('c','g','p',1,4);
 expect(state.contests[0].groups[0].players[0].scores[0]).toBe(4);
 expect(syncScore).toHaveBeenCalledWith('c','c','p',1,4,1);
});
