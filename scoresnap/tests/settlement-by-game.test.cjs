const fs = require('fs'), path = require('path'), ts = require('typescript');
const cache = new Map();
function load(file, dependencies) {
  file = path.resolve(file);
  if (!dependencies && cache.has(file)) return cache.get(file);
  const m = {exports:{}};
  const source = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',source)(id => {
    if (dependencies) { if (id in dependencies) return dependencies[id]; throw Error(id); }
    if (!id.startsWith('.')) throw Error(id);
    return load(path.resolve(path.dirname(file),id + '.ts'));
  },m,m.exports);
  if (!dependencies) cache.set(file,m.exports);
  return m.exports;
}
const engine = load('src/engine/contest-results.ts');
const jsx = (type,props) => typeof type === 'function' ? type(props) : ({type,props});
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n,...nodes(n.props?.children)];
const text = n => n == null ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n.props?.children);
const find = (tree,id) => nodes(tree).find(n=>n.props?.testID===id);
function render(contest,tier='pro') {
  const deps = {react:{useState:v=>[v,()=>{}],useEffect:()=>{}},'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',ScrollView:'ScrollView',Pressable:'Pressable',Share:{}},'expo-router':{useRouter:()=>({}),useLocalSearchParams:()=>({id:'c'})},'lucide-react-native':{},'expo-haptics':{}};
  const extras = {'services/purchases':{},'services/paywall-plans':{},'services/scorecard-pdf':{},'services/share-scorecard-pdf':{},'engine/contest-results':engine,'engine/calculators/skins':load('src/engine/calculators/skins.ts'),'stores/scan-store':{useScanStore:f=>f({tier})},'stores/contest-store':{useContestStore:f=>f({contests:[contest]})},'services/entitlements':{canSeeSettlement:t=>t!=='free'},'ui/recap/RecapCard':{},'ui/recap/model':{buildRecapModel:()=>({})},'ui/LiveShare':{},'ui/copy':{settlementLeader:n=>n},'ui/paywall-copy':{PAYWALL_COPY:{}},'ui/theme':{COLORS:{},FONTS:{},TYPOGRAPHY:{},RADII:{}}};
  for (const [key,value] of Object.entries(extras)) deps['../../../src/'+key]=value;
  deps['../../../src/stores/auth-store'] = { useAuthStore: f => f({ user: { id: 'account-a' }, isAnonymous: false, isInitialized: true, isLoading: false }) };
  deps.zustand = { useStore: (store, selector) => selector(store.getState()) };
  deps['../../../src/stores/settlement-store'] = { settlementMarks: { getState: () => ({ ready: true, ledgers: {} }) } };
  deps['../../../src/stores/settlement-marks'] = { settlementScope: (a,c) => JSON.stringify([a,c]), settlementRevision: () => 'revision', settlementTransactionKeys: rows => rows.map((_,i) => String(i)) };
  return load('app/contest/[id]/settlement.tsx',deps).default();
}
const course = n => ({name:'Course',holes:Array.from({length:n},(_,i)=>({num:i+1,par:4,hcp:i+1}))});
const group = (a,b,id='g') => ({id,name:id,players:[{id:id+'A',name:id==='g'?'A':id+'A',handicap:0,scores:a},{id:id+'B',name:id==='g'?'B':id+'B',handicap:0,scores:b}]});
function fixture(n=9) {return {id:'c',name:'Round',course:course(n),groups:[group([3,3,...Array(n-2).fill(6)],[4,4,...Array(n-2).fill(5)])],games:['stroke_play','skins'],betUnit:2,gameConfig:{rulesVersion:1},status:'completed'};}
function row(tree,game,name) {return text(find(tree,`settlement-game-${game}-player-${name}`));}
function verifyRows(contest) {
 const before=JSON.stringify(contest), aggregate=engine.calculateContestSettlement(contest), tree=render(contest);
 const displayedCents = {};
 [...new Set(contest.games)].forEach((game,i)=>{
   const result=engine.calculateContestSettlement(contest,contest.games.filter(g=>g===game));
   for(const [name,net] of Object.entries(result.netByPlayer)) {
     const expected=result.pending?'Pending':net===0?'Even':`${net>0?'+':'−'}$${Math.abs(net).toFixed(2)}`;
     expect(row(tree,i,name)).toBe(name+expected);
     const rendered = row(tree,i,name).slice(name.length);
     const cents = rendered === 'Even' || rendered === 'Pending' ? 0 : Math.round(Number(rendered.slice(2))*100) * (rendered.startsWith('−') ? -1 : 1);
     displayedCents[name]=(displayedCents[name]??0)+cents;
   }
 });
 if (!aggregate.pending) for (const [name,net] of Object.entries(aggregate.netByPlayer)) expect(displayedCents[name]??0).toBe(Math.round(net*100));
 expect(engine.calculateContestSettlement(contest)).toEqual(aggregate);
 expect(JSON.stringify(contest)).toBe(before);
 return tree;
}
test('different game leaders render each signed player amount, not aggregate leader',()=>{
 const c=fixture();
 // A wins four holes but loses stroke play after one large score.
 c.groups=[group([3,3,3,3,20,4,4,4,4],[4,4,4,4,4,4,4,4,4])];
 const tree=verifyRows(c);
 expect(row(tree,0,'A')).toBe('A−$2.00'); expect(row(tree,0,'B')).toBe('B+$2.00');
 expect(row(tree,1,'A')).toBe('A+$3.00'); expect(row(tree,1,'B')).toBe('B−$3.00');
 expect(text(find(tree,'settlement-player-A'))).toBe('A+$1.00');
 expect(text(find(tree,'settlement-game-0'))).not.toContain('Leader:');
});
test.each([9,18,12])('%i-hole courses show actual length and even ties',n=>{
 const c=fixture(n);c.groups=[group(Array(n).fill(4),Array(n).fill(4))];
 const tree=verifyRows(c);expect(text(find(tree,'settlement-game-0'))).toContain(n+' Holes');
 expect(row(tree,0,'A')).toBe('AEven');expect(row(tree,1,'B')).toBe('BEven');
});
test('zero stake is Even, never negative zero',()=>{const c=fixture();c.betUnit=0;const tree=verifyRows(c);expect(row(tree,0,'A')).toBe('AEven');expect(text(tree)).not.toContain('−$0.00');});
test.each([0,undefined,NaN])('incomplete rules-v1 scores are Pending without fabricated zero amounts (%s)',score=>{
 const c=fixture();c.groups[0].players[0].scores[2]=score;
 const tree=verifyRows(c);expect(find(tree,'settlement-pending')).toBeDefined();
 expect(row(tree,0,'A')).toBe('APending');expect(row(tree,1,'B')).toBe('BPending');
 expect(find(tree,'settlement-session-total')).toBeUndefined();
});
test('all unplayed versioned cards still expose per-game pending, not Even',()=>{
 const c=fixture();c.groups=[group(Array(9).fill(0),Array(9).fill(0))];expect(row(verifyRows(c),0,'A')).toBe('APending');
});
test('one missing event keeps only that game pending; aggregate remains blocked',()=>{
 const c=fixture();c.games=['stroke_play','greenies'];c.gameConfig.inputRulesVersion=1;c.course.holes[0].par=3;
 const tree=verifyRows(c);expect(row(tree,0,'B')).toBe('B+$2.00');expect(row(tree,1,'A')).toBe('APending');expect(find(tree,'settlement-session-total')).toBeUndefined();
});
test.each([undefined,1])('repeated game occurrences retain engine multiplicity (rules %s)',rulesVersion=>{
 const c=fixture();c.gameConfig={rulesVersion};c.games=['stroke_play','stroke_play'];
 const tree=verifyRows(c);expect(row(tree,0,'B')).toBe('B+$4.00');expect(find(tree,'settlement-game-1')).toBeUndefined();expect(text(find(tree,'settlement-player-B'))).toBe('B+$4.00');
});
test('Skins carryover variant uses its own filter and supported rule config',()=>{
 const c=fixture();c.games=['skins','skins_carry'];c.groups=[group([4,3,...Array(7).fill(4)],[4,4,...Array(7).fill(4)])];
 const tree=verifyRows(c);expect(row(tree,0,'A')).toBe('A+$1.00');expect(row(tree,1,'A')).toBe('A+$2.00');
 c.games=['skins_carry','stroke_play'];c.gameConfig.skinsTier='progressive';verifyRows(c);
});
test('multi-round multi-group scoped matches use all courses, not active round or group multiples',()=>{
 const c=fixture();c.games=['match_play'];c.isTournament=true;c.currentRound=2;
 c.rounds=[{id:'r1',number:1,course:course(9),groups:[group(Array(9).fill(3),Array(9).fill(4)),group(Array(9).fill(4),Array(9).fill(3),'x')]},{id:'r2',number:2,course:course(12),groups:[group(Array(12).fill(4),Array(12).fill(3)),group(Array(12).fill(4),Array(12).fill(3),'x')]}];
 c.groups=c.rounds[1].groups;
 const tree=verifyRows(c);expect(text(find(tree,'settlement-game-0'))).toContain('21 Holes');expect(row(tree,0,'A')).toBe('AEven');expect(row(tree,0,'xB')).toBe('xB+$4.00');
 c.currentRound=1;expect(text(verifyRows(c))).toBe(text(tree));
 c.rounds[0].groups[0].players[0].scores[0]=0;expect(row(verifyRows(c),0,'A')).toBe('APending');
});
test('missing round course falls back; legacy tournaments retain aggregate-card scope and partial scores',()=>{
 const c=fixture();c.isTournament=true;c.rounds=[{id:'r1',groups:c.groups},{id:'r2',course:course(12),groups:c.groups}];
 expect(text(find(verifyRows(c),'settlement-game-0'))).toContain('21 Holes');
 c.gameConfig={};c.groups[0].players[0].scores[0]=0;
 const tree=verifyRows(c);expect(text(find(tree,'settlement-game-0'))).toContain('9 Holes');expect(find(tree,'settlement-pending')).toBeUndefined();
});
test('free preview never calculates or exposes per-game money',()=>{
 const c=fixture();c.betUnit=NaN;const tree=render(c,'free');expect(find(tree,'settle-free')).toBeDefined();expect(find(tree,'settlement-game-0')).toBeUndefined();
});

test.each([undefined,1])('duplicate tiny-stake Skins batches preserve exact legacy/v1 cent budget (%s)',rulesVersion=>{
 const c=fixture();c.games=['skins','skins'];c.betUnit=.01;c.gameConfig={rulesVersion};
 c.groups=[group([3,...Array(8).fill(4)],Array(9).fill(4))];
 const tree=verifyRows(c);expect(row(tree,0,'A')).toBe(rulesVersion===1?'A+$0.02':'A+$0.01');expect(find(tree,'settlement-game-1')).toBeUndefined();
});
test.each([undefined,1])('three-player tiny-stake game totals reconcile in cents (%s)',rulesVersion=>{
 for(const betUnit of [.01,.03,2.35]) {
  const c=fixture();c.gameConfig={rulesVersion};c.betUnit=betUnit;c.games=['stroke_play','skins','skins_carry','skins'];
  c.groups=[{id:'g',name:'g',players:['A','B','C'].map((name,i)=>({id:name,name,handicap:0,scores:Array.from({length:9},(_,h)=>h===0&&i===0?3:4)}))}];
  verifyRows(c);
 }
});

test('constituent-only tied/pending players remain visible; legacy does not import round rosters',()=>{
 const c=fixture();c.isTournament=true;c.games=['match_play'];c.groups=[group(Array(9).fill(4),Array(9).fill(4))];
 c.rounds=[{id:'r1',number:1,groups:[group(Array(9).fill(4),Array(9).fill(4),'x')]},{id:'r2',number:2,groups:c.groups}];
 expect(engine.calculateContestSettlement(c).netByPlayer).toEqual({A:0,B:0});
 let tree=verifyRows(c);expect(row(tree,0,'xA')).toBe('xAEven');expect(row(tree,0,'xB')).toBe('xBEven');
 c.rounds[0].groups[0].players[0].scores[0]=0;tree=verifyRows(c);expect(row(tree,0,'xA')).toBe('xAPending');expect(row(tree,0,'A')).toBe('APending');
 c.gameConfig={};tree=verifyRows(c);expect(find(tree,'settlement-game-0-player-xA')).toBeUndefined();
});
