const fs=require('fs'),ts=require('typescript');
const jsx=(type,props)=>({type,props});
function render(child,canGoBack=false){
 const back=jest.fn(),replace=jest.fn();
 const deps={react:{useState:v=>[v,()=>{}],useCallback:f=>f},'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',Pressable:'Pressable'},'expo-router':{Slot:'Slot',usePathname:()=>`/contest/c${child?'/'+child:''}`,useLocalSearchParams:()=>({id:'c'}),useRouter:()=>({back,replace,canGoBack:()=>canGoBack})},'lucide-react-native':{},'expo-haptics':{},'./index':{default:'leaderboard'},'./scorecard':{default:'scorecard'},'./games':{default:'games'},'./settlement':{default:'settlement'}};
 const extra={'ui/RoundStatusSheet':{RoundStatusSheet:'Sheet'},'ui/LiveShare':{useLiveSharePublisher:()=>{}},'services/cross-device':{},'stores/online-store':{useOnlineStore:f=>f({events:{}})},'ui/SafeScreen':{SafeScreen:'SafeScreen'},'ui/theme':{COLORS:{},FONTS:{},RADII:{}},'stores/contest-store':{useContestStore:f=>f({contests:[{id:'c',name:'Round',course:{name:'Course'},groups:[],status:'completed'}]})},'ui/AnimatedPressable':{AnimatedPressable:'Pressable'}};
 for(const [key,value]of Object.entries(extra))deps['../../../src/'+key]=value;
 const m={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('app/contest/[id]/_layout.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(id=>{if(!(id in deps))throw Error(id);return deps[id]},m,m.exports);
 return {tree:m.exports.default(),back,replace};
}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
test.each(['edit','tournament-rounds','add-a-game','future-child'])('%s renders the nested outlet instead of a tab',child=>{const {tree}=render(child);expect(tree.type).toBe('Slot');expect(nodes(tree).some(n=>['scorecard','leaderboard','games','settlement'].includes(n.type))).toBe(false);});
test.each([['','leaderboard'],['index','leaderboard'],['scorecard','scorecard'],['games','games'],['settlement','settlement']])('direct URL %s selects %s',(child,tab)=>{const {tree}=render(child);expect(nodes(tree).find(n=>n.props?.testID===`round-tab-${tab}`).props.accessibilityState.selected).toBe(true);expect(nodes(tree).some(n=>n.type==='Slot')).toBe(true);});
test.each([true,false])('round Back uses history or Home (%s)',available=>{const {tree,back,replace}=render('games',available);nodes(tree).find(n=>n.props?.accessibilityLabel==='Back').props.onPress();expect(available?back:replace).toHaveBeenCalledWith(...(available?[]:['/']));});
test.each(['edit','tournament-rounds'])('%s has a direct-link Home fallback',child=>{expect(fs.readFileSync(`app/contest/[id]/${child}.tsx`,'utf8')).toContain('router.canGoBack() ? router.back() : router.replace("/")');});
