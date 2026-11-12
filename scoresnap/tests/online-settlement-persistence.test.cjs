const fs=require('fs'),ts=require('typescript');
function load(p,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n)},m,m.exports);return m.exports;}
const {scoreOutbox}=load('src/services/score-outbox.ts');
const {overlayScorecard}=load('src/services/scorecard-overlay.ts');
const key='["c","p",1]',draft={contest_id:'c',round_id:'c',player_id:'p',hole:1,action:'set',strokes:5};
const contest={id:'c',groups:[{id:'g',players:[{id:'p',scores:[5]}]}],onlineEdits:{[key]:{token:'token',strokes:5}}};
const snapshot={protocol:1,contest_id:'c',id_map:[],rounds:[{id:'c',players:[{id:'p',cells:[{hole:1,strokes:7}]}]}]};
const tick=()=>new Promise(r=>setImmediate(r));
function storage(){let raw=JSON.stringify({state:{contests:[contest],activeContestId:null},version:0});return {
 mode:'normal',delayRead:false,pending:[],reads:[],get raw(){return raw;},
 getItem(){return this.delayRead?new Promise(r=>this.reads.push(()=>r(raw))):Promise.resolve(raw);},
 setItem(k,v){if(this.mode==='fail')return Promise.reject(Error('disk failed'));if(this.mode==='delay')return new Promise(r=>this.pending.push(()=>{raw=v;r();}));raw=v;return Promise.resolve();},removeItem:async()=>{},
};}
function store(backing){return load('src/stores/contest-store.ts',{
 './online-store':{useOnlineStore:{getState:()=>({events:{}})}},'../services/ocr-review':{},'../config/auth':{REAL_AUTH_CONFIGURED:true},'./auth-store':{},'../services/guest-join':{},
 zustand:require('zustand'),'zustand/middleware':require('zustand/middleware'),'@react-native-async-storage/async-storage':{default:backing},'./persisted-keys':load('src/stores/persisted-keys.ts'),'../services/tournament-sync':{},'expo-crypto':{randomUUID:()=> 'uuid'},
});}
const settle=svc=>(entries,retained)=>svc.applyOnlineSettlement(entries.map(e=>({contestId:e.draft.contest_id,token:e.localEdit})),retained&&{contestId:'c',key,token:retained.localEdit,strokes:retained.draft.strokes});
const displayed=svc=>overlayScorecard(svc.useContestStore.getState().contests[0],snapshot).groups[0].players[0].scores[0];
for(const choice of ['accepted','keep-current','use-mine'])for(const mode of ['delay','fail'])test(`${choice}: ${mode} persistence preserves recovery across restart`,async()=>{
 const backing=storage(),svc=store(backing);await tick();let raw=null,sends=0,accepted=choice==='accepted';
 const out={getItem:async()=>raw,setItem:async(k,v)=>{raw=v;}},send=async()=>{sends++;return {status:accepted?'accepted':'conflict',version:3,revision:1,strokes:7};};
 const box=scoreOutbox(out,'a',()=> 'op',send,settle(svc)),id=await box.enqueue(draft,0,'token',key);
 if(choice!=='accepted')await box.replay();backing.mode=mode;
 const work=choice==='accepted'?box.replay():box.resolve(id,choice,true);
 if(mode==='fail')await expect(work).rejects.toThrow('disk failed');else {await tick();expect(backing.pending).toHaveLength(1);}
 const recovery=JSON.parse(raw).settlement;expect(recovery).toBeDefined();expect(Object.values(JSON.parse(raw).versions)).toEqual([3]);
 expect(JSON.parse(backing.raw).state.contests[0].onlineEdits[key].token).toBe('token');
 backing.mode='normal';backing.delayRead=true;const restarted=store(backing);
 const restored=scoreOutbox(out,'a',()=> 'next',send,settle(restarted)),recover=restored.inspect();
 await tick();expect(JSON.parse(raw).settlement).toBeDefined();
 backing.reads.splice(0).forEach(f=>f());await recover;
 expect(displayed(restarted)).toBe(choice==='use-mine'?5:7);expect(JSON.parse(raw).settlement).toBeUndefined();
 expect(JSON.parse(backing.raw).state.contests[0].onlineEdits).toEqual(choice==='use-mine'?contest.onlineEdits:{});
 // Reapply the same durable record as after a crash between metadata commit and record removal.
 await settle(restarted)(recovery.removed,recovery.retained);expect(displayed(restarted)).toBe(choice==='use-mine'?5:7);expect(sends).toBe(1);
 if(mode==='delay'){backing.pending.shift()();await work;}
 if(choice==='use-mine'){
   accepted=true;await restored.replay();expect(displayed(restarted)).toBe(7);
   expect(JSON.parse(backing.raw).state.contests[0].onlineEdits).toEqual({});expect(sends).toBe(2);
 }
});

test('repeated settlement preserves a newer edit on the retained cell',async()=>{
 const backing=storage(),svc=store(backing);await tick();
 await svc.useContestStore.setState({contests:[{...contest,onlineEdits:{[key]:{token:'newer',strokes:6}}}]});
 const removed=[{contestId:'c',token:'token'}],retained={contestId:'c',key,token:'token',strokes:5};
 await svc.applyOnlineSettlement(removed,retained);await svc.applyOnlineSettlement(removed,retained);
 expect(svc.useContestStore.getState().contests[0].onlineEdits[key]).toEqual({token:'newer',strokes:6});
});
