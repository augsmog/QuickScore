// AUG-1115: regression for GAP-01 (round edit / "Add a game" / tournament routes).
// Contract: /contest/:id/edit and /contest/:id/tournament-rounds must render their own
// screens, not the shared tab shell, and tab selection must follow the URL.
const fs=require('fs'),ts=require('typescript');
const jsx=(type,props)=>({type,props});
const LAYOUT='app/contest/[id]/_layout.tsx';
function render(pathname, router={back:jest.fn(),replace:jest.fn(),push:jest.fn(),canGoBack:()=>true}){
 const deps={
  react:{useState:v=>[v,()=>{}],useCallback:f=>f},
  'react/jsx-runtime':{jsx,jsxs:jsx},
  'react-native':{View:'View',Text:'Text',Pressable:'Pressable',Dimensions:{get:()=>({width:390,height:844})}},
  'expo-router':{Slot:'Slot',usePathname:()=>pathname,useLocalSearchParams:()=>({id:'c'}),useRouter:()=>router},
  'lucide-react-native':{},'expo-haptics':{impactAsync:jest.fn(),ImpactFeedbackStyle:{Light:'light'}},
  './index':{default:'leaderboard'},'./scorecard':{default:'scorecard'},'./games':{default:'games'},'./settlement':{default:'settlement'},
  '../../../src/ui/OnlineSyncPanel':{OnlineSyncPanel:'OnlineSyncPanel'},
  '../../../src/ui/ContestJoinCode':{ContestJoinCode:'ContestJoinCode'},
  '../../../src/ui/RoundStatusSheet':{RoundStatusSheet:'RoundStatusSheet'},
  '../../../src/ui/compact-viewport':{isCompactViewport:()=>true},
  '../../../src/ui/LiveShare':{LiveShare:'LiveShare',useLiveSharePublisher:()=>{}},
  '../../../src/services/cross-device':{onlineEnabled:false},
  '../../../src/stores/online-store':{useOnlineStore:f=>f({events:{}})},
  '../../../src/ui/SafeScreen':{SafeScreen:'SafeScreen'},
  '../../../src/ui/theme':{COLORS:{},FONTS:{},RADII:{}},
  '../../../src/stores/contest-store':{useContestStore:f=>f({contests:[{id:'c',name:'Round',course:{name:'Course'},groups:[],status:'completed'}]})},
  '../../../src/ui/AnimatedPressable':{AnimatedPressable:'Pressable'},
  '../../../src/ui/contest-back':{contestChildHref:(id,c,f)=>'/contest/'+id+'/'+c+'?from='+f},
 };
 const m={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(LAYOUT,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(id=>{if(!(id in deps))throw Error(id);return deps[id]},m,m.exports);
 return m.exports.default();
}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const types=t=>nodes(t).map(n=>n.type);
const selected=t=>nodes(t).filter(n=>n.props?.accessibilityRole==='tab'&&n.props?.accessibilityState?.selected).map(n=>n.props.accessibilityLabel);

// Route entry points and links.
test('route files for edit and tournament-rounds exist',()=>{
 expect(fs.existsSync('app/contest/[id]/edit.tsx')).toBe(true);
 expect(fs.existsSync('app/contest/[id]/tournament-rounds.tsx')).toBe(true);
});
test('"Add a game" in Games navigates to the round edit route',()=>{
 expect(fs.readFileSync('app/contest/[id]/games.tsx','utf8')).toMatch(/router\.push\(`\/contest\/\$\{id\}\/edit\?from=games`\)/);
});
test('round tab URL contract: scorecard is the default tab',()=>{
 expect(selected(render('/contest/c/scorecard'))).toEqual(['Scorecard']);
});

// These must fail if the route outlet is lost.
test('/contest/:id/edit renders the child route (Slot), not the tab shell',()=>{
 const t=types(render('/contest/c/edit'));
 expect(t).toContain('Slot');
 expect(t).not.toContain('scorecard');
});
test('/contest/:id/tournament-rounds renders the child route (Slot), not the tab shell',()=>{
 const t=types(render('/contest/c/tournament-rounds'));
 expect(t).toContain('Slot');
 expect(t).not.toContain('scorecard');
});
test('tab selection follows the URL (/games selects Games)',()=>{
 expect(selected(render('/contest/c/games'))).toEqual(['Games']);
});

test.each(['', '/scorecard', '/games', '/settlement', '/leaderboard'])('tab route %s renders the tab chrome around exactly one Slot outlet',suffix=>{
 const t=types(render('/contest/c'+suffix));
 expect(t.filter(x=>x==='Slot')).toHaveLength(1);
 expect(t).toContain('Pressable');
 expect(t.filter(x=>['scorecard','games','settlement','leaderboard'].includes(x))).toEqual([]);
});
test.each(['scorecard','games','settlement','leaderboard'])('selecting %s updates the URL and renders that tab',key=>{
 const router={replace:jest.fn()};
 const start=key==='scorecard'?'/games':'/scorecard';
 const tree=render('/contest/c'+start,router);
 nodes(tree).find(n=>n.props?.accessibilityRole==='tab'&&n.props?.accessibilityLabel.toLowerCase()===key).props.onPress();
 expect(router.replace).toHaveBeenCalledWith('/contest/c/'+key);
 expect(fs.existsSync('app/contest/[id]/'+key+'.tsx')).toBe(true);
 expect(selected(render(router.replace.mock.calls[0][0]))).toEqual([key[0].toUpperCase()+key.slice(1)]);
});
test('reselecting the current tab does not navigate',()=>{
 const router={replace:jest.fn()};
 nodes(render('/contest/c/games',router)).find(n=>n.props?.accessibilityLabel==='Games').props.onPress();
 expect(router.replace).not.toHaveBeenCalled();
});
test.each(['/edit','/tournament-rounds'])('nested route %s has no duplicate round header',suffix=>{
 const tree=render('/contest/c'+suffix);
 expect(nodes(tree).filter(n=>n.props?.testID==='contest-header')).toHaveLength(0);
 expect(types(tree).filter(t=>t==='Slot')).toHaveLength(1);
});
