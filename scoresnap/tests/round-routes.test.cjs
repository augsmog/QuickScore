const fs=require('fs'),ts=require('typescript');
const jsx=(type,props)=>({type,props});
function render({canGoBack=false,hasContest=true}={}){
 const back=jest.fn(),replace=jest.fn();
 const stateValues=[];
 const contest=hasContest?{id:'c',name:'Round',course:{name:'Course'},groups:[],status:'completed'}:undefined;
 const deps={
  react:{useState:v=>{let value=v;stateValues.push(()=>value);return [v,next=>{value=typeof next==='function'?next(value):next}]},useCallback:f=>f},
  'react/jsx-runtime':{jsx,jsxs:jsx},
  'react-native':{View:'View',Text:'Text',Pressable:'Pressable',Dimensions:{get:()=>({width:390,height:844})}},
  'expo-router':{Slot:'Slot',usePathname:()=>'/contest/c',useLocalSearchParams:()=>({id:'c'}),useRouter:()=>({back,replace,canGoBack:()=>canGoBack})},
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
  '../../../src/stores/contest-store':{useContestStore:f=>f({contests:contest?[contest]:[]})},
  '../../../src/ui/AnimatedPressable':{AnimatedPressable:'Pressable'},
 };
 const m={exports:{}};
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync('app/contest/[id]/_layout.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(id=>{if(!(id in deps))throw Error(id);return deps[id]},m,m.exports);
 return {tree:m.exports.default(),back,replace,statusOpen:()=>stateValues[0]()};
}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
test('contest layout renders its current tab through the Slot outlet (AUG-1125: navigator stays mounted)',()=>{
 const {tree}=render();
 expect(nodes(tree).filter(n=>n.type==='Slot')).toHaveLength(1);
 expect(nodes(tree).some(n=>n.type==='scorecard')).toBe(false);
});
test.each([['scorecard','Scorecard'],['leaderboard','Leaderboard'],['games','Games'],['settlement','Settlement']])('tab %s is present in the shared round header',(tab,label)=>{
 const {tree}=render();
 expect(nodes(tree).find(n=>n.props?.accessibilityRole==='tab'&&n.props?.accessibilityLabel===label)).toBeDefined();
});
test('round status chip opens the mounted status sheet',()=>{
 const {tree,statusOpen}=render();
 const sheet=nodes(tree).find(n=>n.type==='RoundStatusSheet');
 expect(sheet.props.visible).toBe(false);
 nodes(tree).find(n=>n.props?.testID==='round-status-chip').props.onPress();
 expect(statusOpen()).toBe(true);
});
test('organizer invite stays in the visible shared round layout outside the hidden status sheet',()=>{
 const {tree}=render();
 const header=nodes(tree).find(n=>n.props?.testID==='contest-header');
 const invite=nodes(tree).find(n=>n.type==='ContestJoinCode');
 expect(invite).toBeDefined();
 expect(nodes(header)).not.toContain(invite);
 expect(nodes(tree).filter(n=>n.type==='ContestJoinCode')).toHaveLength(1);
 expect(nodes(tree).indexOf(invite)).toBeLessThan(nodes(tree).findIndex(n=>n.type==='Slot'));
});
test.each([true,false])('round Back delegates to router history (%s)',canGoBack=>{
 const {tree,back,replace}=render({canGoBack});
 nodes(tree).find(n=>n.type==='Pressable'&&n.props?.onPress).props.onPress();
 expect(back).toHaveBeenCalledTimes(1);
 expect(replace).not.toHaveBeenCalled();
});
test.each([true,false])('missing-contest Back uses history or Home (%s)',canGoBack=>{
 const {tree,back,replace}=render({canGoBack,hasContest:false});
 nodes(tree).find(n=>n.type==='Pressable'&&n.props?.onPress).props.onPress();
 expect(canGoBack?back:replace).toHaveBeenCalledWith(...(canGoBack?[]:['/']));
});
