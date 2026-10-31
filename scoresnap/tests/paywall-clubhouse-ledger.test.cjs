const fs=require('fs'),ts=require('typescript');
const read=p=>fs.readFileSync(p,'utf8');
function load(p,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(read(p),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText)(id=>{if(id in deps)return deps[id];throw Error(id)},m,m.exports);return m.exports;}
const {PAYWALL_COPY:C}=load('src/ui/paywall-copy.ts');
const check=jest.fn();
const plans=load('src/services/paywall-plans.ts',{'../ui/paywall-copy':{PAYWALL_COPY:C},'react-native-purchases':{__esModule:true,default:{checkTrialOrIntroductoryPriceEligibility:check},INTRO_ELIGIBILITY_STATUS:{INTRO_ELIGIBILITY_STATUS_ELIGIBLE:2}}});
const pkg=(id,price)=>({product:{identifier:id,priceString:price,introPrice:{price:0,periodUnit:'DAY',periodNumberOfUnits:7}}});
const packages={annual:pkg('pro-y','$24.99'),monthly:pkg('pro-m','$3.99'),td_annual:pkg('td-y','$79.99'),td_monthly:pkg('td-m','$12.99')};
const eligible={'pro-y':true,'td-y':true};
const view=(period='year',tier='pro',owner='free',p=packages,e=eligible)=>plans.buildPaywallView(p,e,owner,{tier,period});
const strings=v=>[v.restore,v.eyebrow,v.headline,...v.values.flatMap(r=>[r.title,r.body]),v.scans,...v.rows.flatMap(r=>[r.name,r.tag,r.body,r.alternate,r.price,r.trial].filter(Boolean)),v.cta,v.billed,v.oneTrial,v.legal,v.terms,v.dot,v.privacy].filter(Boolean);
test('AC-PW1 byte-exact Figma strings in both periods',()=>{
 const fixture=require('./fixtures/paywall-figma-strings.json');
 for(const [period,id] of [['year','1:164'],['month','1:247']])
 expect(strings(view(period)).sort()).toEqual(Object.values(fixture[id]).map(n=>n.characters).sort());
});
test('AC-PW2 four eligibility cases, throw, monthly never offers a trial',async()=>{
 for(const tier of ['pro','td'])for(const allowed of [true,false]){
  check.mockResolvedValue({'pro-y':{status:tier==='pro'&&allowed?2:1},'td-y':{status:tier==='td'&&allowed?2:1}});
  const e=await plans.eligibleAnnualTrials(packages);
  expect(view('year',tier,'free',packages,e).cta===C.startTrial).toBe(allowed);
  for(const period of ['year','month']){
   const v=view(period,tier,'free',packages,e);
   if(period==='month'||!allowed){expect(v.cta).not.toContain('trial');expect(v.billed).not.toMatch(/^Then/);}
   if(period==='month')expect(v.rows.every(r=>!r.trial)).toBe(true);
  }
 }
 check.mockRejectedValue(Error('offline'));
 expect(await plans.eligibleAnnualTrials(packages)).toEqual({});
 expect(view('year','pro','free',packages,{}).cta).not.toContain('trial');
});
// Render the actual screen and exercise its handlers with the same transpile loader.
function screen({restore=async()=>true,owner='free',target}={}){
 const states=[],effects=[];let cursor=0;
 const jsx=(type,props)=>({type,props});
 const alert=jest.fn(),openURL=jest.fn(),back=jest.fn();
 const react={useState:init=>{const i=cursor++;if(!(i in states))states[i]=init;return[states[i],v=>{states[i]=v;}];},useEffect:f=>effects.push(f)};
 const Screen=load('app/paywall.tsx',{'../src/engine/types':{PLAYABLE_GAME_COUNT:30},
 react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',ScrollView:'ScrollView',Pressable:'Pressable',Alert:{alert},Linking:{openURL},StyleSheet:{create:x=>x}},
 'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'expo-router':{useRouter:()=>({back}),useLocalSearchParams:()=>({tier:target})},
 '@expo-google-fonts/inter':{useFonts:()=>[true]},
 '../src/services/purchases':{getPackages:async()=>packages,purchasePackage:async()=>true,restorePurchases:restore,syncProStatus:async()=>{}},
 '../src/services/paywall-plans':plans,'../src/stores/scan-store':{useScanStore:f=>f({tier:owner})},
 '../src/config/support':load('src/config/support.ts'),'../src/ui/paywall-copy':{PAYWALL_COPY:C},
 '../src/ui/paywall-tokens':load('src/ui/paywall-tokens.ts'),'../src/ui/paywall-icons':{PaywallIcon:'Icon',PaywallRadio:'Radio'},
 }).default;
 return {render:()=>{cursor=0;return Screen()},states,effects,alert,openURL,back};
}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
const button=(tree,label)=>nodes(tree).find(n=>n.type==='Pressable'&&text(n)===label);
test('AC-PW3 restore success, none, error call shipped service and alerts',async()=>{
 for(const [value,message] of [[true,C.restored],[false,C.nothing],[Error('restore failed'),'restore failed'],[Error(''),C.retry]]){
  const restore=jest.fn(async()=>{if(value instanceof Error)throw value;return value;});
  const h=screen({restore});await button(h.render(),C.restore).props.onPress();
  expect(restore).toHaveBeenCalledTimes(1);expect(h.alert).toHaveBeenCalledWith(value instanceof Error?C.subscription:C.restore,message);
 }
});
test('AC-PW4 offerings prices, keys, fallbacks, missing disabled; state table',()=>{
 const p=Object.fromEntries(Object.keys(packages).map((k,i)=>[k,pkg(k,'£'+(19+i)+'.99')]));
 for(const period of ['year','month'])for(const tier of ['pro','td']){
  const v=view(period,tier,'free',p,{});expect(v.cta).toContain(p[v.rows.find(r=>r.selected).key].product.priceString);expect(v.disabled).toBe(false);
  const missing=view(period,tier,'free',null);expect(missing.disabled).toBe(true);expect(missing.cta).toBe(C.unavailable);
 }
 expect(view('year','pro','free',null).rows.map(r=>r.price)).toEqual(['','$24.99/year','$79.99/year']);
 expect(view('month','pro','free',null).rows.map(r=>r.price)).toEqual(['','$3.99/month','$12.99/month']);
 expect(view('year','free').disabled).toBe(true);
 expect(view('year','pro','pro').disabled).toBe(true);
 expect(view('year','td','pro').cta).toBe('Upgrade to TD — $79.99/year');
 for(const t of ['free','pro','td'])expect(view('year',t,'td').disabled).toBe(true);
 for(const owner of ['free','pro','td'])expect(view('year','pro',owner).rows.find(r=>r.tag===C.current).tier).toBe(owner);
 expect(read('src/services/purchases.ts')).toContain('td_monthly');
});
test('AC-PW5 legal strings and actual Linking handlers',()=>{
 const {TERMS_URL,PRIVACY_URL}=load('src/config/support.ts');
 for(const period of ['year','month']){
  const v=view(period);for(const key of ['legal','oneTrial','restore','terms','privacy'])expect(strings(v)).toContain(v[key]);
  expect(strings(v).join(' ')).not.toMatch(/refund|money.?back|risk.?free|lifetime/i);
 }
 const h=screen(),tree=h.render();button(tree,C.terms).props.onPress();button(tree,C.privacy).props.onPress();
 expect(h.openURL.mock.calls).toEqual([[TERMS_URL],[PRIVACY_URL]]);
});
test('AC-PW6 contest/library/live and claimed count equals shipped playable registry',()=>{
 const e=load('src/services/entitlements.ts');
 const registry=load('src/engine/types.ts',{'../services/entitlements':e});
 expect(view().values.map(v=>v.icon)).toEqual(['contest','library','live']);
 expect(Number(C.libraryBody.match(/^(\d+) game modes/)[1])).toBe(registry.IMPLEMENTED_GAME_IDS.length);
 expect(C.libraryBody).toContain('30 game modes');
 expect(view().values.every(v=>!/scan/i.test(v.body))).toBe(true);
});
test('actual selection, alternate period switching, TD route, Close and missing CTA',()=>{
 const h=screen({target:'td'});let tree=h.render();expect(h.states[0]).toEqual({tier:'td',period:'year'});
 expect(nodes(tree).find(n=>n.props?.accessibilityLabel==='Close')).toBeDefined();
 button(tree,'or $12.99/month').props.onPress({stopPropagation(){}});
 tree=h.render();expect(h.states[0]).toEqual({tier:'td',period:'month'});
 expect(nodes(tree).filter(n=>n.type==='Text').map(text)).not.toContain(C.trial);
 expect(nodes(tree).find(n=>n.props?.accessibilityState?.disabled===true)).toBeDefined();
});
test('library count comes from the playable game count, never a hard-coded claim',()=>{const v=plans.buildPaywallView(null,{},'free',{tier:'pro',period:'year'},17);expect(v.values[1].body).toMatch(/^17 ways to play/);expect(plans.buildPaywallView(null,{},'free',{tier:'pro',period:'year'}).values[1].body).toBe(C.libraryBody);});
