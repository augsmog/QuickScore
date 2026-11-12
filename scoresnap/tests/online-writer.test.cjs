const fs=require('fs'),ts=require('typescript');
const load=(p,deps)=>{const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n)},m,m.exports);return m.exports;};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(){
 const held=deferred(),started=deferred(),order=[],storage=new Map();let uuid=0,version=0;
 const locks={request:jest.fn(async(name,work)=>{expect(name).toBe('snapscore-online-outbox');return work();})};
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks}});
 const session={user:{id:'actor'}};
 const rpc=async(name,args)=>{if(name==='write_score'){order.push(args.strokes);version++;if(args.strokes===1){started.resolve();await held.promise;}return {data:{status:'accepted',version,revision:version,strokes:args.strokes}};}return {data:{}};};
 const deps={'../stores/persisted-keys':{persistGate:{}},'./tournament-completion':{tournamentCompletion:()=>({})},'./sync-v1':{loadSyncCapability:async()=>({})},'./online-client':{onlineClient:()=>({}),foregroundRetry:()=>()=>{}},'react-native':{Platform:{OS:'web'}},'expo-crypto':{randomUUID:()=>String(++uuid)},'../db/supabase':{supabase:{auth:{getSession:async()=>({data:{session}})},rpc}},'../db/outbox-storage':{outboxStorage:{getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v),clear:async()=>storage.clear()}},'../config/features':{CROSS_DEVICE_SHARING_ENABLED:true},'../config/auth':{REAL_AUTH_CONFIGURED:true},'./captcha':{},'./score-outbox':load('src/services/score-outbox.ts',{}),'../stores/online-store':{useOnlineStore:{getState:()=>({events:{}})}}};
 const service=load('src/services/cross-device.ts',deps);
 const save=n=>service.queueOnlineScore({contest_id:'c',round_id:'r',player_id:'p',hole:1,action:'set',strokes:n},0);
 return {service,save,held,started,order,locks,restore:()=>{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}};
}
test('save waits behind replay; rapid saves are sent in call order exactly once',async()=>{
 const x=setup();try{await x.save(1);const replay=x.service.replayOnlineScores();await x.started.promise;
 let done=false;const saves=Promise.all([2,3,4,5].map(x.save)).then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);
 x.held.resolve();await replay;await saves;await x.service.replayOnlineScores();await x.service.replayOnlineScores();expect(x.order).toEqual([1,2,3,4,5]);expect((await x.service.onlineQueue()).entries).toEqual([]);
 }finally{x.held.resolve();x.restore();}
});
test('reset aborts a writer queued behind a held replay and clears the queue',async()=>{
 const x=setup();try{await x.save(1);const replay=x.service.replayOnlineScores();await x.started.promise;const pending=x.save(2);const rejected=expect(pending).rejects.toThrow('Account reset');const reset=x.service.resetOnlineQueues();x.held.resolve();await Promise.all([replay,rejected,reset]);expect(x.order).toEqual([1]);expect((await x.service.onlineQueue()).entries).toEqual([]);}finally{x.held.resolve();x.restore();}
});
test('missing Web Locks fails closed; subsequent writer recovers',async()=>{
 const x=setup();try{delete globalThis.navigator.locks;await expect(x.save(2)).rejects.toThrow('cannot safely queue');globalThis.navigator.locks=x.locks;await x.save(3);expect((await x.service.onlineQueue()).entries).toHaveLength(1);}finally{x.restore();}
});
test('reset while waiting for another tab rejects after lock acquisition without enqueuing',async()=>{
 const x=setup(),external=deferred(),requested=deferred();try{x.locks.request.mockImplementation(async(name,work)=>{requested.resolve();await external.promise;return work();});const save=x.save(2);const rejection=expect(save).rejects.toThrow('Account reset');await requested.promise;const reset=x.service.resetOnlineQueues();external.resolve();await Promise.all([rejection,reset]);expect(x.order).toEqual([]);expect((await x.service.onlineQueue()).entries).toEqual([]);}finally{external.resolve();x.restore();}
});
