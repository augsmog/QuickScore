const fs=require('fs'),path=require('path'),ts=require('typescript');
function load(file,deps={},cache=new Map()) {
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(id=>id in deps?deps[id]:id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts'),deps,cache):require(id),m,m.exports);cache.set(file,m.exports);return m.exports;
}
const keys=load('src/stores/persisted-keys.ts');
const marks=load('src/stores/settlement-marks.ts',{'./persisted-keys':keys});
const engine=load('src/engine/contest-results.ts');
const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
const tick=()=>new Promise(r=>setImmediate(r));
const stamp='2026-11-01T20:03:00.000Z';
const fixture=()=>({id:'c',name:'Round',status:'completed',course:{name:'Course',holes:Array.from({length:9},(_,i)=>({num:i+1,par:4,hcp:i+1}))},groups:[{id:'g',players:[{id:'a',name:'A',scores:Array(9).fill(3),handicap:0},{id:'b',name:'B',scores:Array(9).fill(4),handicap:0}]}],games:['stroke_play','skins'],betUnit:.01,gameConfig:{rulesVersion:1}});
function screen(store,c=fixture()) {
 const state={contest:c,auth:{user:{id:'a'},isAnonymous:false,isInitialized:true,isLoading:false},tier:'pro'};
 const deps={react:{useState:v=>[v,()=>{}],useEffect:()=>{}},zustand:{useStore:(s,f)=>f(s.getState())},'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',ScrollView:'ScrollView',Pressable:'Pressable',Share:{}},'expo-router':{useRouter:()=>({}),useLocalSearchParams:()=>({id:state.contest.id})},'lucide-react-native':{},'expo-haptics':{impactAsync:()=>{},ImpactFeedbackStyle:{Light:'light'}}};
 const extras={'services/purchases':{},'services/paywall-plans':{},'services/scorecard-pdf':{},'services/share-scorecard-pdf':{},'engine/contest-results':engine,'engine/calculators/skins':load('src/engine/calculators/skins.ts'),'stores/scan-store':{useScanStore:f=>f({tier:state.tier})},'stores/auth-store':{useAuthStore:f=>f(state.auth)},'stores/contest-store':{useContestStore:f=>f({contests:[state.contest]})},'stores/settlement-store':{settlementMarks:store},'stores/settlement-marks':marks,'services/entitlements':{canSeeSettlement:t=>t!=='free'},'ui/recap/RecapCard':{},'ui/recap/model':{buildRecapModel:()=>({})},'ui/LiveShare':{},'ui/copy':{settlementLeader:n=>n},'ui/theme':{COLORS:{},FONTS:{},TYPOGRAPHY:{},RADII:{}}};
 for(const [key,v]of Object.entries(extras))deps['../../../src/'+key]=v;
 const Screen=load('app/contest/[id]/settlement.tsx',deps).default;return {state,render:()=>Screen()};
}
const buttons=tree=>nodes(tree).filter(n=>n.type==='Pressable'&&/^(Mark settled|Unsettle) /.test(n.props.accessibilityLabel??''));
async function start(memory=keys.createMemoryStorage()){const s=marks.createSettlementMarks(memory,()=>stamp);await tick();return s;}
afterEach(()=>{keys.persistGate.suppressed=false;});
test('integrated screen stores ISO, retains approved timestamp/undo across remount and restart, and by-game is read-only',async()=>{
 const memory=keys.createMemoryStorage(),store=await start(memory),s=screen(store),before=s.render();
 const cards=nodes(before).filter(n=>/^settlement-game-\d+$/.test(n.props?.testID??''));expect(cards.length).toBe(2);for(const card of cards)expect(nodes(card).filter(n=>n.type==='Pressable')).toHaveLength(0);
 buttons(before)[0].props.onPress();await store.flush();const label='Settled '+new Date(stamp).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 expect(text(screen(store).render())).toContain(label);const restarted=await start(memory),r=screen(restarted);expect(text(r.render())).toContain(label);expect(buttons(r.render())[0].props.accessibilityLabel).toMatch(/^Unsettle /);
 buttons(r.render())[0].props.onPress();await restarted.flush();expect(text(screen(await start(memory)).render())).not.toContain(label);
});
test('account/contest switch cannot display another ledger; recalculation and edit-revert remove marks',async()=>{
 const store=await start(),s=screen(store);buttons(s.render())[0].props.onPress();expect(buttons(s.render())[0].props.accessibilityLabel).toMatch(/^Unsettle /);
 s.state.auth.user={id:'b'};expect(buttons(s.render())[0].props.accessibilityLabel).toMatch(/^Mark settled /);s.state.auth.user={id:'a'};
 s.state.contest={...s.state.contest,id:'other'};expect(buttons(s.render())[0].props.accessibilityLabel).toMatch(/^Mark settled /);s.state.contest=fixture();
 const original=s.state.contest;s.state.contest={...original,betUnit:2};expect(buttons(s.render())[0].props.accessibilityLabel).toMatch(/^Mark settled /);store.getState().reconcile([s.state.contest]);s.state.contest=original;expect(buttons(s.render())[0].props.accessibilityLabel).toMatch(/^Mark settled /);
});
test('pending aggregate hides all acknowledgement/export/share controls but retains scoped game cards',async()=>{
 const c=fixture();c.games.push('snake');const s=screen(await start(),c),tree=s.render();expect(nodes(tree).some(n=>n.props?.testID==='settlement-pending')).toBe(true);expect(buttons(tree)).toHaveLength(0);expect(text(tree)).not.toMatch(/Share results|Export scorecard|Recap card|WHO OWES WHAT/);expect(nodes(tree).some(n=>n.props?.testID==='settlement-game-0')).toBe(true);
});
test('hydration and missing durable account disable acknowledgement; wipe suppresses taps',async()=>{
 let release;const store=marks.createSettlementMarks({getItem:()=>new Promise(r=>{release=r}),setItem:async()=>{},removeItem:async()=>{}}),s=screen(store);
 expect(buttons(s.render())[0].props.disabled).toBe(true);release(null);await tick();expect(buttons(s.render())[0].props.disabled).toBe(false);
 s.state.auth.user=null;expect(buttons(s.render())[0].props.disabled).toBe(true);s.state.auth.user={id:'a'};keys.persistGate.suppressed=true;buttons(s.render())[0].props.onPress();expect(store.getState().ledgers).toEqual({});
});
