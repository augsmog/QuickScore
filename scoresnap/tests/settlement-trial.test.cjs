const fs=require('fs'),ts=require('typescript');
function load(path,deps){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(id=>{if(!(id in deps))throw Error(id);return deps[id]},m,m.exports);return m.exports;}
const jsx=(type,props)=>({type,props});
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
function screen(packages,status){
 let state=false,effect;const check=jest.fn(async()=>({'pro.annual':{status}}));
 const plans=load('src/services/paywall-plans.ts',{'react-native-purchases':{__esModule:true,default:{checkTrialOrIntroductoryPriceEligibility:check},INTRO_ELIGIBILITY_STATUS:{INTRO_ELIGIBILITY_STATUS_ELIGIBLE:1}},'../ui/paywall-copy':{PAYWALL_COPY:{}}});
 const deps={react:{useState:()=>[state,v=>{state=v}],useEffect:f=>{effect=f}},'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',ScrollView:'ScrollView',Pressable:'Pressable'},'expo-router':{useRouter:()=>({push:()=>{}}),useLocalSearchParams:()=>({id:'c'})},'lucide-react-native':{},'expo-haptics':{}};
 const extras={'services/purchases':{getPackages:()=>packages},'services/paywall-plans':plans,'services/scorecard-pdf':{},'services/share-scorecard-pdf':{},'engine/contest-results':{},'engine/calculators/skins':{},'stores/scan-store':{useScanStore:f=>f({tier:'free'})},'stores/contest-store':{useContestStore:f=>f({contests:[]})},'services/entitlements':{canSeeSettlement:()=>false},'ui/recap/RecapCard':{},'ui/recap/model':{},'ui/LiveShare':{},'ui/copy':{},'ui/paywall-copy':{PAYWALL_COPY:{yearlyRenew:'Renews yearly. Cancel anytime.'}},'ui/theme':{COLORS:{},FONTS:{},TYPOGRAPHY:{},RADII:{}}};
 for(const [k,v]of Object.entries(extras))deps['../../../src/'+k]=v;
 const Screen=load('app/contest/[id]/settlement.tsx',deps).default;
 return {render:()=>Screen(),start:()=>effect(),check};
}
const annual={product:{identifier:'pro.annual',introPrice:{price:0,periodUnit:'DAY',periodNumberOfUnits:7}}};
const trial=tree=>nodes(tree).some(n=>n.props?.testID==='settle-free-trial');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test.each([[1,true],[0,false]])('Apple eligibility %s controls trial button and renew line',async(status,expected)=>{const s=screen(Promise.resolve({annual}),status);expect(trial(s.render())).toBe(false);s.start();await flush();const tree=s.render();expect(trial(tree)).toBe(expected);expect(text(tree).includes('Renews yearly. Cancel anytime.')).toBe(expected);expect(text(tree)).toContain('See all plans');expect(s.check).toHaveBeenCalledWith(['pro.annual']);});
test('offerings not loaded never promises a trial',()=>{const s=screen(new Promise(()=>{}),1);s.render();s.start();expect(trial(s.render())).toBe(false);expect(text(s.render())).toContain('See all plans');});
test('purchases unavailable on web uses existing plans path',async()=>{const s=screen(Promise.resolve({annual:null,td_annual:null}),1);s.render();s.start();await flush();expect(trial(s.render())).toBe(false);expect(s.check).not.toHaveBeenCalled();expect(text(s.render())).toContain('See all plans');});
test('unmounted teaser ignores an eligibility response',async()=>{const s=screen(Promise.resolve({annual}),1);s.render();const cleanup=s.start();cleanup();await flush();expect(trial(s.render())).toBe(false);});
