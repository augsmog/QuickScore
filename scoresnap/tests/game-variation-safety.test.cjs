const runNode=require('./helpers/run-node.cjs');
function check(source){runNode(['--import','tsx','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 const c=await import('./src/engine/calculators/index.ts').then(m=>m.default??m);
 const t=await import('./src/engine/types.ts').then(m=>m.default??m);
 const {calculateSettlement}=await import('./src/engine/settlement.ts').then(m=>m.default??m);
 const course={name:'Rules',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
 const players=['A','B','C','D'].map((name,i)=>({id:name,name,team:i<2?'Red':'Blue',handicap:0,scores:Array(18).fill(i===0?3:5)}));
 const rules={rulesVersion:1,skinsMode:'gross'};
 ${source}
 `]);}
test('registry derives count without aliases or hidden rules',()=>check(`
 assert.equal(t.PLAYABLE_BASE_GAME_IDS.length,30);
 assert.equal(t.PLAYABLE_OPTION_IDS.length,26);
 assert.equal(t.PLAYABLE_FORMAT_IDS.length,1);
 assert.equal(t.PLAYABLE_GAME_COUNT,57);
 assert.equal(new Set(t.PLAYABLE_OPTION_IDS).size,t.PLAYABLE_OPTION_IDS.length);
 assert.equal(t.GAME_VARIATIONS.length,25);
 assert.equal(t.HIDDEN_VARIATIONS.length,2);
 for(const id of ['bbb_chip_in_triple','nassau_auto_press']) assert.ok(t.HIDDEN_VARIATIONS.some(v=>v.id===id));
 for(const id of ['wolf','hammer','snake','greenies','bingo_bango_bongo','alternate_shot','chapman']) assert.ok(t.isGameImplemented(id));
`));
test('each selectable variation config key is actually read by an engine calculator',()=>{
 const fs=require('node:fs'),ts=require('typescript');
 const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/engine/types.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(()=>({FREE_GAMES:[]}),mod,mod.exports);
 const engine=fs.readdirSync('src/engine/calculators').filter(f=>f.endsWith('.ts')).map(f=>fs.readFileSync('src/engine/calculators/'+f,'utf8')).join('\n')+fs.readFileSync('src/engine/actual-inputs.ts','utf8')+fs.readFileSync('src/engine/settlement.ts','utf8');
 for(const v of mod.exports.GAME_VARIATIONS) expect(engine).toMatch(new RegExp('(?:config|gameConfig)\\??\\.'+v.configKey+'\\b'));
 expect(fs.readFileSync('app/contest/new.tsx','utf8')).toContain('GAME_VARIATIONS.filter');
});
test('saved hidden flags remain ignored and legacy variations never change money',()=>check(`
 const hidden=Object.fromEntries(t.HIDDEN_VARIATIONS.map(v=>[v.configKey,v.configValue]));
 for(const id of ['skins','skins_carry','stableford','rabbit','sixes']) {
  assert.deepEqual(calculateSettlement(players,course,[id],.03,undefined,hidden),calculateSettlement(players,course,[id],.03,undefined,{}));
  assert.deepEqual(calculateSettlement(players,course,[id],.03,undefined,{...hidden,rulesVersion:1}),calculateSettlement(players,course,[id],.03,undefined,{rulesVersion:1}));
 }
`));
test('progressive ties retain 171 unresolved units; last tie is never awarded',()=>check(`
 players.forEach(p=>p.scores.fill(4));
 const r=c.calcSkins(players,course,true,'gross',{...rules,skinsTier:'progressive'});
 assert.equal(r.remaining,171);assert.ok(Object.values(r.totals).every(n=>n===0));
 assert.ok(Object.values(calculateSettlement(players,course,['skins_carry'],5,undefined,{...rules,skinsTier:'progressive'}).netByPlayer).every(n=>n===0));
`));
test('tier boundaries and current-hole-only gross birdie multiplier',()=>check(`
 players.forEach(p=>p.scores.fill(4));players[0].scores[12]=3;
 const r=c.calcSkins(players,course,true,'gross',{...rules,skinsTier:'tiered',birdieMultiplier:true});
 assert.equal(r.totals.A,24); // 6*1 + 6*2 carried, plus current 3*2
`));
test('validation failure returns original units without multiplying carried bonuses',()=>check(`
 players.forEach(p=>p.scores.fill(4));players[0].scores[1]=3;players[0].scores[2]=5;players[2].scores[2]=3;
 const r=c.calcSkins(players,course,true,'gross',{...rules,birdieMultiplier:true,validationRule:true});
 assert.equal(r.totals.A,0);assert.equal(r.totals.C,4); // original 2 + winning birdie 2, next par validates
`));
test('validation pending stays unpaid, final-hole award is exempt',()=>check(`
 players.forEach(p=>p.scores.fill(0));players.forEach(p=>p.scores[0]=4);players.forEach(p=>p.scores[1]=5);players[0].scores[1]=3;
 const r=c.calcSkins(players,course,true,'gross',{...rules,validationRule:true});
 assert.equal(r.skins[1].winner,'Pending');assert.equal(r.remaining,2);assert.equal(r.totals.A,0);
 assert.equal(calculateSettlement(players,course,['skins_carry'],5,undefined,{...rules,validationRule:true}).pending,true);
 players.forEach(p=>p.scores.fill(4));players[0].scores[17]=3;
 assert.equal(c.calcSkins(players,course,true,'gross',{...rules,validationRule:true}).totals.A,18);
`));
test('team skins splits partners and rejects unequal pairs',()=>check(`
 const r=c.calcSkins(players,course,false,'gross',{...rules,teamSkins:true});
 assert.equal(r.totals.A,9);assert.equal(r.totals.B,9);assert.equal(r.totals.C,0);
 assert.throws(()=>c.calcSkins(players.slice(0,3),course,false,'gross',{...rules,teamSkins:true}),/pairs/);
 const s=calculateSettlement(players,course,['skins'],.01,undefined,{...rules,teamSkins:true});
 assert.equal(s.netByPlayer.A+s.netByPlayer.B,.09);
`));
test('new rules reject invalid currency, duplicate names, conflicting presets and dependencies',()=>check(`
 for(const amount of [-1,NaN,Infinity,.001]) assert.throws(()=>calculateSettlement(players,course,['skins'],amount,undefined,rules));
 assert.throws(()=>calculateSettlement(players.map(p=>({...p,name:'Same'})),course,['skins'],5,undefined,rules),/unique/);
 assert.throws(()=>calculateSettlement(players,course,['skins','skins_carry'],5,undefined,rules),/preset/);
 assert.throws(()=>calculateSettlement(players,course,['vegas'],5,undefined,{...rules,birdieBlocksBirdie:true}),/requires/);
 assert.ok(Object.values(calculateSettlement(players,course,['skins'],0,undefined,rules).netByPlayer).every(n=>n===0));
`));
test('Barracuda negative points and tied leaders push, custom table stays distinct',()=>check(`
 players.forEach(p=>p.scores.fill(6));
 assert.equal(c.calcStableford(players,course,{...rules,modifiedStableford:true})[0].points,-54);
 assert.ok(Object.values(calculateSettlement(players,course,['stableford'],5,undefined,{...rules,modifiedStableford:true}).netByPlayer).every(n=>n===0));
 players[0].scores.fill(4);assert.equal(c.calcStableford(players,course,{...rules,modifiedStableford:true})[0].points,0);
 assert.notDeepEqual(c.calcModStableford(players,course),c.calcStableford(players,course,{...rules,modifiedStableford:true}));
`));
test('Vegas both eagles cancel, both birdies block, digit cap preserves actual natural scores',()=>check(`
 players.forEach(p=>p.scores.fill(4));players[0].scores[0]=2;players[2].scores[0]=2;
 assert.deepEqual(c.calcVegas(players.slice(0,2),players.slice(2),course,rules),c.calcVegas(players.slice(0,2),players.slice(2),course,{...rules,eagleDoubles:true,birdieFlip:true}));
 players[0].scores[0]=10;players[1].scores[0]=11;
 assert.equal(c.calcVegas(players.slice(0,2),players.slice(2),course,rules).holes[0].t1,99);
`));
test('Nassau press starts next hole, inheritance is once and Aloha stays half base',()=>check(`
 const {calcNassauRules}=await import('./src/engine/calculators/nassau.ts').then(m=>m.default??m);
 const r=calcNassauRules(players.slice(0,2),course,true,{...rules,nassauWeights:[1,1,2],pressThePress:true,alohaPressOn18:true});
 assert.equal(r.bets.find(b=>b.parent==='front').start,3);
 assert.ok(r.bets.filter(b=>b.id.startsWith('overall')).every(b=>b.stake===2));
 assert.equal(r.bets.find(b=>b.id==='aloha').stake,.5);
 assert.ok(r.bets.every(b=>b.start<=b.end));
 assert.deepEqual(r,calcNassauRules(players.slice(0,2),course,true,{...rules,nassauWeights:[1,1,2],pressThePress:true,alohaPressOn18:true}));
`));
test('two-pair Nassau splits a side stake equally',()=>check(`
 const {calcNassauRules}=await import('./src/engine/calculators/nassau.ts').then(m=>m.default??m);
 const r=calcNassauRules(players,course,false,rules);
 assert.equal(r.totals.A,1.5);assert.equal(r.totals.B,1.5);assert.equal(r.totals.C,-1.5);
 const money=calculateSettlement(players,course,['nassau'],5,undefined,rules);
 assert.deepEqual(money.netByPlayer,{A:7.5,B:7.5,C:-7.5,D:-7.5});
`));
test('Rabbit overall retains front holder when back nine has no unique low',()=>check(`
 players.forEach(p=>p.scores.fill(4));players[0].scores[0]=3;
 const r=c.calcRabbit(players,course,{...rules,doubleRabbit:true});
 assert.equal(r.front9Holder,'A');assert.equal(r.back9Holder,'');assert.equal(r.totals.A,6);
`));
test('net Match uses relative course handicaps and leaves Skins radio canonical',()=>check(`
 const pair=players.slice(0,2);pair[0].scores.fill(4);pair[1].scores.fill(5);pair[1].handicap=36;
 assert.equal(c.calcMatchPlay(pair[0],pair[1],course,{...rules,netHandicap:true}).finalStatus,-18);
 assert.deepEqual(c.calcSkins(pair,course,false,'gross',{...rules,netHandicap:true}),c.calcSkins(pair,course,false,'gross'));
`));
test('two groups settle independent Nassau bets without payments crossing groups',()=>check(`
 const groups=['g1','g2'].map((name,g)=>({name,players:players.slice(0,2).map(p=>({...p,id:p.id+g,name:p.name+g}))}));
 const all=groups.flatMap(g=>g.players);
 const s=calculateSettlement(all,course,['nassau_press'],.01,undefined,{...rules,alohaPressOn18:true},groups);
 for(const tr of s.transactions) assert.equal(tr.from.slice(-1),tr.to.slice(-1));
 assert.deepEqual(s,calculateSettlement(all,course,['nassau_press'],.01,undefined,{...rules,alohaPressOn18:true},groups));
`));
test('staged listing uses only final copy count; internal inventory retains exported count',()=>check(`
 const fs=await import('node:fs');
 assert.ok(fs.readFileSync('../GAMES_STATUS.md','utf8').includes(t.PLAYABLE_GAME_COUNT+' ways to play'));
 const draft=fs.readFileSync('docs/APP_STORE_LISTING.md','utf8');
 assert.doesNotMatch(draft,/ways to play/i);
 assert.ok(draft.includes('50+ game modes'));
 assert.doesNotMatch(draft.replaceAll('50+ game modes',''),/\\d+\\s*\\+?\\s*(game|games|mode|modes|ways to play|ways)/i);
`));
