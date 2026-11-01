const fs = require('fs'), ts = require('typescript');
function load(p, deps = {}) { const m = { exports: {} }; new Function('require','module','exports',ts.transpileModule(fs.readFileSync(p,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(n => n in deps ? deps[n] : require(n), m, m.exports); return m.exports; }
const keys = load('src/stores/persisted-keys.ts');
const { createSettlementMarks, settlementRevision: revision, settlementScope: scope, settlementTransactionKeys: identities } = load('src/stores/settlement-marks.ts', {'./persisted-keys':keys});
const tick = () => new Promise(r => setImmediate(r));
const stamp = '2026-11-01T20:00:00.000Z';
const contest = () => ({id:'c',name:'Round',course:{name:'Course',holes:[]},groups:[{id:'g',name:'Group',players:[{id:'p',name:'A',scores:[4]}]}],games:['stroke_play'],betUnit:1,gameConfig:{rulesVersion:1}});
const tx = {from:'A',to:'B',gameType:'stroke_play',amount:1.01};
const key = identities([tx])[0];
const mark = (s,c=contest(),account='a',k=key) => s.getState().toggle(scope(account,c.id),c.id,revision(c),k);
const ledger = (s,account='a',c='c') => s.getState().ledgers[scope(account,c)];
async function start(storage=keys.createMemoryStorage()) { const store=createSettlementMarks(storage,()=>stamp); await tick(); await store.flush(); return store; }
afterEach(() => { keys.persistGate.suppressed=false; });
test('timestamp survives subscriber unmount/remount and fresh-store restart; undo stays undone',async()=>{
 const storage=keys.createMemoryStorage(),s=await start(storage); const unsubscribe=s.subscribe(()=>{}); mark(s); unsubscribe(); await s.flush();
 expect(ledger(s).marks[key]).toBe(stamp); const restarted=await start(storage); expect(ledger(restarted).marks[key]).toBe(stamp);
 mark(restarted); await restarted.flush(); const afterUndo=await start(storage); expect(ledger(afterUndo).marks).toEqual({});
});
test('account and contest identities isolate equal transactions',async()=>{const s=await start();mark(s);mark(s,{...contest(),id:'d'});expect(ledger(s,'b')).toBeUndefined();expect(ledger(s,'a','d').marks[key]).toBe(stamp);});
test('transaction identity survives row reorder, separates equal rows, exact amounts, direction and game',()=>{
 const other={...tx,to:'C'};expect(identities([tx,other])[0]).toBe(identities([other,tx])[1]);expect(new Set(identities([tx,tx])).size).toBe(2);
 for(const altered of [{...tx,amount:1.010001},{...tx,from:'B',to:'A'},{...tx,gameType:'skins'}])expect(identities([altered])[0]).not.toBe(key);
});
test('edit then reversal and deletion prune marks while ledger is unmounted',async()=>{const s=await start(),c=contest();mark(s,c);s.getState().reconcile([{...c,betUnit:2}]);s.getState().reconcile([c]);expect(ledger(s)).toBeUndefined();mark(s,c);s.getState().reconcile([]);expect(ledger(s)).toBeUndefined();});
test('tournament revision includes all round sources but excludes currentRound, tab and share metadata',()=>{
 const c={...contest(),isTournament:true,rounds:[{id:'r1',number:1,groups:contest().groups},{id:'r2',number:2,groups:contest().groups}],currentRound:1};
 expect(revision({...c,currentRound:2,liveShareEnabled:true,name:'Renamed'})).toBe(revision(c));
 for(const patch of [{groups:[{...contest().groups[0],players:[]}]},{course:{name:'Other'}},{id:'r3'}])expect(revision({...c,rounds:[c.rounds[0],{...c.rounds[1],...patch}]})).not.toBe(revision(c));
});
test('legacy uses effective groups, not inactive rounds',()=>{const c={...contest(),gameConfig:undefined};expect(revision({...c,rounds:[{id:'unused'}]})).toBe(revision(c));expect(revision({...c,groups:[]})).not.toBe(revision(c));});
test('canonical object order is irrelevant, score/event/config changes invalidate',()=>{const c=contest();expect(revision({...c,course:{holes:[],name:'Course'}})).toBe(revision(c));for(const patch of [{groups:[]},{auxiliaryByScope:{g:{snake:[]}}},{gameConfig:{rulesVersion:1,skinsScope:'field'}}])expect(revision({...c,...patch})).not.toBe(revision(c));});
test('delayed hydration blocks taps, reset prevents old records resurrecting',async()=>{
 const storage=keys.createMemoryStorage(),seed=await start(storage);mark(seed);await seed.flush();const raw=await storage.getItem(keys.SETTLEMENT_STORAGE_KEY);let release;
 const delayed={...storage,getItem:()=>new Promise(r=>{release=()=>r(raw)})};const s=createSettlementMarks(delayed,()=>stamp);mark(s);expect(ledger(s)).toBeUndefined();s.getState().reset();release();await tick();await s.flush();expect(s.getState().ready).toBe(true);expect(s.getState().ledgers).toEqual({});
});
test('delayed writes are ordered; deletion drains before removal and suppressed reset cannot recreate key',async()=>{
 const memory=keys.createMemoryStorage();let release;let delay=false;const storage={...memory,setItem:(k,v)=>delay?new Promise(r=>{release=async()=>{await memory.setItem(k,v);r()}}):memory.setItem(k,v)};
 const s=await start(storage);delay=true;mark(s);await tick();keys.persistGate.suppressed=true;s.getState().reset();let drained=false;const flush=s.flush().then(()=>{drained=true});await tick();expect(drained).toBe(false);delay=false;await release();await flush;await memory.removeItem(keys.SETTLEMENT_STORAGE_KEY);await tick();expect(memory.snapshot()).toEqual({});expect(s.getState().ledgers).toEqual({});
});
test('storage rejection is contained and a later successful write recovers',async()=>{
 const memory=keys.createMemoryStorage();let fail=false;const s=await start({...memory,setItem:(k,v)=>fail?Promise.reject(Error('disk full')):memory.setItem(k,v)});const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});fail=true;mark(s);await tick();await s.flush();expect(warn).toHaveBeenCalled();fail=false;mark(s);mark(s);await s.flush();expect(ledger(await start(memory)).marks[key]).toBe(stamp);warn.mockRestore();
});
test('malformed records and invalid timestamps never become paid marks',async()=>{const memory=keys.createMemoryStorage();await memory.setItem(keys.SETTLEMENT_STORAGE_KEY,JSON.stringify({version:1,state:{ledgers:{bad:7,[scope('a','c')]:{contestId:'c',revision:revision(contest()),marks:{bad:'not a date',[key]:stamp}}}}}));const s=await start(memory);expect(s.getState().ledgers.bad).toBeUndefined();expect(ledger(s).marks).toEqual({[key]:stamp});});
test('registered deletion key and mounted-independent reconciliation wiring',()=>{expect(keys.PERSISTED_ACCOUNT_KEYS).toContain(keys.SETTLEMENT_STORAGE_KEY);const source=fs.readFileSync('src/stores/settlement-store.ts','utf8');expect(source).toContain('useContestStore.subscribe');expect(source).toContain('useContestStore.persist.hasHydrated()');expect(source.match(/onFinishHydration\(reconcile\)/g)).toHaveLength(2);const wipe=fs.readFileSync('src/stores/wipe-local-account.ts','utf8');expect(wipe.indexOf('await settlementMarks.flush()')).toBeLessThan(wipe.indexOf('await AsyncStorage.multiRemove'));});
test('real singleton subscriptions wait for contest hydration and prune edits while view is absent',async()=>{
 const memory=keys.createMemoryStorage(),seed=await start(memory);mark(seed);await seed.flush();
 let contests=[],hydrated=false;const listeners=[],finish=[];
 const useContestStore={getState:()=>({contests}),subscribe:fn=>listeners.push(fn),persist:{hasHydrated:()=>hydrated,onFinishHydration:fn=>finish.push(fn)}};
 const {settlementMarks:s}=load('src/stores/settlement-store.ts',{'@react-native-async-storage/async-storage':{default:memory},'./contest-store':{useContestStore},'./settlement-marks':{createSettlementMarks}});
 await tick();expect(ledger(s).marks[key]).toBe(stamp); // Empty, unhydrated contest store must not prune.
 contests=[contest()];hydrated=true;finish.forEach(fn=>fn());expect(ledger(s).marks[key]).toBe(stamp);
 const previous=contests;contests=[{...contest(),betUnit:2}];listeners.forEach(fn=>fn({contests},{contests:previous}));expect(ledger(s)).toBeUndefined();
 contests=[contest()];listeners.forEach(fn=>fn({contests},{contests:previous}));await s.flush();expect(ledger(await start(memory))).toBeUndefined();
});
test('wipe during delayed hydration does not recreate storage after suppression ends',async()=>{
 const memory=keys.createMemoryStorage(),seed=await start(memory);mark(seed);await seed.flush();const raw=await memory.getItem(keys.SETTLEMENT_STORAGE_KEY);let release;
 const s=createSettlementMarks({...memory,getItem:()=>new Promise(r=>{release=()=>r(raw)})});keys.persistGate.suppressed=true;s.getState().reset();await s.flush();await memory.removeItem(keys.SETTLEMENT_STORAGE_KEY);keys.persistGate.suppressed=false;release();await tick();await s.flush();expect(s.getState().ready).toBe(true);expect(s.getState().ledgers).toEqual({});expect(memory.snapshot()).toEqual({});
});
test('edits A to B to A during delayed marker hydration cannot resurrect acknowledgement',async()=>{
 const memory=keys.createMemoryStorage(),seed=await start(memory);mark(seed);await seed.flush();const raw=await memory.getItem(keys.SETTLEMENT_STORAGE_KEY);let release;const listeners=[];let contests=[contest()];
 const useContestStore={getState:()=>({contests}),subscribe:fn=>listeners.push(fn),persist:{hasHydrated:()=>true,onFinishHydration:()=>{}}};
 const {settlementMarks:s}=load('src/stores/settlement-store.ts',{'@react-native-async-storage/async-storage':{default:{...memory,getItem:()=>new Promise(r=>{release=()=>r(raw)})}},'./contest-store':{useContestStore},'./settlement-marks':{createSettlementMarks}});
 for(const next of [[{...contest(),betUnit:2}],[contest()]]) {const previous=contests;contests=next;listeners.forEach(fn=>fn({contests},{contests:previous}));}
 release();await tick();await s.flush();expect(ledger(s)).toBeUndefined();expect(ledger(await start(memory))).toBeUndefined();
});
test('a tap during account wipe cannot repopulate in-memory acknowledgements',async()=>{const s=await start();mark(s);keys.persistGate.suppressed=true;s.getState().reset();mark(s);expect(s.getState().ledgers).toEqual({});});
