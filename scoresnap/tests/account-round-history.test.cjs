const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, imports) {
 const output = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports:output,require:name=>{if(!(name in imports))throw Error(name); return imports[name];}});
 return output;
}
const logic=load('src/services/account-merge.ts',{});
function setup() {
 const local={id:'same',groups:[],scores:[3]}, another={id:'new',groups:[],scores:[5]};
 let state={contests:[local,another]}, pending=new Map(), owner='account', fail=false, uploads=0;
 const rows=new Map([['same',{id:'same',groups:[],scores:[4]}]]);
 const store={getState:()=>state,setState:fn=>{state={...state,...fn(state)}}};
 const storage={getItem:async k=>pending.get(k)??null,setItem:async(k,v)=>{pending.set(k,v)},removeItem:async k=>pending.delete(k)};
 const api=load('src/services/account-round-history.ts',{
  '@react-native-async-storage/async-storage':{default:storage},
  '../db/supabase':{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:owner}}}})},from:()=>({
   upsert:async data=>{uploads++; if(fail)return {error:Error('offline')}; for(const row of data)if(!rows.has(row.local_id))rows.set(row.local_id,row.snapshot); return {error:null};},
   select:()=>({eq:async()=>({data:[...rows.values()].map(snapshot=>({snapshot})),error:null})}),
  })}},
  '../stores/contest-store':{useContestStore:store},'./account-merge':logic,
 });
 return {api,store,pending,rows,setOwner:id=>{owner=id},fail:()=>{fail=true},uploads:()=>uploads};
}
test('real history service uploads with stable IDs and keeps account scorecard on collision; repeat has no duplicates',async()=>{
 const s=setup();await s.api.stageGuestHistory();expect(await s.api.claimGuestHistory('account')).toBe(2);
 expect(s.store.getState().contests.map(c=>c.id)).toEqual(['same','new']);
 expect(s.store.getState().contests[0].scores).toEqual([4]);
 expect(await s.api.claimGuestHistory('account')).toBe(0);expect(s.uploads()).toBe(1);expect(s.rows.size).toBe(2);
});
test('failed upload retains source and pins the target so another account cannot claim on retry',async()=>{
 const s=setup();await s.api.stageGuestHistory();s.fail();await expect(s.api.claimGuestHistory('account')).rejects.toThrow('offline');
 expect(s.pending.size).toBe(1);await expect(s.api.claimGuestHistory('other')).rejects.toThrow('another account');expect(s.uploads()).toBe(1);
});
test('late identity switch cannot restore account history into the next account',async()=>{
 const s=setup();await s.api.stageGuestHistory();s.setOwner('other');await expect(s.api.claimGuestHistory('account')).rejects.toThrow('Identity changed');
 expect(s.store.getState().contests[0].scores).toEqual([3]);expect(s.pending.size).toBe(1);
});

function handoffService(enabled=true) {
 let session={user:{id:'guest',is_anonymous:true}}, entries=[], replay=0, prepared=0, claimed=0;
 const storage={getItem:async()=>null};
 const api=load('src/services/account-handoff.ts',{
  '@react-native-async-storage/async-storage':{default:storage},
  'expo-crypto':{randomUUID:()=> 'random'},
  zustand:{create:factory=>{let state=factory();return {setState:patch=>Object.assign(state,patch),getState:()=>state}}},
  '../db/supabase':{supabase:{auth:{getSession:async()=>({data:{session},error:null})}}},
  './cross-device':{onlineEnabled:enabled,replayOnlineScores:async()=>{replay++},onlineQueue:async()=>({entries}),client:{discover:async()=>{}}},
  './account-round-history':{stageGuestHistory:async()=>{},claimGuestHistory:async()=>0},
  '../stores/auth-store':{useAuthStore:{getState:()=>({isAnonymous:true})}},
  './account-merge':{...logic,accountHandoff:()=>({prepare:async()=>{prepared++},claim:async()=>{claimed++;return {transferred:1,conflicts:0}}})},
 });
 return {api,block:()=>{entries=[{state:'conflict'}]},signIn:()=>{session={user:{id:'account',is_anonymous:false}}},counts:()=>({replay,prepared,claimed})};
}
test('sign-in preparation drains guest identity and refuses unresolved scores before making a capability',async()=>{
 const s=handoffService();s.block();await expect(s.api.prepareAccountHandoff()).rejects.toThrow('queued guest scores');
 expect(s.counts()).toEqual({replay:1,prepared:0,claimed:0});
});
test('handoff service is inert with flag off and finishes under signed account after guest preparation',async()=>{
 const off=handoffService(false);await off.api.prepareAccountHandoff();await off.api.finishAccountHandoff();
 expect(off.counts()).toEqual({replay:0,prepared:0,claimed:0});
 const s=handoffService();await s.api.prepareAccountHandoff();s.signIn();await s.api.finishAccountHandoff();
 expect(s.counts()).toEqual({replay:1,prepared:1,claimed:1});
});
