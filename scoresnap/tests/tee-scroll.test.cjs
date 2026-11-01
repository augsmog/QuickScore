const fs = require('fs'), vm = require('vm'), ts = require('typescript');
const read = f => fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8');
function render() {
 const tees = Array.from({length:16}, (_,i)=>({name:`Tee ${i+1}`,totalYards:6000}));
 const course = {name:'Piping Rock Club',url:'https://www.golfcore.org/test',teeBoxes:tees,holes:18};
 const states=[false,'','','',true,'',[],false,course,tees[15],'',null,false];
 let i=0; const setters=states.map(()=>jest.fn());
 const deps={react:{useState:()=>{const n=i++;return [states[n],setters[n]]},useCallback:f=>f,useRef:()=>({current:null}),useEffect:()=>{}},'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'react-native':new Proxy({Platform:{OS:'ios'}},{get:(o,k)=>o[k]||k}),'lucide-react-native':{},'./theme':{COLORS:{}},'../services/course-api':{teeBoxToCourse:()=>({holes:[]})}};
 const exports={}; vm.runInNewContext(ts.transpileModule(read('src/ui/CourseSearch.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>{if(n==='./SafeScreen')return {SheetSurface:'View',FullScreenSheet:'Modal'};if(!(n in deps))throw Error(n);return deps[n]}});
 return {tree:exports.default({onSelect:jest.fn()}),setters,tees};
}
function walk(n,a=[]) {if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(v=>walk(v,a));return [{n,a},...walk(n.props?.children,[...a,n])];}
test('16 tees and confirm are reachable through a bounded iOS bottom-sheet scroll container',()=>{
 const {tree,setters,tees}=render(), all=walk(tree);
 const last=all.find(({n})=>n.type==='Text'&&Array.isArray(n.props.children)&&n.props.children[0]==='Tee 16');expect(last).toBeDefined();
 const scroll=last.a.find(n=>n.type==='ScrollView');expect(scroll).toBeDefined();
 expect(scroll.props.style.flex).toBe(1);expect(scroll.props.nestedScrollEnabled).toBe(true);
 expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');expect(scroll.props.contentContainerStyle.paddingBottom).toBeGreaterThanOrEqual(32);
 expect(last.a.some(n=>n.type==='Modal')).toBe(true);
 [...last.a].reverse().find(n=>n.type==='Pressable').props.onPress();expect(setters[9]).toHaveBeenCalledWith(tees[15]);
 expect(all.some(({n,a})=>n.type==='Pressable'&&n.props.onPress?.name==='handleConfirmTee'&&a.includes(scroll))).toBe(true);
});
test('all three wizard steps use bounded nested scrolling with navigation outside the viewport',()=>{
 const s=read('app/contest/new.tsx'),start=s.indexOf('<ScrollView'),end=s.indexOf('</ScrollView>',start),opening=s.slice(start,s.indexOf('>',start)+1);
 expect(opening).toContain('flex: 1');expect(opening).toContain('nestedScrollEnabled');
 for(const step of [1,2,3])expect(s.slice(start,end)).toContain(`step === ${step}`);
 expect(s.indexOf('setStep(step + 1)',end)).toBeGreaterThan(end);
});
