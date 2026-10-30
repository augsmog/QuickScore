const fs=require('fs'),ts=require('typescript');
const read=p=>fs.readFileSync(p,'utf8');
function load(p,deps={}) {const m={exports:{}};new Function('require','module','exports',ts.transpileModule(read(p),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText)(id=>{if(id in deps)return deps[id];throw Error(id)},m,m.exports);return m.exports;}
const entitlement=()=>load('src/services/entitlements.ts');
test('1 TD implies Pro, active entitlements only',()=>{const e=entitlement();expect(e.tierFromCustomerInfo({entitlements:{active:{'SnapScore TD':{}}}})).toBe('td');expect(e.tierFromCustomerInfo({entitlements:{active:{'SnapScore Pro':{}}}})).toBe('pro');expect(e.tierFromCustomerInfo({entitlements:{active:{}}})).toBe('free');});
test('2 exactly four free games; premium addition gates preserve saved scores',()=>{const e=entitlement();expect(e.FREE_GAMES).toEqual(['stroke_play','match_play','stableford','best_ball']);for(const id of e.FREE_GAMES)expect(e.canUseGame(id,'free')).toBe(true);expect(e.canUseGame('skins','free')).toBe(false);expect(e.canUseGame('skins','pro')).toBe(true);for(const p of ['app/contest/new.tsx','app/contest/[id]/edit.tsx','app/(tabs)/index.tsx'])expect(read(p)).toContain('canUseGame');expect(read('app/contest/[id]/games.tsx')).toContain('Add games');});
test('3 settlement and stats gated',()=>{const e=entitlement();expect(e.canSeeSettlement('free')).toBe(false);expect(e.canSeeStats('td')).toBe(true);for(const p of ['app/statistics.tsx','app/contest/[id]/settlement.tsx'])expect(read(p)).toContain('PaywallTeaser');});
test('4 hosting shape gates only hosts',()=>{const e=entitlement();for(const tier of ['free','pro','td']){expect(e.canHostTournament({groups:[{}],rounds:[{}]},tier)).toBe(true);expect(e.canHostTournament({groups:[{},{}]},tier)).toBe(tier==='td');expect(e.canHostTournament({rounds:[{},{}]},tier)).toBe(tier==='td');}expect(read('app/contest/[id]/tournament-rounds.tsx')).toContain('canHostTournament');});
test('5 sharing remains free',()=>{expect(read('app/paywall.tsx')).not.toContain('Share & export results');for(const p of ['app/join/[code].tsx','app/r/[token].tsx'])expect(read(p)).not.toMatch(/canHostTournament|isPro|paywall/);});
test('6 monthly scans reset at local month boundary; paid unlimited',()=>{const e=entitlement();expect(e.scanAllowance('free',new Date(2026,9,31))).toEqual({limit:3,monthKey:'2026-10'});expect(e.scanAllowance('td',new Date()).limit).toBe(Infinity);const s=load('src/stores/scan-store.ts',{'../services/entitlements':e,zustand:require('zustand'),'zustand/middleware':{persist:f=>f,createJSONStorage:()=>({})},'@react-native-async-storage/async-storage':{}}).useScanStore;s.setState({scanMonth:'2026-09',scansUsed:99});expect(s.getState().getRemainingFreeScans()).toBe(3);for(let i=0;i<3;i++)expect(s.getState().useScan()).toBe(true);expect(s.getState().useScan()).toBe(false);});
test('7 cloud OCR rejects before file or network without explicit consent',async()=>{let consent=null;const invoke=jest.fn(),file=jest.fn();const cloud=load('src/services/claude-ocr.ts',{'../stores/settings-store':{useSettingsStore:{getState:()=>({ocrConsent:consent})}},'../stores/scan-store':{useScanStore:{getState:()=>({useScan:()=>true})}},'expo-file-system/legacy':{readAsStringAsync:file},'../db/supabase':{supabase:{functions:{invoke}}},'./ocr-review':{}});for(const choice of [null,false]){consent=choice;await expect(cloud.recognizeWithClaude('x')).rejects.toThrow(/consent/i);}expect(file).not.toHaveBeenCalled();expect(invoke).not.toHaveBeenCalled();expect(read('app/settings.tsx')).toContain('ocrConsent');expect(read('app/scan/index.tsx')).toContain('requestOCRConsent');});
test('8 two plans, four packages, eligibility and legal disclosures',()=>{const s=read('app/paywall.tsx')+read('src/services/paywall-plans.ts')+read('src/ui/paywall-copy.ts');for(const text of ['24.99','3.99','79.99','12.99','td_annual','td_monthly','checkTrialOrIntroductoryPriceEligibility','Apple Account','24 hours','Account Settings','PRIVACY_URL','TERMS_URL'])expect(s).toContain(text);expect(s).not.toMatch(/lifetime/i);});
test('9 product setup documented in service',()=>{const s=read('src/services/purchases.ts');for(const id of ['snapscore.pro.annual','snapscore.pro.monthly','snapscore.td.annual','snapscore.td.monthly','TD level 1','Pro level 2'])expect(s).toContain(id);});
const persistence={persist:f=>f,createJSONStorage:()=>({})};
function contestStore(){return load('src/stores/contest-store.ts',{
 '../services/ocr-review':load('src/services/ocr-review.ts'),'../config/auth':{REAL_AUTH_CONFIGURED:false},'./auth-store':{useAuthStore:{getState:()=>({})}},'../services/guest-join':{generateJoinCode:()=> 'ABC234'},zustand:require('zustand'),'zustand/middleware':persistence,'@react-native-async-storage/async-storage':{},'../services/tournament-sync':{syncScore:async()=>{}},
}).useContestStore;}
const fixture=()=>{const groups=[0,1].map(i=>({id:'g'+i,name:'Group '+i,players:[{id:'p'+i,name:'Guest '+i,handicap:0,scores:Array(18).fill(0)}]}));return {id:'c',name:'Tournament',status:'active',joinCode:'ABC234',course:{holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))},groups,games:['skins'],rounds:[1,2].map(n=>({id:'r'+n,number:n,groups})),isTournament:true,currentRound:2};};
test('free guest joins and scores multi-group multi-round tournament through actual services/store',async()=>{
 const e=entitlement(),c=fixture(),store=contestStore();expect(e.canHostTournament(c,'free')).toBe(false);
 const {localContestJoinService,bindGuest}=load('src/services/guest-join.ts');
 const joined=await localContestJoinService(()=>[c]).lookup('abc234');
 const identity=bindGuest({guestId:null,bindings:[]},joined,'p1','Sam',()=> 'guest');
 store.setState({contests:[c]});const b=identity.bindings[0];store.getState().updateScore(b.contestId,b.groupId,b.playerId,1,4);
 expect(store.getState().contests[0].rounds[1].groups[1].players[0].scores[0]).toBe(4);
 expect(store.getState().contests[0].games).toEqual(['skins']);
});
test('purchase, restore and sync derive and clear TD/Pro status',async()=>{
 let info={entitlements:{active:{'SnapScore TD':{}}}};const state={tier:'free',setTier:t=>{state.tier=t;}};
 const purchases={setLogLevel:()=>{},configure:()=>{},addCustomerInfoUpdateListener:()=>{},getCustomerInfo:async()=>info,purchasePackage:async()=>({customerInfo:info}),restorePurchases:async()=>info};
 const svc=load('src/services/purchases.ts',{'react-native':{Platform:{OS:'ios'},NativeModules:{RNPurchases:{}}},'@sentry/react-native':{},'react-native-purchases':{__esModule:true,default:purchases,LOG_LEVEL:{DEBUG:1},PURCHASES_ERROR_CODE:{}},'../stores/scan-store':{useScanStore:{getState:()=>state}},'./entitlements':entitlement()});
 global.__DEV__=false;const previous=process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY;process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY='test-only';
 try{await svc.initPurchases();expect(state.tier).toBe('td');expect(await svc.purchasePackage({})).toBe(true);expect(await svc.restorePurchases()).toBe(true);info={entitlements:{active:{'SnapScore Pro':{}}}};await svc.syncProStatus();expect(state.tier).toBe('pro');info={entitlements:{active:{}}};await svc.syncProStatus();expect(state.tier).toBe('free');}finally{if(previous===undefined)delete process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY;else process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY=previous;delete global.__DEV__;}
});
test('trial eligibility fails closed and never grants a second trial to ineligible products',async()=>{
 const check=jest.fn(async()=>({'pro-year':{status:2},'td-year':{status:1}}));
 const plans=load('src/services/paywall-plans.ts',{'../ui/paywall-copy':load('src/ui/paywall-copy.ts'),'react-native-purchases':{__esModule:true,default:{checkTrialOrIntroductoryPriceEligibility:check},INTRO_ELIGIBILITY_STATUS:{INTRO_ELIGIBILITY_STATUS_ELIGIBLE:2}}});
 const pkg=id=>({product:{identifier:id,introPrice:{price:0,periodUnit:'DAY',periodNumberOfUnits:7}}});
 expect(await plans.eligibleAnnualTrials({annual:pkg('pro-year'),td_annual:pkg('td-year')})).toEqual({'pro-year':true,'td-year':false});
 check.mockRejectedValueOnce(Error('offline'));expect(await plans.eligibleAnnualTrials({annual:pkg('pro-year')})).toEqual({});
});
test('OCR withdrawal while reading and exhausted allowance both block the edge call',async()=>{
 let consent=true,allowed=true;const invoke=jest.fn(),read=jest.fn(async()=>{consent=false;return 'photo';});
 const cloud=load('src/services/claude-ocr.ts',{'../stores/settings-store':{useSettingsStore:{getState:()=>({ocrConsent:consent})}},'../stores/scan-store':{useScanStore:{getState:()=>({useScan:()=>allowed})}},'expo-file-system/legacy':{readAsStringAsync:read,EncodingType:{Base64:1}},'../db/supabase':{supabase:{functions:{invoke}}},'./ocr-review':{}});
 await expect(cloud.recognizeWithClaude('x')).rejects.toThrow(/consent/);expect(invoke).not.toHaveBeenCalled();
 consent=true;allowed=false;read.mockResolvedValue('photo');await expect(cloud.recognizeWithClaude('x')).rejects.toThrow(/limit/);expect(invoke).not.toHaveBeenCalled();
});
function screenHarness(path,tier,contest=fixture()) {
 const e=entitlement(),theme=load('src/ui/theme.ts'),types=load('src/engine/types.ts',{'../services/entitlements':e});
 const push=jest.fn(),save=jest.fn(),states=[];let cursor=0;
 const react={useState:init=>{const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useMemo:f=>f(),useEffect:()=>{},useCallback:f=>f,useRef:()=>({})};
 const jsx=(type,props)=>({type,props});const deps={react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':new Proxy({Platform:{OS:'ios'}},{get:(o,k)=>o[k]||k}),'expo-router':{useRouter:()=>({push,back:()=>{},replace:()=>{}}),useLocalSearchParams:()=>({id:'c'})},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'lucide-react-native':{},'expo-haptics':{impactAsync:()=>{},notificationAsync:()=>{},ImpactFeedbackStyle:{Light:1},NotificationFeedbackType:{Success:1}}};
 for(const depth of ['../..','../../..'])Object.assign(deps,{
  [depth+'/src/config/features']:{COURSE_SEARCH_ENABLED:false},[depth+'/src/config/auth']:{REAL_AUTH_CONFIGURED:false},[depth+'/src/stores/auth-store']:{useAuthStore:Object.assign(f=>f({user:null}),{getState:()=>({})})},[depth+'/src/ui/CourseSearch']:{__esModule:true,default:()=>null},
  [depth+'/src/stores/scan-store']:{useScanStore:f=>f({tier})},[depth+'/src/services/entitlements']:e,[depth+'/src/ui/theme']:theme,[depth+'/src/engine/types']:types,[depth+'/src/ui/AnimatedPressable']:{AnimatedPressable:'Pressable'},
  [depth+'/src/stores/contest-store']:{useContestStore:f=>f({contests:[contest],updateContest:save,addContest:save,addRound:save}),defaultCourse:()=>({name:'Course',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))}),generateId:()=>String(Math.random())},
 });
 const Screen=load(path,deps).default;
 return {render:()=>{cursor=0;return Screen();},push,save,states};
}
function nodes(n){if(!n||typeof n!=='object')return [];return Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];}
function textOf(n){if(n==null)return '';if(typeof n!=='object')return String(n);if(Array.isArray(n))return n.map(textOf).join('');return textOf(n.props?.children);}
function button(tree,label){const found=nodes(tree).find(n=>n.type==='Pressable'&&textOf(n).includes(label));expect(found).toBeDefined();return found;}
test('actual edit picker gates adding premium games and groups; existing premium game remains saved',()=>{
 const c=fixture();c.groups=[c.groups[0]];c.rounds=undefined;c.isTournament=false;
 const h=screenHarness('app/contest/[id]/edit.tsx','free',c);let tree=h.render();
 button(tree,'Nassau').props.onPress();expect(h.push).toHaveBeenLastCalledWith('/paywall');
 button(tree,'Add Group').props.onPress();expect(h.push).toHaveBeenLastCalledWith('/paywall?tier=td');
 // Removing an existing premium game is allowed; adding it again requires Pro.
 const skins=nodes(tree).find(n=>n.type==='Pressable'&&textOf(n).includes('🔒 Skins')&&!textOf(n).includes('Carryover'));
 skins.props.onPress();tree=h.render();button(tree,'🔒 Skins').props.onPress();expect(h.push).toHaveBeenLastCalledWith('/paywall');
 const pro=screenHarness('app/contest/[id]/edit.tsx','pro',c);button(pro.render(),'Nassau').props.onPress();expect(pro.push).not.toHaveBeenCalled();
 const td=screenHarness('app/contest/[id]/edit.tsx','td',c);button(td.render(),'Add Group').props.onPress();expect(td.push).not.toHaveBeenCalled();expect(textOf(td.render())).toContain('Add Group');
});
test('actual new-contest picker and submit prevent premium game and tournament bypasses',()=>{
 const h=screenHarness('app/contest/new.tsx','free');let tree=h.render();
 nodes(tree).find(n=>n.props?.testID==='tournament-toggle').props.onValueChange(true);expect(h.push).toHaveBeenLastCalledWith('/paywall?tier=td');
 h.states[0]=2;h.states[8]=h.states[8].map((p,i)=>({...p,name:'Player '+i}));tree=h.render();
 button(tree,'🔒 Skins').props.onPress();expect(h.push).toHaveBeenLastCalledWith('/paywall');expect(h.states[11]).toEqual(['stroke_play']);
 h.states[0]=3;h.states[7]=2;tree=h.render();const submit=nodes(tree).find(n=>n.type==='Pressable'&&textOf(n).includes('START'));expect(submit).toBeDefined();submit.props.onPress();expect(h.save).not.toHaveBeenCalled();expect(h.push).toHaveBeenLastCalledWith('/paywall?tier=td');
 h.states[7]=1;tree=h.render();button(tree,'START').props.onPress();expect(h.save).toHaveBeenCalledTimes(1);
});
test('consent prompt persists decline and allows settings withdrawal without repeat network access',async()=>{
 let choice=null;const update=jest.fn((key,v)=>choice=v),alert=jest.fn();
 const svc=load('src/services/ocr-consent.ts',{'react-native':{Alert:{alert}},'../stores/settings-store':{useSettingsStore:{persist:{rehydrate:async()=>{}},getState:()=>({ocrConsent:choice,updateSetting:update})}}});
 const pending=svc.requestOCRConsent();await Promise.resolve();await Promise.resolve();expect(alert).toHaveBeenCalledTimes(1);
 expect(alert.mock.calls[0][1]).toContain('Anthropic (Claude)');alert.mock.calls[0][2][0].onPress();expect(await pending).toBe(false);expect(await svc.requestOCRConsent()).toBe(false);expect(alert).toHaveBeenCalledTimes(1);
 choice=true;expect(await svc.requestOCRConsent()).toBe(true);choice=false;expect(await svc.requestOCRConsent()).toBe(false);
});
test('scan allowance uses local calendar rollover and TD includes unlimited access',()=>{
 jest.useFakeTimers();try{
 jest.setSystemTime(new Date(2026,9,31,23,59));const store=load('src/stores/scan-store.ts',{'../services/entitlements':entitlement(),zustand:require('zustand'),'zustand/middleware':persistence,'@react-native-async-storage/async-storage':{}}).useScanStore;
 for(let i=0;i<3;i++)expect(store.getState().useScan()).toBe(true);expect(store.getState().canScan()).toBe(false);
 jest.setSystemTime(new Date(2026,10,1,0,0));expect(store.getState().getRemainingFreeScans()).toBe(3);expect(store.getState().useScan()).toBe(true);expect(store.getState().scanMonth).toBe('2026-11');
 store.getState().setTier('td');expect(store.getState().isPro).toBe(true);expect(store.getState().isTD).toBe(true);expect(store.getState().getRemainingFreeScans()).toBe(Infinity);
 }finally{jest.useRealTimers();}
});
test('actual add-round action requires TD and permits TD',()=>{
 const free=screenHarness('app/contest/[id]/tournament-rounds.tsx','free');button(free.render(),'Add Round').props.onPress();expect(free.save).not.toHaveBeenCalled();expect(free.push).toHaveBeenLastCalledWith('/paywall?tier=td');
 const td=screenHarness('app/contest/[id]/tournament-rounds.tsx','td');button(td.render(),'Add Round').props.onPress();expect(td.save).toHaveBeenCalledWith('c','Round 3');
});
test('subscription cache survives offline restart and migrates existing Pro users consistently',()=>{
 let options;
 const store=load('src/stores/scan-store.ts',{'../services/entitlements':entitlement(),zustand:require('zustand'),'zustand/middleware':{persist:(f,o)=>{options=o;return f;},createJSONStorage:()=>({})},'@react-native-async-storage/async-storage':{}}).useScanStore;
 expect(options.migrate({isPro:true,scansUsed:1})).toMatchObject({tier:'pro',isPro:true,isTD:false,scanMonth:''});
 store.getState().setTier('td');expect(options.partialize(store.getState())).toMatchObject({tier:'td',isPro:true,isTD:true});
 store.getState().setTier('free');expect(options.partialize(store.getState())).toMatchObject({tier:'free',isPro:false,isTD:false});
});
test('free result sharing uses the selected tournament round scores',async()=>{
 const file='app/contest/[id]/settlement.tsx';const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let handler;
 function visit(node){if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(source)==='Pressable'&&node.children.map(c=>c.getText(source)).join('').includes('Share results — free'))handler=node.openingElement.attributes.properties.find(p=>p.name?.getText(source)==='onPress').initializer.expression.getText(source);ts.forEachChild(node,visit);}visit(source);
 const contest=fixture();contest.rounds=JSON.parse(JSON.stringify(contest.rounds));contest.rounds[1].groups[1].players[0].scores[0]=4;
 const Share={share:jest.fn()};await require('vm').runInNewContext('('+handler+')',{contest,Share})();expect(Share.share).toHaveBeenCalledWith({message:expect.stringContaining('Guest 1: 4')});
});
test('quick start and scan quick settle add only free games for a free user',()=>{
 const e=entitlement();expect(e.defaultRoundGames('free')).toEqual(['stroke_play']);expect(e.defaultRoundGames('pro')).toEqual(['stroke_play','skins']);expect(e.defaultRoundGames('td')).toEqual(['stroke_play','skins']);
 for(const file of ['app/(tabs)/index.tsx','app/scan/review.tsx'])expect(read(file)).toContain('defaultRoundGames(');
});
