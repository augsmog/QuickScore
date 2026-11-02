const fs=require('fs'),path=require('path'),ts=require('typescript');
function load(file,deps={},cache=new Map()) {
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(id=>id in deps?deps[id]:id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts'),deps,cache):require(id),m,m.exports);cache.set(file,m.exports);return m.exports;
}
const keys=load('src/stores/persisted-keys.ts');
const marks=load('src/stores/settlement-marks.ts',{'./persisted-keys':keys});
const engine=load('src/engine/contest-results.ts');
const {UnsupportedScorecardCharactersError,buildScorecardPdf}=load('src/services/scorecard-pdf.ts');
const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
const tick=()=>new Promise(r=>setImmediate(r));
const stamp='2026-11-01T20:03:00.000Z';
const fixture=()=>({id:'c',name:'Round',createdAt:'2026-11-01',status:'completed',course:{name:'Course',holes:Array.from({length:9},(_,i)=>({num:i+1,par:4,hcp:i+1}))},groups:[{id:'g',players:[{id:'a',name:'A',scores:Array(9).fill(3),handicap:0},{id:'b',name:'B',scores:Array(9).fill(4),handicap:0}]}],games:['stroke_play','skins'],betUnit:.01,gameConfig:{rulesVersion:1}});
function screen(store,c=fixture(),pdf={}) {
 const refs=[],states=[],effects=[],authListeners=new Set(),contestListeners=new Set();let refIndex=0,stateIndex=0,effectIndex=0;
 const react={
  useState:initial=>{const i=stateIndex++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},
  useRef:v=>refs[refIndex++]??(refs[refIndex-1]={current:v}),
  useEffect:(fn,deps)=>{const i=effectIndex++,old=effects[i];if(!old||!deps||deps.some((value,j)=>!Object.is(value,old.deps?.[j]))){old?.cleanup?.();effects[i]={deps,cleanup:fn()};}}
 };
 const state={contest:c,auth:{user:{id:'a'},isAnonymous:false,isInitialized:true,isLoading:false},tier:'pro'};
 const deps={react,zustand:{useStore:(s,f)=>f(s.getState())},'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',ScrollView:'ScrollView',Pressable:'Pressable',Share:{}},'expo-router':{useRouter:()=>({}),useLocalSearchParams:()=>({id:state.contest.id})},'lucide-react-native':{},'expo-haptics':{impactAsync:()=>{},ImpactFeedbackStyle:{Light:'light'}}};
 const extras={'services/purchases':{},'services/paywall-plans':{},'services/scorecard-pdf-font':{loadScorecardPdfFont:pdf.font},'services/scorecard-pdf':{buildScorecardPdf:pdf.build,UnsupportedScorecardCharactersError},'services/share-scorecard-pdf':{shareScorecardPdf:pdf.share},'engine/contest-results':engine,'engine/calculators/skins':load('src/engine/calculators/skins.ts'),'stores/scan-store':{useScanStore:f=>f({tier:state.tier})},'stores/auth-store':{useAuthStore:Object.assign(f=>f(state.auth),{getState:()=>state.auth,subscribe:fn=>{authListeners.add(fn);return()=>authListeners.delete(fn);}})},'stores/contest-store':{useContestStore:Object.assign(f=>f({contests:[state.contest]}),{getState:()=>({contests:[state.contest]}),subscribe:fn=>{contestListeners.add(fn);return()=>contestListeners.delete(fn);}})},'stores/settlement-store':{settlementMarks:store},'stores/settlement-marks':marks,'services/entitlements':{canSeeSettlement:t=>t!=='free'},'ui/recap/RecapCard':{},'ui/recap/model':{buildRecapModel:()=>({})},'ui/LiveShare':{},'ui/copy':{settlementLeader:n=>n},'ui/theme':{COLORS:{},FONTS:{},TYPOGRAPHY:{},RADII:{}}};
 for(const [key,v]of Object.entries(extras))deps['../../../src/'+key]=v;
 const Screen=load('app/contest/[id]/settlement.tsx',deps).default;return {state,subscriptionCounts:()=>[authListeners.size,contestListeners.size],render:()=>{refIndex=0;stateIndex=0;effectIndex=0;return Screen();},unmount:()=>effects.forEach(effect=>effect.cleanup?.()),
 updateAuth:patch=>{const old=state.auth;state.auth={...old,...patch};authListeners.forEach(fn=>fn(state.auth,old));},
 updateContest:next=>{const old={contests:[state.contest]};state.contest=next;contestListeners.forEach(fn=>fn({contests:[next]},old));}};
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

const exportButton=tree=>nodes(tree).find(n=>n.type==='Pressable'&&text(n).includes('Export scorecard'));
test('PDF export serializes font/build/sheet and passes real per-hole cells, then allows retry',async()=>{
 let release;const pdf={font:jest.fn(()=>new Promise(r=>release=r)),build:jest.fn(async()=>Uint8Array.from([37,80,68,70])),share:jest.fn(async()=>{})};const s=screen(await start(),fixture(),pdf),tree=s.render();const first=exportButton(tree).props.onPress();await exportButton(tree).props.onPress();expect(pdf.font).toHaveBeenCalledTimes(1);release(new Uint8Array([1]));await first;expect(pdf.build).toHaveBeenCalledTimes(1);const flattened=pdf.build.mock.calls[0][0].flatMap(line=>line?.block??[line]);expect(flattened).toContainEqual({cells:['1','2','3','4','5','6','7','8','9']});expect(flattened).toContainEqual({cells:Array(9).fill('3')});expect(pdf.share).toHaveBeenCalledTimes(1);
 pdf.font.mockResolvedValue(new Uint8Array([1]));await exportButton(s.render()).props.onPress();expect(pdf.share).toHaveBeenCalledTimes(2);
});
test.each(['account','contest'])('PDF does not open a stale share sheet after %s changes during font loading',async mode=>{
 let release;const pdf={font:()=>new Promise(r=>release=r),build:async()=>new Uint8Array([1]),share:jest.fn()};const s=screen(await start(),fixture(),pdf);const first=exportButton(s.render()).props.onPress();if(mode==='account')s.state.auth.user={id:'other'};else s.state.contest={...s.state.contest,name:'Changed round'};s.render();release(new Uint8Array([1]));await first;expect(pdf.share).not.toHaveBeenCalled();
});
test('PDF passes a live context predicate to the native sharing boundary',async()=>{
 let release;const pdf={font:async()=>new Uint8Array([1]),build:async()=>new Uint8Array([1]),share:jest.fn((bytes,isCurrent)=>new Promise(r=>release=()=>{expect(isCurrent()).toBe(false);r();}))};const s=screen(await start(),fixture(),pdf);const pending=exportButton(s.render()).props.onPress();await tick();expect(pdf.share).toHaveBeenCalledTimes(1);expect(pdf.share.mock.calls[0][1]()).toBe(true);s.state.auth.user={id:'different-account'};s.render();release();await pending;
});

test.each(['account','contest'])('PDF context sees %s store changes even before React rerender',async mode=>{
 let release;const pdf={font:async()=>new Uint8Array([1]),build:async()=>new Uint8Array([1]),share:jest.fn((bytes,isCurrent)=>new Promise(r=>release=()=>{expect(isCurrent()).toBe(false);r();}))};const s=screen(await start(),fixture(),pdf);const pending=exportButton(s.render()).props.onPress();await tick();expect(pdf.share.mock.calls[0][1]()).toBe(true);if(mode==='account')s.state.auth.user={id:'different-account'};else s.state.contest={...s.state.contest,name:'Changed'};release();await pending;
});

const glyphMessage='Some characters in this scorecard aren’t supported in PDF export yet.';
const errorPanel=tree=>nodes(tree).find(n=>n.props?.testID==='pdf-export-character-error');
test('typed unsupported-glyph rejection shows exact approved copy and dismisses with existing OK',async()=>{
 const pdf={font:async()=>new Uint8Array([1]),build:jest.fn(async()=>{throw new UnsupportedScorecardCharactersError();}),share:jest.fn()};const s=screen(await start(),fixture(),pdf),logs=jest.spyOn(console,'error').mockImplementation(()=>{});
 try{await exportButton(s.render()).props.onPress();const panel=errorPanel(s.render());expect(panel.props.accessibilityRole).toBe('alert');expect(panel.props.accessibilityLiveRegion).toBe('polite');expect(text(panel)).toBe('Export scorecard (PDF)'+glyphMessage+'OK');expect(pdf.share).not.toHaveBeenCalled();expect(logs).not.toHaveBeenCalled();nodes(panel).find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='OK').props.onPress();expect(errorPanel(s.render())).toBeUndefined();}finally{logs.mockRestore();}
});
test.each(['ordinary','spoofed-name'])('non-glyph %s errors never receive glyph copy or raw payload logging',async kind=>{
 const error=Error('PRIVATE player name and file:///private.pdf');if(kind==='spoofed-name')error.name='UnsupportedScorecardCharactersError';const pdf={font:async()=>new Uint8Array([1]),build:async()=>{throw error;},share:jest.fn()};const s=screen(await start(),fixture(),pdf),logs=jest.spyOn(console,'error').mockImplementation(()=>{});
 try{await exportButton(s.render()).props.onPress();expect(errorPanel(s.render())).toBeUndefined();expect(pdf.share).not.toHaveBeenCalled();expect(logs.mock.calls).toEqual([['PDF export failed']]);}finally{logs.mockRestore();}
});
test.each(['account','contest','unmount'])('late unsupported-glyph failure after %s change is suppressed',async mode=>{
 let reject;const pdf={font:async()=>new Uint8Array([1]),build:()=>new Promise((_,r)=>reject=r),share:jest.fn()};const s=screen(await start(),fixture(),pdf);const pending=exportButton(s.render()).props.onPress();await tick();if(mode==='account')s.state.auth.user={id:'new-account'};else if(mode==='contest')s.state.contest={...s.state.contest,name:'Changed'};else s.unmount();reject(new UnsupportedScorecardCharactersError());await pending;expect(errorPanel(s.render())).toBeUndefined();expect(pdf.share).not.toHaveBeenCalled();
});
test('next valid export clears prior glyph error and never claims share success',async()=>{
 const pdf={font:async()=>new Uint8Array([1]),build:jest.fn().mockRejectedValueOnce(new UnsupportedScorecardCharactersError()).mockResolvedValue(new Uint8Array([37,80,68,70])),share:jest.fn(async()=>{})};const s=screen(await start(),fixture(),pdf);await exportButton(s.render()).props.onPress();expect(errorPanel(s.render())).toBeDefined();await exportButton(s.render()).props.onPress();expect(errorPanel(s.render())).toBeUndefined();expect(pdf.share).toHaveBeenCalledTimes(1);expect(text(s.render())).not.toContain('success');
});
test('visible glyph error cannot reappear after an account round-trip',async()=>{
 const pdf={font:async()=>new Uint8Array([1]),build:async()=>{throw new UnsupportedScorecardCharactersError();},share:jest.fn()};const s=screen(await start(),fixture(),pdf);await exportButton(s.render()).props.onPress();expect(errorPanel(s.render())).toBeDefined();s.state.auth.user={id:'b'};expect(errorPanel(s.render())).toBeUndefined();s.state.auth.user={id:'a'};expect(errorPanel(s.render())).toBeUndefined();
});

test('real unsupported CJK builder rejection reaches approved screen error without sharing',async()=>{
 const c=fixture();c.groups[0].players[0].name='東京';const pdf={font:async()=>new Uint8Array(fs.readFileSync('assets/fonts/SourceSans3_400Regular.ttf')),build:buildScorecardPdf,share:jest.fn()};const s=screen(await start(),c,pdf);await exportButton(s.render()).props.onPress();expect(text(errorPanel(s.render()))).toContain(glyphMessage);expect(pdf.share).not.toHaveBeenCalled();
});

test.each(['account','contest'])('pending glyph rejection cannot survive rendered %s A-B-A transitions',async mode=>{
 let reject;const pdf={font:async()=>new Uint8Array([1]),build:()=>new Promise((_,r)=>reject=r),share:jest.fn()};const c=fixture(),s=screen(await start(),c,pdf);const pending=exportButton(s.render()).props.onPress();await tick();if(mode==='account')s.state.auth.user={id:'b'};else s.state.contest={...c,id:'other'};s.render();if(mode==='account')s.state.auth.user={id:'a'};else s.state.contest=c;s.render();reject(new UnsupportedScorecardCharactersError());await pending;expect(errorPanel(s.render())).toBeUndefined();expect(pdf.share).not.toHaveBeenCalled();
});
test.each(['account','contest'])('pending glyph rejection cannot survive store-only %s A-B-A transitions',async mode=>{
 let reject;const pdf={font:async()=>new Uint8Array([1]),build:()=>new Promise((_,r)=>reject=r),share:jest.fn()};const c=fixture(),s=screen(await start(),c,pdf);const pending=exportButton(s.render()).props.onPress();await tick();if(mode==='account'){s.updateAuth({user:{id:'b'}});s.updateAuth({user:{id:'a'}});}else{s.updateContest({...c,name:'Temporary change'});s.updateContest(c);}reject(new UnsupportedScorecardCharactersError());await pending;expect(errorPanel(s.render())).toBeUndefined();expect(pdf.share).not.toHaveBeenCalled();
});
test('irrelevant store updates do not suppress a current glyph error',async()=>{
 let reject;const pdf={font:async()=>new Uint8Array([1]),build:()=>new Promise((_,r)=>reject=r),share:jest.fn()};const c=fixture(),s=screen(await start(),c,pdf);const pending=exportButton(s.render()).props.onPress();await tick();s.updateAuth({isLoading:false});s.updateContest(c);reject(new UnsupportedScorecardCharactersError());await pending;expect(errorPanel(s.render())).toBeDefined();
});

test('request generation also prevents old successful PDF dispatch after store-only account ABA',async()=>{
 let resolve;const pdf={font:async()=>new Uint8Array([1]),build:()=>new Promise(r=>resolve=r),share:jest.fn()};const s=screen(await start(),fixture(),pdf);const pending=exportButton(s.render()).props.onPress();await tick();s.updateAuth({user:{id:'b'}});s.updateAuth({user:{id:'a'}});resolve(new Uint8Array([37,80,68,70]));await pending;expect(pdf.share).not.toHaveBeenCalled();expect(errorPanel(s.render())).toBeUndefined();
});
test('PDF context subscriptions release on unmount and stay single across route changes',async()=>{
 const s=screen(await start());s.render();expect(s.subscriptionCounts()).toEqual([1,1]);s.state.contest={...s.state.contest,id:'other'};s.render();expect(s.subscriptionCounts()).toEqual([1,1]);s.unmount();expect(s.subscriptionCounts()).toEqual([0,0]);
});
