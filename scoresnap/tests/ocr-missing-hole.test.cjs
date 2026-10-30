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
const cloud = load('src/services/claude-ocr.ts', {'../stores/settings-store':{useSettingsStore:{getState:()=>({ocrConsent:true})}},'../stores/scan-store':{useScanStore:{getState:()=>({useScan:()=>true})}},'./ocr-review':review,'expo-file-system/legacy':{EncodingType:{Base64:'base64'},readAsStringAsync:async()=> 'mock'},'../db/supabase':{supabase:{functions:{invoke:async()=>response}}}});
const ml = load('src/services/ml-kit-ocr.ts', {'./score-parser':parser,'@react-native-ml-kit/text-recognition':{recognize:async()=>recognized}});
const service = load('src/services/ocr-service.ts', {'../stores/settings-store':{useSettingsStore:{getState:()=>({ocrConsent:true,autoClaude:true})}},'./ocr-review':review,'./ml-kit-ocr':ml,'./claude-ocr':cloud});
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
 expect(result.players[0].name).toBe('Player A');
 expect(result.players[0].scores.slice(0,3)).toEqual([4,5,4]);
 expect(result.players[0].confidence).toEqual(Array(18).fill(0));
 expect(review.blockingReason(result.players)).toMatch(/Ambiguous score alignment/);
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
 '@react-native-async-storage/async-storage':{}, '../services/tournament-sync':{},
 './persisted-keys':{ CONTEST_STORAGE_KEY:'snapscore-contests', createGatedStorage:storage=>storage },
}).useContestStore;
for (const tournament of [false, true]) test(`nine-hole paste import pads unused engine holes with zero tournament=${tournament}`, async () => {
 const holes=Array.from({length:9},(_,i)=>({num:i+1,par:4,hcp:i+1}));
 const course={name:'Nine',holes};
 const group={id:'g',players:[{id:'a',name:'Player A',scores:Array(18).fill(5)}]};
 const c={id:'c',course,groups:[group],isTournament:tournament,currentRound:1,rounds:[{id:'r',number:1,course,groups:[group]}]};
 store.setState({contests:[c]});
 const scores=[4,5,3,4,5,3,4,5,4];
 const text=['Hole,'+Array.from({length:18},(_,i)=>i+1).join(','),'Player A,'+[...scores,...Array(9).fill(0)].join(',')].join('\n');
 const players=review.applyCourseHoles(parser.parseScoreGrid(parser.textToGrid(text)).players,holes.map(h=>h.num));
 expect(players[0].scores).toEqual(scores);
 expect(review.blockingReason(players,false,holes.map(h=>h.num))).toBeNull();
 const expected=[...scores,...Array(9).fill(0)];
 store.getState().importScores('c','g',[{playerId:'a',scores:review.completeScores(players[0].scores,9)}]);
 const after=store.getState().contests[0];
 expect((tournament?after.rounds[0].groups:after.groups)[0].players[0].scores).toEqual(expected);
 // Direct store imports use the same boundary, including nullable unused cells.
 store.getState().importScores('c','g',[{playerId:'a',scores:[...scores,...Array(9).fill(null)]}]);
 const before=JSON.stringify(store.getState().contests);
 players[0].scores[6]=null;
 expect(review.blockingReason(players,false,holes.map(h=>h.num))).toBe('Hole 7 is blank for Player A');
 expect(()=>store.getState().importScores('c','g',[{playerId:'a',scores:players[0].scores}])).toThrow();
 expect(JSON.stringify(store.getState().contests)).toBe(before);
 response={data:{players:[raw([...scores,...Array(9).fill(null)])]}};
 recognized={text:'',blocks:[]};
 const scanned=(await service.scanScorecard('x',undefined,holes.map(h=>h.num))).players;
 expect(review.completeScores(scanned[0].scores,9)).toEqual(expected);
});
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
 '../../src/services/entitlements':load('src/services/entitlements.ts'),'../../src/stores/scan-store':{useScanStore:{getState:()=>({tier:'free'})}},
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
 for (const empty of ['[]','{}','null']) {
  data=empty;
  expect(renderToStaticMarkup(React.createElement(screen))).toContain('Invalid scorecard data: no players found in the scan.');
 }
 data=undefined;
 const missing=renderToStaticMarkup(React.createElement(screen));
 expect(missing).toContain('Invalid Scorecard Data');
 expect(missing).toContain('No scorecard data provided. Please scan a scorecard first.');
 expect(missing).not.toMatch(/Thompson|Chris L/);
 data='{not json';
 expect(renderToStaticMarkup(React.createElement(screen))).toContain('Malformed scorecard data. Please rescan the scorecard.');
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

test('ML collision and offset keep all readings in an explicit alignment block', async()=>{
 for (const offset of [0,45]) {
  recognized=geometry([['Hole',...Array.from({length:18},(_,i)=>String(i+1))],['Player A','4','5','6']]);
  const elements=recognized.blocks[0].lines[0].elements;
  elements[elements.length-1].frame.left=offset ? 300+offset : 200;
  const p=(await ml.recognizeWithMLKit('x')).players[0];
  expect(p.name).toBe('Player A');expect(p.alignmentError).toContain('Readings: 4, 5, 6');
  expect(p.confidence.every(c=>c===0)).toBe(true);
 }
});
test('exact-name matching rejects ambiguous names and reserved targets',()=>{
 expect(review.autoMatchPlayers([review.normalizePlayer({...raw(),name:'aUgIe'})],[{id:'a',name:'Augie'}])[0].matchedPlayerId).toBe('a');
 const rows=['Augie','augie','Other'].map(name=>review.normalizePlayer({...raw(),name}));
 expect(review.autoMatchPlayers(rows,[{id:'a',name:'Augie'}]).every(p=>p.matchedPlayerId===null)).toBe(true);
 expect(review.autoMatchPlayers([rows[0]],[{id:'a',name:'Augie'},{id:'b',name:'AUGIE'}])[0].matchedPlayerId).toBeNull();
 expect(review.autoMatchPlayers([rows[0],{...rows[2],matchedPlayerId:'a'}],[{id:'a',name:'Augie'}])[0].matchedPlayerId).toBeNull();
});
for (const partial of [false,true]) test(`real two-group smoke imports and keeps invalid mappings blocking partial=${partial}`,()=>{
 const names=['Augie','Sam','Lee','Pat'];
 const scores=[[5,6,4,3,5,4,4,6,5,4,5,3,6,4,5,3,5,4],... [4,5,6].map(n=>Array(18).fill(n))];
 if(partial) scores.forEach(row=>row.fill(0,9));
 const targets=names.map((name,i)=>({id:String(i),name,handicap:[18,0,9,0][i],scores:Array(18).fill(0)}));
 const contest={id:'smoke',course:{holes:Array.from({length:18},(_,i)=>({num:i+1,par:4}))},groups:[{id:'g',name:'Group 1',players:targets.slice(0,2)},{id:'other',name:'Group 2',players:targets.slice(2)}]};
 store.setState({contests:[contest]});
 const url=new URL('http://localhost/scan/review?contestId=smoke&scanData='+encodeURIComponent(JSON.stringify(names.map((name,i)=>({...raw(scores[i]),source:partial?'paste':'ocr',name,matchedPlayerId:null})))));
 const replace=jest.fn();
 let states=[],cursor=0;
 const jsx=(type,props)=>({type,props});
 const hooks={useState:init=>{const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useMemo:fn=>fn(),useEffect:()=>{}};
 const screen=load('app/scan/review.tsx',{
 '../../src/services/entitlements':load('src/services/entitlements.ts'),'../../src/stores/scan-store':{useScanStore:{getState:()=>({tier:'free'})}},
 react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':Object.fromEntries(['View','Text','ScrollView','Pressable','TextInput','Modal','Image'].map(n=>[n,n])),
 'expo-router':{useRouter:()=>({replace}),useLocalSearchParams:()=>Object.fromEntries(url.searchParams)},
 'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'lucide-react-native':{},
 'expo-haptics':{notificationAsync:()=>{},NotificationFeedbackType:{Success:'success'}},'../../src/ui/theme':load('src/ui/theme.ts'),
 '../../src/stores/contest-store':{useContestStore:select=>select(store.getState())},
 '../../src/services/ocr-review':review,'../../src/ui/animations/ConfettiOverlay':{ConfettiOverlay:'Confetti'},
 }).default;
 let nodes;
 const render=()=>{cursor=0;nodes=[];const walk=n=>{if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}nodes.push(n);walk(n.props?.children);};walk(screen());};
 const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):text(n?.props?.children??'');
 const button=label=>nodes.filter(n=>n.type==='Pressable' && text(n)===label).at(-1);
 const target=name=>nodes.find(n=>n.type==='Pressable' && text(n).includes('HCP ') && text(n).includes(name));
 const confirm=()=>nodes.find(n=>n.type==='Pressable' && text(n).startsWith('Confirm'));
 if(partial) {
  const pasted=parser.parseScoreGrid(parser.textToGrid(names.map((name,i)=>[name,...scores[i]].join(',')).join('\n')),undefined,'paste').players;
  expect(pasted.map(p=>p.scores)).toEqual(scores);
  expect(pasted.every(p=>p.confidence.every(c=>c===.95))).toBe(true);
  url.searchParams.set('scanData',JSON.stringify(pasted));
 }
 render();expect(confirm().props.disabled).toBeFalsy();
 expect(nodes.some(n=>n.props?.accessibilityLabel==='Lee: Not imported — belongs to Group 2')).toBe(true);
 // Rematch Sam to Augie: duplicate must block but remain recoverable.
 nodes.filter(n=>n.type==='Pressable'&&text(n)==='Rematch')[1].props.onPress();render();
 target('Augie').props.onPress();render();expect(confirm().props.disabled).toBeTruthy();
 expect(nodes.filter(n=>n.type==='Pressable'&&text(n)==='Rematch')).toHaveLength(4);
 nodes.filter(n=>n.type==='Pressable'&&text(n)==='Rematch')[1].props.onPress();render();
 expect(target('Lee')).toBeUndefined();
 nodes.find(n=>n.props?.accessibilityLabel==='Clear player match').props.onPress();render();
 expect(confirm().props.disabled).toBeTruthy();button('Match').props.onPress();render();target('Sam').props.onPress();render();
 expect(confirm().props.disabled).toBeFalsy();confirm().props.onPress();
 expect(store.getState().contests[0].groups[0].players.map(p=>p.scores)).toEqual(scores.slice(0,2));
 expect(store.getState().contests[0].groups[1].players).toEqual(targets.slice(2));
 render();nodes.find(n=>n.type==='Confetti').props.onDone();
 expect(replace).toHaveBeenLastCalledWith('/contest/smoke');
 // Reopen the same null-ID card, then use the real Group 2 selector.
 states=[];render();button('Group 2').props.onPress();render();
 expect(confirm().props.disabled).toBeFalsy();
 expect(nodes.some(n=>n.props?.accessibilityLabel==='Augie: Not imported — belongs to Group 1')).toBe(true);
 confirm().props.onPress();render();nodes.find(n=>n.type==='Confetti').props.onDone();
 expect(replace).toHaveBeenCalledTimes(2);
 expect(replace).toHaveBeenLastCalledWith('/contest/smoke');
 expect(store.getState().contests[0].groups.flatMap(g=>g.players.map(p=>p.scores))).toEqual(scores);
 // Unmatched rows and even excluded rows with missing holes still block.
 for(const mutate of [rows=>{rows[0].scores[2]=0;},rows=>{rows[2].name='Unknown';},rows=>{rows[2].scores[6]=null;},rows=>{rows[3].name='Lee';}]) {
  const rows=JSON.parse(url.searchParams.get('scanData'));mutate(rows);
  url.searchParams.set('scanData',JSON.stringify(rows));states=[];render();
  expect(confirm().props.disabled).toBeTruthy();
  expect(nodes.some(n=>n.props?.accessibilityRole==='alert' && text(n))).toBe(true);
  expect(store.getState().contests[0].groups.flatMap(g=>g.players.map(p=>p.scores))).toEqual(scores);
  url.searchParams.set('scanData',JSON.stringify(names.map((name,i)=>({...raw(scores[i]),source:partial?'paste':'ocr',name,matchedPlayerId:null}))));
 }
 // A supplied wrong-group mapping also keeps controls available for recovery.
 const wrong=JSON.parse(url.searchParams.get('scanData'));wrong[0].matchedPlayerId='2';wrong[2].matchedPlayerId='2';
 url.searchParams.set('scanData',JSON.stringify(wrong));states=[];render();
 expect(confirm().props.disabled).toBeTruthy();
 nodes.filter(n=>n.type==='Pressable'&&text(n)==='Rematch')[0].props.onPress();render();
 target('Augie').props.onPress();render();expect(confirm().props.disabled).toBeFalsy();
});

test('OCR trailing zeros remain blank and blocked in both paths',async()=>{
 const scores=[...Array(9).fill(4),...Array(9).fill(0)];
 response={data:{players:[{...raw(scores),source:'paste'}]}};
 const cloudPlayer=(await cloud.recognizeWithClaude('x')).players[0];
 recognized=geometry([['Hole',...Array.from({length:18},(_,i)=>String(i+1))],['Player A',...scores.map(String)]]);
 const mlPlayer=(await ml.recognizeWithMLKit('x')).players[0];
 for(const p of [cloudPlayer,mlPlayer]) {
  expect(p.scores.slice(9)).toEqual(Array(9).fill(null));
  expect(p.confidence.slice(9)).toEqual(Array(9).fill(0));
  expect(review.blockingReason([p])).toMatch(/Hole 10 is blank/);
 }
});
