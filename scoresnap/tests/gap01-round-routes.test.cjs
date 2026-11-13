// AUG-1115: regression for GAP-01 (round edit / "Add a game" / tournament routes).
// Contract: /contest/:id/edit and /contest/:id/tournament-rounds must render their own
// screens, not the shared tab shell, and tab selection must follow the URL.
// KNOWN-OPEN on main: the GAP-01 fix (08e717f, AUG-314) is not on main, so the URL-driven
// cases are `test.failing`. When the layout is fixed they will flip red -> change to `test`.
const fs=require('fs'),ts=require('typescript');
const jsx=(type,props)=>({type,props});
const LAYOUT='app/contest/[id]/_layout.tsx';
function render(pathname){
 const deps={
  react:{useState:v=>[v,()=>{}],useCallback:f=>f},
  'react/jsx-runtime':{jsx,jsxs:jsx},
  'react-native':{View:'View',Text:'Text',Pressable:'Pressable',Dimensions:{get:()=>({width:390,height:844})}},
  'expo-router':{Slot:'Slot',usePathname:()=>pathname,useLocalSearchParams:()=>({id:'c'}),useRouter:()=>({back(){},replace(){},push(){},canGoBack:()=>true})},
  'lucide-react-native':{},'expo-haptics':{},
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
 };
 const m={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(LAYOUT,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(id=>{if(!(id in deps))throw Error(id);return deps[id]},m,m.exports);
 return m.exports.default();
}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const types=t=>nodes(t).map(n=>n.type);
const selected=t=>nodes(t).filter(n=>n.props?.accessibilityRole==='tab'&&n.props?.accessibilityState?.selected).map(n=>n.props.accessibilityLabel);

// Passing guards on current main: the routes exist and are linked.
test('route files for edit and tournament-rounds exist',()=>{
 expect(fs.existsSync('app/contest/[id]/edit.tsx')).toBe(true);
 expect(fs.existsSync('app/contest/[id]/tournament-rounds.tsx')).toBe(true);
});
test('"Add a game" in Games navigates to the round edit route',()=>{
 expect(fs.readFileSync('app/contest/[id]/games.tsx','utf8')).toMatch(/router\.push\(`\/contest\/\$\{id\}\/edit`\)/);
});
test('round tab URL contract: scorecard is the default tab',()=>{
 expect(selected(render('/contest/c/scorecard'))).toEqual(['Scorecard']);
});

// Open GAP-01 cases (fail on main today; see header).
test.failing('/contest/:id/edit renders the child route (Slot), not the tab shell',()=>{
 const t=types(render('/contest/c/edit'));
 expect(t).toContain('Slot');
 expect(t).not.toContain('scorecard');
});
test.failing('/contest/:id/tournament-rounds renders the child route (Slot), not the tab shell',()=>{
 const t=types(render('/contest/c/tournament-rounds'));
 expect(t).toContain('Slot');
 expect(t).not.toContain('scorecard');
});
test.failing('tab selection follows the URL (/games selects Games)',()=>{
 expect(selected(render('/contest/c/games'))).toEqual(['Games']);
});
