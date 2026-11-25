const fs=require('fs'),ts=require('typescript');
const read=p=>fs.readFileSync(p,'utf8');
function load(p,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(read(p),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText)(id=>{if(id==='@/services/platform-alert')return {showAlert:(...args)=>deps['react-native']?.Alert?.alert?.(...args)};if(id.endsWith('/ui/SafeScreen'))return {SafeScreen:'SafeAreaView',SheetSurface:'View',FullScreenSheet:'Modal'};if(id in deps)return deps[id];throw Error(id)},m,m.exports);return m.exports;}
const {PAYWALL_COPY:C}=load('src/ui/paywall-copy.ts');
const check=jest.fn();
const plans=load('src/services/paywall-plans.ts',{'../ui/paywall-copy':{PAYWALL_COPY:C},'react-native-purchases':{__esModule:true,default:{checkTrialOrIntroductoryPriceEligibility:check},INTRO_ELIGIBILITY_STATUS:{INTRO_ELIGIBILITY_STATUS_ELIGIBLE:2}}});
const pkg=(id,price)=>({product:{identifier:id,priceString:price,introPrice:{price:0,periodUnit:'DAY',periodNumberOfUnits:7}}});
const packages={annual:pkg('pro-y','$24.99'),monthly:pkg('pro-m','$3.99'),td_annual:pkg('td-y','$79.99'),td_monthly:pkg('td-m','$12.99')};
const eligible={'pro-y':true,'td-y':true};
const view=(period='year',tier='pro',owner='free',p=packages,e=eligible)=>plans.buildPaywallView(p,e,owner,{tier,period});
const strings=v=>[v.restore,v.eyebrow,v.headline,...v.values.flatMap(r=>[r.title,r.body]),v.scans,...v.rows.flatMap(r=>[r.name,r.tag,r.body,r.alternate,r.price,r.trial].filter(Boolean)),v.cta,v.billed,v.oneTrial,v.legal,v.terms,v.dot,v.privacy].filter(Boolean);
test('AC-PW1 byte-exact staged launch strings in both periods',()=>{
 const fixture=require('./fixtures/paywall-figma-strings.json');
 for(const [period,id] of [['year','1:164'],['month','1:247']])
 // t1517u: Tournament Director has no free trial, so the Figma TD trial tag is intentionally not rendered.
 expect(strings(view(period)).sort()).toEqual(Object.values(fixture[id]).filter(n=>!/Plan \/ Tournament Director > Price > Tag \/ Trial/.test(n.path)).map(n=>n.characters).sort());
});
test('AC-PW2 four eligibility cases, throw, monthly never offers a trial',async()=>{
 for(const tier of ['pro','td'])for(const allowed of [true,false]){
  check.mockResolvedValue({'pro-y':{status:tier==='pro'&&allowed?2:1},'td-y':{status:tier==='td'&&allowed?2:1}});
  const e=await plans.eligibleAnnualTrials(packages);
  expect(view('year',tier,'free',packages,e).cta===C.startTrial).toBe(tier==='pro'&&allowed);
  expect(e['td-y']).toBe(false);
  expect(view('year','td','free',packages,e).rows.find(r=>r.tier==='td').trial).toBe('');
  for(const period of ['year','month']){
   const v=view(period,tier,'free',packages,e);
   if(period==='month'||!allowed||tier==='td'){expect(v.cta).not.toContain('trial');expect(v.billed).not.toMatch(/^Then/);}
   if(period==='month')expect(v.rows.every(r=>!r.trial)).toBe(true);
  }
 }
 check.mockRejectedValue(Error('offline'));
 expect(await plans.eligibleAnnualTrials(packages)).toEqual({});
 expect(view('year','pro','free',packages,{}).cta).not.toContain('trial');
});
// Render the actual screen and exercise its handlers with the same transpile loader.
function screen({restore=async()=>true,owner='free',target,platform='ios',fontScale=1,proEnabled=true}={}){
 const states=[],effects=[];let cursor=0;
 const jsx=(type,props)=>({type,props});
 const alert=jest.fn(),openURL=jest.fn(),back=jest.fn();
 const react={useState:init=>{const i=cursor++;if(!(i in states))states[i]=init;return[states[i],v=>{states[i]=v;}];},useEffect:f=>effects.push(f)};
 const Screen=load('app/paywall.tsx',{
 react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{Platform:{OS:platform},useWindowDimensions:()=>({fontScale}),View:'View',Text:'Text',ScrollView:'ScrollView',Pressable:'Pressable',Alert:{alert},Linking:{openURL},StyleSheet:{create:x=>x}},
 'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'expo-router':{useRouter:()=>({back}),useLocalSearchParams:()=>({tier:target})},
 '@expo-google-fonts/inter':{useFonts:()=>[true]},
 '../src/services/purchases':{getPackages:async()=>packages,purchasePackage:async()=>true,restorePurchases:restore,syncProStatus:async()=>{}},
 '../src/services/paywall-plans':plans,'../src/services/entitlements':{proEnabled:()=>proEnabled},'../src/stores/scan-store':{useScanStore:f=>f({tier:owner})},
 '../src/config/support':load('src/config/support.ts'),'../src/config/posthog':{posthog:null},'../src/ui/paywall-copy':{PAYWALL_COPY:C},
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
test('AC-PW6 both tiers and periods use the staged game count',()=>{
 const countClaim=/\d+\s*\+?\s*(game|games|mode|modes|ways to play|ways)/i;
 for(const period of ['year','month'])for(const tier of ['pro','td']){
  const v=view(period,tier);
  expect(v.values.map(v=>v.icon)).toEqual(['contest','library','live']);
  expect(v.values.find(v=>v.icon==='library').body).toBe(C.libraryBody);
  expect(v.values.every(v=>!/scan/i.test(v.body))).toBe(true);
  for(const value of strings(v)){
   expect(value.replaceAll('50+ game modes','')).not.toMatch(countClaim);
   expect(value).not.toMatch(/ways to play/i);
  }
  const h=screen();h.render();h.states[0]={tier,period};
  const rendered=text(h.render());
  expect(rendered).toContain(C.libraryBody);
  expect(rendered.replaceAll('50+ game modes','')).not.toMatch(countClaim);
  expect(rendered).not.toMatch(/ways to play/i);
 }
});
test('actual selection, alternate period switching, TD route, Close and missing CTA',()=>{
 const h=screen({target:'td'});let tree=h.render();expect(h.states[0]).toEqual({tier:'td',period:'year'});
 expect(nodes(tree).find(n=>n.props?.accessibilityLabel==='Close')).toBeDefined();
 button(tree,'or $12.99/month').props.onPress({stopPropagation(){}});
 tree=h.render();expect(h.states[0]).toEqual({tier:'td',period:'month'});
 expect(nodes(tree).filter(n=>n.type==='Text').map(text)).not.toContain(C.trial);
 expect(nodes(tree).find(n=>n.props?.accessibilityState?.disabled===true)).toBeDefined();
});

// AUG-293: exercise the actual screen props through the installed web renderer.
test('AC-PW10 selected plan exposes checked semantics; missing/wrong/multiple checked states fail',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const Pressable=require('react-native-web/dist/cjs/exports/Pressable');
 const Text=require('react-native-web/dist/cjs/exports/Text');
 const radios=tree=>nodes(tree).filter(n=>n.type==='Pressable'&&n.props.accessibilityRole==='radio');
 function verify(rows,expected){
  expect(rows).toHaveLength(3);
  const checked=[];
  rows.forEach((row,index)=>{
   const name=text(row),props={...row.props,children:React.createElement(Text,null,name)};
   const html=renderToStaticMarkup(React.createElement(Pressable,props));
   expect(html).toContain('role="radio"');
   expect(typeof props['aria-checked']).toBe('boolean');
   expect(props['aria-checked']).toBe(props.accessibilityState.checked);
   expect(props['aria-checked']).toBe(nodes(row).find(n=>n.type==='Radio').props.selected);
   expect(html).toContain(`aria-checked="${props['aria-checked']}"`);
   if(props['aria-checked'])checked.push(index);
  });
  expect(checked).toEqual([expected]);
 }
 for(const target of ['pro','td']){
  const h=screen({target});let rows=radios(h.render());verify(rows,target==='td'?2:1);
  for(const selected of [0,1,2]){rows[selected].props.onPress();rows=radios(h.render());verify(rows,selected);}
 }
 const rows=radios(screen({target:'td'}).render());
 for(const mutate of [r=>r.forEach(n=>delete n.props['aria-checked']),r=>r[2].props['aria-checked']=false,r=>r[1].props['aria-checked']=true,r=>{r[2].props['aria-checked']=false;r[2].props.accessibilityState={checked:false};r[1].props['aria-checked']=true;r[1].props.accessibilityState={checked:true};}]){
  const copy=rows.map(n=>({...n,props:{...n.props,accessibilityState:{...n.props.accessibilityState}}}));mutate(copy);expect(()=>verify(copy,2)).toThrow();
 }
});


const flattenStyle=s=>Array.isArray(s)?Object.assign({},...s.filter(Boolean).map(flattenStyle)):s||{};
const exactTextNode=(tree,label)=>nodes(tree).find(n=>n.type==='Text'&&text(n)===label);
const planRow=(tree,label)=>nodes(tree).find(n=>n.props?.accessibilityRole==='radio'&&exactTextNode(n,label));

test.each([1.3, Math.fround(1.3), 1.6])('Android phone large text %s gets full-width, natural wrapping without changing strings',fontScale=>{
 const h=screen({target:'td',platform:'android',fontScale,proEnabled:false}), tree=h.render();
 const free=planRow(tree,'Free'), td=planRow(tree,'Tournament Director');
 expect(free).toBeDefined(); expect(td).toBeDefined();
 expect(flattenStyle(free.props.style)).toMatchObject({alignItems:'flex-start'});
 const freeName=exactTextNode(free,'Free');
 expect(flattenStyle(freeName.props.style)).toMatchObject({alignSelf:'stretch',fontSize:16});
 expect(nodes(free).some(n=>n.type==='View'&&flattenStyle(n.props.style).flexDirection==='column'&&n.props.children.includes(freeName))).toBe(true);
 const price=exactTextNode(td.props.children[1],'$79.99/year');
 expect(price).toBeDefined(); expect(price.props.numberOfLines).toBeUndefined();
 expect(price.props.adjustsFontSizeToFit).not.toBe(true);
 expect(flattenStyle(price.props.style).fontSize).toBe(16);
 const restore=button(tree,C.restore);
 expect(flattenStyle(restore.props.style)).toMatchObject({flex:1,minWidth:0});
 expect(flattenStyle(exactTextNode(restore,'Restore Purchases').props.style)).toMatchObject({alignSelf:'stretch',textAlign:'right',fontSize:14});
 const cta=button(tree,C.unavailable);
 expect(cta.props.disabled).toBe(true);
 expect(flattenStyle(cta.props.style).height).toBe('auto');
 expect(exactTextNode(cta,C.unavailable).props.adjustsFontSizeToFit).toBe(false);
 h.states[1]={...packages,td_annual:pkg('td-y','CHF 1’234.50')};
 const localized=exactTextNode(planRow(h.render(),'Tournament Director'),'CHF 1’234.50/year');
 expect(localized).toBeDefined(); expect(localized.props.numberOfLines).toBeUndefined();
});

test.each([['android',1],['ios',1.353],['web',1.3]])('%s %s keeps the existing paywall row/CTA layout', (platform,fontScale)=>{
 const tree=screen({target:'td',platform,fontScale}).render(), td=planRow(tree,'Tournament Director');
 expect(flattenStyle(td.props.style).alignItems).toBe('center');
 expect(exactTextNode(td.props.children[1],'$79.99/year')).toBeUndefined();
 expect(exactTextNode(td.props.children[2],'$79.99/year').props.numberOfLines).toBe(1);
 expect(exactTextNode(button(tree,C.unavailable),C.unavailable).props.adjustsFontSizeToFit).toBe(true);
 expect(flattenStyle(button(tree,C.restore).props.style).flex).toBeUndefined();
});

test('actual paywall reserves Android 48dp frames for Close, Restore and billing interval',()=>{
 for(const [platform,min] of [['android',48],['ios',44]]){
  const tree=screen({target:'td',platform}).render();
  const close=nodes(tree).find(n=>n.props?.testID==='paywall-close');
  const restore=button(tree,C.restore);
  const alternate=button(tree,'or $12.99/month');
  for(const pressable of [close,restore,alternate]) expect(pressable.props.style.minHeight).toBe(min);
  expect(close.props.style.minWidth).toBe(min);
 }
});
