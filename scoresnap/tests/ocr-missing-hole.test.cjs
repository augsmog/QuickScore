const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, imports = {}) {
 const module = {exports:{}};
 const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(id => { if (!(id in imports)) throw Error(id); return imports[id]; },module,module.exports);
 return module.exports;
}
const parser = load('src/services/score-parser.ts');
const review = load('src/services/ocr-review.ts');
let response, recognized;
const cloud = load('src/services/claude-ocr.ts', {'./ocr-review':review,'expo-file-system/legacy':{EncodingType:{Base64:'base64'},readAsStringAsync:async()=> 'mock'},'../db/supabase':{supabase:{functions:{invoke:async()=>response}}}});
const ml = load('src/services/ml-kit-ocr.ts', {'./score-parser':parser,'@react-native-ml-kit/text-recognition':{recognize:async()=>recognized}});
const service = load('src/services/ocr-service.ts', {'./ocr-review':review,'./ml-kit-ocr':ml,'./claude-ocr':cloud});
const raw = (scores=Array(18).fill(4)) => ({name:'Player A',scores,confidence:Array(18).fill(.9),nameConfidence:1});
function geometry(rows) {
 return {text:'fixture',blocks:[{lines:[{elements:rows.flatMap((r,y)=>r.flatMap((text,x)=>text === null ? [] : [{text,frame:{left:x*100,top:y*40,height:20}}]))}]}]};
}
for (const value of [null,undefined,'','-',0,'0',NaN,Infinity,-1,'4x','S',1.5]) {
 test(`invalid gross ${String(value)} stays blank in both normalizers`,async()=>{
  const r=raw([value,5]);response={data:{players:[r]}};
  const p=(await cloud.recognizeWithClaude('x.jpg')).players[0];
  expect(p.scores[0]).toBeNull();expect(p.confidence[0]).toBe(0);expect(p.scores[1]).toBe(5);
  const parsed=parser.parseScoreGrid([['Player A',String(value),'5']]).players[0];
  expect(parsed.scores[0]).toBeNull();expect(parsed.confidence[0]).toBe(0);
 });
}
test('missing arrays, sparse cells and confidence normalize safely', async()=>{
 for(const scores of [undefined,[],new Array(18)]) {
  response={data:{players:[{name:'Player A',scores}]}};
  const p=(await cloud.recognizeWithClaude('x')).players[0];
  expect(p.scores).toEqual(Array(18).fill(null));expect(p.confidence).toEqual(Array(18).fill(0));
 }
 expect(review.normalizePlayer({name:'A',scores:Array(18).fill(4)}).confidence).toEqual(Array(18).fill(0));
 for(const data of ['{}','null','[null]','[{"scores":[]}]','bad']) expect(()=>review.parseReviewData(data)).toThrow();
});
test('hole 7 correction and clearing change subtotal only on entry; quick settle blocks',()=>{
 const r=raw();r.scores[6]=null;const p=review.normalizePlayer(r);
 expect(review.subtotal(p)).toBe(68);expect(p.confidence.filter(c=>c<.7)).toHaveLength(1);
 expect(review.blockingReason([p])).toBe('Hole 7 is blank for Player A');
 const commit=jest.fn();expect(()=>review.commitQuickSettle([p],commit)).toThrow();expect(commit).not.toHaveBeenCalled();
 expect(review.subtotal(p)).toBe(68);
 p.scores[6]=4;expect(review.subtotal(p)).toBe(72);expect(review.blockingReason([p])).toBeNull();
 review.commitQuickSettle([p],commit);expect(commit).toHaveBeenCalledWith([Array(18).fill(4)]);
 p.scores[6]=review.grossScore('');expect(review.subtotal(p)).toBe(68);expect(review.blockingReason([p])).toMatch(/Hole 7/);
});
test('ML geometry preserves interior gap and ignores OUT/IN',async()=>{
 const header=['Hole',...Array.from({length:9},(_,i)=>String(i+1)),'OUT',...Array.from({length:9},(_,i)=>String(i+10)),'IN'];
 const row=['Player A',...Array(9).fill('4'),'36',...Array(9).fill('5'),'45'];row[7]=null;
 recognized=geometry([header,row]);const p=(await ml.recognizeWithMLKit('x')).players[0];
 expect(p.scores).toEqual([...Array(6).fill(4),null,4,4,...Array(9).fill(5)]);
 expect(p.confidence[6]).toBe(0);
});
test('unnumbered ML geometry blocks ambiguous alignment, fallback failure retains blanks',async()=>{
 recognized=geometry([['Player A','4','5','4']]);response={error:{message:'mock failure'}};
 const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
 const result=await service.scanScorecard('x');warn.mockRestore();
 expect(result.players[0].scores).toEqual(Array(18).fill(null));expect(review.blockingReason(result.players)).toMatch(/blank/);
});
for(const first of [1,10]) test(`explicit nine-hole identities ${first} retained without unused blanks`,()=>{
 const p=parser.parseScoreGrid([['Hole',...Array.from({length:9},(_,i)=>String(i+first))],['Player A',...Array(9).fill('4')]]).players[0];
 expect(p.requiredHoles).toEqual(Array.from({length:9},(_,i)=>i+first));expect(p.scores).toEqual(Array(9).fill(4));
 expect(p.confidence.every(c=>c>.7)).toBe(true);expect(review.blockingReason([p])).toMatch(/manual entry/);
 expect(parser.parseScoreGrid([['Player A',...Array(9).fill('4')]]).players[0].scores.slice(9)).toEqual(Array(9).fill(null));
});
// Actual Zustand store, with native persistence/auth/sync mocked. No network.
const zustand=require('zustand');
const store=load('src/stores/contest-store.ts',{
 '../services/ocr-review':review,'../config/auth':{REAL_AUTH_CONFIGURED:false},'./auth-store':{useAuthStore:{getState:()=>({})}},
 '../services/guest-join':{generateJoinCode:()=> 'LOCAL'},zustand,'zustand/middleware':{persist:f=>f,createJSONStorage:()=>({})},
 '@react-native-async-storage/async-storage':{},'../services/tournament-sync':{},
}).useContestStore;
for(const tournament of [false,true]) test(`atomic store batch and corrected engine calculations tournament=${tournament}`,()=>{
 const course={name:'Fixture',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:350}))};
 const players=[{id:'a',name:'Player A',handicap:8,scores:Array(18).fill(5)},{id:'b',name:'Player B',handicap:-2,scores:Array(18).fill(6)}];
 const group={id:'g',name:'G',players};const c={id:'c',course,groups:[group],isTournament:tournament,currentRound:2,rounds:[{id:'r1',number:1,groups:[group]},{id:'r2',number:2,course,groups:[group]}]};
 store.setState({contests:[c]});const before=JSON.stringify(store.getState().contests);
 for(const batch of [ [{playerId:'a',scores:Array(18).fill(4)},{playerId:'b',scores:Array(18).fill(null)}], [{playerId:'x',scores:Array(18).fill(4)}], [{playerId:'a',scores:Array(18).fill(4)},{playerId:'a',scores:Array(18).fill(4)}], [{playerId:'a',scores:Array(18).fill(0)}], [{playerId:'a',scores:new Array(18)}], ...['',NaN,Infinity,-1,'4x'].map(value => [{playerId:'a',scores:Array(18).fill(value)}])]) {
  expect(()=>store.getState().importScores('c','g',batch)).toThrow();expect(JSON.stringify(store.getState().contests)).toBe(before);
 }
 store.getState().importScores('c','g',[{playerId:'a',scores:Array(18).fill(4)}]);
 const after=store.getState().contests[0];const result=(tournament?after.rounds[1].groups:after.groups)[0].players;
 expect(result[0].scores).toEqual(Array(18).fill(4));expect(result[1]).toEqual(players[1]);if(tournament)expect(after.rounds[0]).toEqual(c.rounds[0]);
 const runNode = require('./helpers/run-node.cjs');
 const output=runNode(['--import','tsx','tests/helpers/ocr-calculators.ts',JSON.stringify(result)],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
 expect(output.trim()).toBe('corrected calculators PASS');
});
test('mocked OCR client executable exits successfully',()=>{
 const runNode = require('./helpers/run-node.cjs');
 const output=runNode(['--import','tsx','src/services/__tests__/ocr-client.test.ts'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
 expect(output).toMatch(/Results: \d+ passed, 0 failed/);
});
test('actual review screen renders incomplete and corrected states side by side',()=>{
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
 let data;
 function element(tag){ return ({children,style,accessibilityLabel,accessibilityState,accessibilityRole,...props}) => React.createElement(tag,{
  style: Object.fromEntries(Object.entries(style ?? {}).filter(([key,value])=>!['fontFamily','fontVariant','shadowColor','shadowOffset','shadowOpacity','shadowRadius','elevation'].includes(key) && typeof value !== 'object')),
  'aria-label':accessibilityLabel,'aria-disabled':accessibilityState?.disabled,
  disabled:props.disabled,role:accessibilityRole === 'alert' ? 'alert' : undefined,
 },children); }
 const screen=load('app/scan/review.tsx',{
 react:React,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':{View:element('div'),Text:element('span'),ScrollView:element('div'),Pressable:element('button'),TextInput:element('input'),Modal:()=>null,Image:()=>null,AccessibilityInfo:{announceForAccessibility:()=>{}}},
 'expo-router':{useRouter:()=>({}),useLocalSearchParams:()=>({scanData:data})},
 'react-native-safe-area-context':{SafeAreaView:element('div')},
 'lucide-react-native':Object.fromEntries(['Check','AlertTriangle','Camera','Edit3','UserCheck','HelpCircle','Delete'].map(n=>[n,()=>null])),
 'expo-haptics':{},'../../src/ui/theme':load('src/ui/theme.ts'),
 '../../src/stores/contest-store':{useContestStore:select=>select({contests:[],addContest:()=>{},importScores:()=>{}})},
 '../../src/services/ocr-review':review,'../../src/ui/animations/ConfettiOverlay':{ConfettiOverlay:()=>null},
 }).default;
 const r=raw();r.scores[6]=null;data=JSON.stringify([r]);const incomplete=renderToStaticMarkup(React.createElement(screen));
 expect(incomplete).toContain('Partial: 68');expect(incomplete).toContain('Hole 7 is blank for Player A');
 expect(incomplete).toContain('Player A, hole 7, blank, needs review');expect(incomplete).toContain('disabled=""');
 r.scores[6]=4;data=JSON.stringify([r]);const corrected=renderToStaticMarkup(React.createElement(screen));
 expect(corrected).not.toContain('Partial:');expect(corrected).toContain('>72<');expect(corrected).not.toContain('Hole 7 is blank');
 expect(corrected).toContain('aria-disabled="false"');
 for (const invalid of ['null','[null]','bad']) {
  data=invalid;expect(renderToStaticMarkup(React.createElement(screen))).toMatch(/Malformed|Failed to parse|Invalid/);
 }
 const dir=path.join(__dirname,'../docs');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'ocr-missing-hole-review-evidence.html'),`<!doctype html><meta charset="utf-8"><title>OCR review: incomplete and corrected</title><style>body{font:20px sans-serif;background:#faf4e8}main{display:flex;gap:24px}article{width:48%;border:1px solid #aaa}button{font-size:inherit}span{display:inline-block}</style><p>Actual review component rendered with native host mocks. Device layout and screen-reader verification remain release gates.</p><main><article><h2>Incomplete — hole 7 blank</h2>${incomplete}</article><article><h2>Corrected — hole 7 entered as 4</h2>${corrected}</article></main>`);
});
test('selected front/back course metadata survives camera and pasted route data',async()=>{
 for(const first of [1,10]) {
  const holes=Array.from({length:9},(_,i)=>first+i);
  const players=parser.parseScoreGrid([['Player A',...Array(9).fill('4')]]).players;
  const selected=review.applyCourseHoles(players,holes);
  expect(review.parseReviewData(JSON.stringify(selected))[0].requiredHoles).toEqual(holes);
  expect(selected[0].scores).toEqual(Array(9).fill(4));
  expect(selected[0].confidence).toHaveLength(9);
  response={data:{players:[raw([...Array(9).fill(4),...Array(9).fill(null)])]}};
  recognized={text:'',blocks:[]};
  expect((await service.scanScorecard('x',undefined,holes)).players[0].requiredHoles).toEqual(holes);
 }
 const full=review.applyCourseHoles([review.normalizePlayer(raw())],Array.from({length:9},(_,i)=>i+10));
 expect(full[0].scores).toEqual(Array(18).fill(4));expect(review.blockingReason(full)).toMatch(/do not match/);
});
