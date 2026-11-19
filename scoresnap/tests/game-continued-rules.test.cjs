const runNode=require('./helpers/run-node.cjs');
function check(source){runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
const {calculateSettlement}=await import('./src/engine/settlement.ts').then(m=>m.default??m);
const {actualInputLedger}=await import('./src/engine/actual-inputs.ts').then(m=>m.default??m);
const {calculateContestSettlement,scopeKey}=await import('./src/engine/contest-results.ts').then(m=>m.default??m);
const validation=await import('./src/engine/contest-validation.ts').then(m=>m.default??m);
const c=await import('./src/engine/calculators/index.ts').then(m=>m.default??m);
const course={name:'Rules',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:100}))};
const players=['A','B','C','D'].map((name,i)=>({id:name,name,team:i<2?'Red':'Blue',handicap:4,scores:Array(18).fill(4)}));
const config={rulesVersion:1,inputRulesVersion:1};
const holes=value=>Object.fromEntries(course.holes.map(h=>[h.num,typeof value==='function'?value(h.num):structuredClone(value)]));
const balanced=r=>{assert.ok(Math.abs(Object.values(r.netByPlayer).reduce((a,b)=>a+b,0))<1e-8);for(const t of r.transactions)assert.ok(Number.isSafeInteger(Math.round(t.amount*100)) && Math.abs(t.amount*100-Math.round(t.amount*100))<1e-8);};
${source}
`]);}
test('Wolf blind and Pig are alternative per-opponent rates with pre-play validation',()=>check(`
 players[0].scores[0]=3;const aux={wolf:holes(h=>({isLoneWolf:false,partnerId:players[h%4].id}))};aux.wolf[1]={partnerId:null,isLoneWolf:true,beforePlay:true};
 assert.equal(actualInputLedger('wolf',players,course,aux,config).totals.A,6);
 aux.wolf[1].blind=true;
 assert.equal(actualInputLedger('wolf',players,course,aux,config).pending,true);
 const blind={...config,blindWolf:true};assert.equal(actualInputLedger('wolf',players,course,aux,blind).totals.A,9);
 balanced(calculateSettlement(players,course,['wolf'],.03,aux,blind));
 aux.wolf[1]={partnerId:'B',isLoneWolf:false,refused:true,beforePlay:true};const pig={...config,pigVariation:true};
 assert.equal(actualInputLedger('wolf',players,course,aux,pig).totals.A,12);
 balanced(calculateSettlement(players,course,['wolf'],.01,aux,pig));
 players[0].scores[0]=5;assert.equal(actualInputLedger('wolf',players,course,aux,pig).totals.A,-12);
 aux.wolf[1].blind=true;assert.equal(actualInputLedger('wolf',players,course,aux,{...pig,blindWolf:true}).pending,true);
`));
test('Wolf carryover stacks tied stakes, terminal ties pay nothing, missing choices stop prefix',()=>check(`
 const aux={wolf:holes({isLoneWolf:true,partnerId:null})};players[1].scores[1]=3;
 const base=actualInputLedger('wolf',players,course,aux,config),carry=actualInputLedger('wolf',players,course,aux,{...config,wolfCarryover:true});
 assert.equal(base.totals.B,6);assert.equal(carry.totals.B,12);
 assert.notDeepEqual(calculateSettlement(players,course,['wolf'],.03,aux,config),calculateSettlement(players,course,['wolf'],.03,aux,{...config,wolfCarryover:true}));
 players[1].scores[1]=4;assert.ok(Object.values(actualInputLedger('wolf',players,course,aux,{...config,wolfCarryover:true}).totals).every(n=>n===0));
`));
test('Snake progressive uses chronological ownership changes, including par three-putts',()=>check(`
 const aux={snake:holes([])};aux.snake[1]=['B','A'];aux.snake[2]=['C'];
 const base=actualInputLedger('snake',players,course,aux,config),progressive=actualInputLedger('snake',players,course,aux,{...config,progressiveSnake:true});
 assert.equal(base.totals.C,-3);assert.equal(progressive.totals.C,-12);
 aux.snake[1]=['A','B'];assert.notDeepEqual(progressive,actualInputLedger('snake',players,course,aux,{...config,progressiveSnake:true}));
 balanced(calculateSettlement(players,course,['snake'],.03,aux,{...config,progressiveSnake:true}));
`));
test('BBB categories support no award, birdie bonus is category-specific and never inferred',()=>check(`
 const aux={bbb:holes({bingo:null,bango:null,bongo:null})};aux.bbb[1]={bingo:'A',bango:'B',bongo:null};players[0].scores[0]=3;
 const base=actualInputLedger('bingo_bango_bongo',players,course,aux,config),bonus=actualInputLedger('bingo_bango_bongo',players,course,aux,{...config,bbbBirdieDouble:true});
 assert.equal(base.totals.A,.5);assert.equal(bonus.totals.A,1.25);assert.equal(bonus.totals.B,.25);
 balanced(calculateSettlement(players,course,['bingo_bango_bongo'],.03,aux,{...config,bbbBirdieDouble:true}));
 aux.bbb[1].bongo=undefined;assert.equal(actualInputLedger('bingo_bango_bongo',players,course,aux,config).pending,true);
`));
for(const game of ['alternate_shot','chapman'])test(game+': canonical team card, three teams, ties, missing, reorder and balanced split',()=>check(`
 const game='${game}',aux={teamCards:holes({Red:4,Blue:5})};players.forEach(p=>p.scores.fill(0));
 let r=calculateSettlement(players,course,[game],.03,aux,config);assert.deepEqual(r.netByPlayer,{A:.03,B:.03,C:-.03,D:-.03});balanced(r);
 assert.deepEqual(calculateSettlement([...players].reverse(),course,[game],.03,aux,config).netByPlayer,r.netByPlayer);
 const teams=[{name:'Red',score:Array(18).fill(4)},{name:'Blue',score:Array(18).fill(5)}];assert.equal(c[game==='chapman'?'calcChapman':'calcAlternateShot'](teams,course)[0].name,'Red');
 aux.teamCards[1].Red=22;assert.deepEqual(calculateSettlement(players,course,[game],1,aux,config).transactions,[]);
 delete aux.teamCards[1].Red;assert.equal(calculateSettlement(players,course,[game],1,aux,config).pending,true);
 aux.teamCards[1].Red=4;const more=[...players,{id:'E',name:'E',team:'Green',handicap:0,scores:Array(18).fill(0)},{id:'F',name:'F',team:'Green',handicap:0,scores:Array(18).fill(0)}];Object.values(aux.teamCards).forEach(h=>h.Green=6);
 r=calculateSettlement(more,course,[game],.03,aux,config);assert.equal(r.netByPlayer.A,.06);balanced(r);
 assert.throws(()=>calculateSettlement(players.slice(0,3),course,[game],1,aux,config),/pairs/);
 assert.throws(()=>calculateSettlement(players,course,[game,'stroke_play'],1,aux,config),/separate contest/);
`));
test('Joker per-player two-hole declarations change scoring and money; negative points double',()=>check(`
 const pair=players.slice(0,2);pair[1].scores[0]=2;pair[1].scores[1]=6;pair[1].scores[2]=6;
 const aux={jokerDeclarations:{0:{A:[1,2],B:[1,4]}}};
 const on={...config,jokerEnabled:true};assert.equal(calculateSettlement(pair,course,['stableford'],1,undefined,on).pending,true);
 assert.notDeepEqual(calculateSettlement(pair,course,['stableford'],1,aux,on),calculateSettlement(pair,course,['stableford'],1,aux,config));
 const result=c.calcStableford(pair,course,{...on,modifiedStableford:true},aux);assert.equal(result.find(p=>p.playerId==='B').holePoints[0],10);
 aux.jokerDeclarations[0].B=[2,3];assert.equal(c.calcStableford(pair,course,{...on,modifiedStableford:true},aux).find(p=>p.playerId==='B').holePoints[1],-6);
 aux.jokerDeclarations[0].A=[1,1];assert.equal(calculateSettlement(pair,course,['stableford'],1,aux,on).pending,true);
`));
test('Bisque replaces indexed net, uses full per-player budgets, pushes ties and rejects invalid allocations',()=>check(`
 const pair=players.slice(0,2);pair[1].scores[0]=5;const aux={bisque:holes({beforePlay:true,strokes:{A:0,B:0}})};aux.bisque[1].strokes.B=2;
 const on={...config,bisqueHandicap:true,netHandicap:true};const r=calculateSettlement(pair,course,['match_play'],.03,aux,on);assert.equal(r.netByPlayer.B,.03);balanced(r);
 assert.equal(c.calcMatchPlay(...pair,course,on,aux).finalStatus,-1);
 aux.bisque[1].strokes.B=1;assert.deepEqual(calculateSettlement(pair,course,['match_play'],1,aux,on).transactions,[]);
 aux.bisque[1].strokes.B=3;assert.equal(calculateSettlement(pair,course,['match_play'],1,aux,on).pending,true);
 aux.bisque[1].strokes.B=2;aux.bisque[2].strokes.B=2;aux.bisque[3].strokes.B=1;assert.equal(calculateSettlement(pair,course,['match_play'],1,aux,on).pending,true);
`));
test('Junk Nassau stacks confirmed feats independently of weights and rejects false feats and duplicate paid menus',()=>check(`
 const pair=players.slice(0,2),aux={junk:holes({sandies:[],barkies:[],greenie:null})};pair[0].scores[0]=3;aux.junk[1]={sandies:['A'],barkies:['A'],greenie:null};
 const on={...config,junkNassau:true};const plain=calculateSettlement(pair,course,['nassau'],1,aux,config),junk=calculateSettlement(pair,course,['nassau'],1,aux,on);
 assert.equal(junk.netByPlayer.A-plain.netByPlayer.A,3);balanced(junk);
 pair[0].scores[0]=5;assert.throws(()=>calculateSettlement(pair,course,['nassau'],1,aux,on),/par or better/);
 assert.throws(()=>calculateSettlement(pair,course,['nassau','dots'],1,aux,on),/cannot also pay/);
`));
test('Two rounds/two groups retain independent hole events; pending prevents final cash; legacy maps are not spread',()=>check(`
 const g1={id:'g1',name:'one',players:players.slice(0,2)},g2={id:'g2',name:'two',players:players.slice(2)};
 const contest={id:'x',name:'x',course,status:'active',games:['bingo_bango_bongo'],betUnit:.03,gameConfig:config,hasTeams:false,createdAt:'',groups:[g1,g2],isTournament:true,rounds:[{id:'r1',number:1,name:'one',course,groups:[g1,g2]},{id:'r2',number:2,name:'two',course,groups:[g1,g2]}],auxiliaryByScope:{}};
 for(const round of contest.rounds)for(const group of round.groups)contest.auxiliaryByScope[scopeKey(round.id,group.id)]={bbb:holes({bingo:group.players[round.number-1].id,bango:null,bongo:null})};
 const result=calculateContestSettlement(contest);assert.ok(Object.values(result.netByPlayer).every(n=>n===0));
 delete contest.auxiliaryByScope['r2/g2'].bbb[9];assert.equal(calculateContestSettlement(contest).pending,true);
 contest.auxiliaryData={bbb:holes({bingo:'A',bango:null,bongo:null})};delete contest.auxiliaryByScope;assert.equal(calculateContestSettlement(contest).pending,true);
`));
test('Store validators enforce tiers, frozen rules, declaration timing and budgets, actual IDs and explicit-none semantics',()=>check(`
 const contest={id:'x',name:'x',course,status:'active',games:['wolf'],betUnit:1,gameConfig:{...config,blindWolf:true,pigVariation:true},hasTeams:false,createdAt:'',groups:[{id:'g',name:'g',players}]};
 assert.throws(()=>validation.validateHostContest(contest,'free'),/plan/);validation.validateHostContest(contest,'pro');
 assert.throws(()=>validation.validateContestChange(contest,{...contest,betUnit:2}),/locked/);
 assert.throws(()=>validation.validateAuxiliaryWrite(contest,'g','wolf',1,{partnerId:null,isLoneWolf:true,blind:true,beforePlay:true}),/locked/);
 players.forEach(p=>p.scores.fill(0));validation.validateAuxiliaryWrite(contest,'g','wolf',1,{partnerId:null,isLoneWolf:true,blind:true,beforePlay:true});
 validation.validateAuxiliaryWrite(contest,'g','bbb',1,{bingo:null,bango:null,bongo:null});
 assert.throws(()=>validation.validateAuxiliaryWrite(contest,'g','bbb',1,{bingo:null,bango:null}),/every BBB/);
 assert.throws(()=>validation.validateAuxiliaryWrite(contest,'g','bisque',1,{beforePlay:true,strokes:{A:3,B:0,C:0,D:0}}),/budget/);
 assert.throws(()=>validation.validateAuxiliaryWrite(contest,'g','jokerDeclarations',0,{A:[1,1]}),/two distinct/);
`));
test('Formerly hidden saved flags require explicit input-rules adoption; aliases normalize or require review',()=>check(`
 const t=await import('./src/engine/types.ts').then(m=>m.default??m);
 const old={rulesVersion:1,blindWolf:true,pigVariation:true,wolfCarryover:true,junkNassau:true,progressiveSnake:true,jokerEnabled:true,bisqueHandicap:true,bbbBirdieDouble:true};
 for(const game of ['wolf','snake','nassau','stableford','match_play','bingo_bango_bongo']) {
 const normalized=t.configForGame(old,game);for(const key of ['blindWolf','pigVariation','wolfCarryover','junkNassau','progressiveSnake','jokerEnabled','bisqueHandicap','bbbBirdieDouble'])assert.equal(normalized[key],undefined);
 }
 const data={bingo_bango_bongo:holes({bingo:'A',bango:null,bongo:null})};
 assert.equal(actualInputLedger('bingo_bango_bongo',players,course,data,config).pending,false);
 data.bbb=holes({bingo:'B',bango:null,bongo:null});assert.throws(()=>actualInputLedger('bingo_bango_bongo',players,course,data,config),/Conflicting BBB/);
`));
test('All actual-input ledgers survive reload, edits and repeated settlement across zero, odd-cent and dollar stakes',()=>check(`
 const entries={wolf:{wolf:holes(h=>({partnerId:players[h%4].id,isLoneWolf:false}))},hammer:{hammer:holes({hammered:false,hammerBy:'',accepted:true})},snake:{snake:holes(['B'])},greenies:{greenies:holes('A')},bingo_bango_bongo:{bbb:holes({bingo:'A',bango:'B',bongo:null})}};
 course.holes.forEach(h=>h.par=3);players[0].scores.fill(2);players.slice(1).forEach(p=>p.scores.fill(3));
 for(const [game,aux] of Object.entries(entries))for(const stake of [0,.01,.03,5]){
 const roster=game==='hammer'?players.slice(0,2):players;
 const first=calculateSettlement(roster,course,[game],stake,aux,config);balanced(first);
 assert.deepEqual(first,calculateSettlement(structuredClone(roster),structuredClone(course),[game],stake,JSON.parse(JSON.stringify(aux)),config));
 roster[0].scores[8]=0;assert.equal(calculateSettlement(roster,course,[game],stake,aux,config).pending,true);roster[0].scores[8]=2;
 }
`));
test('Shared-ball leaderboard and live-share both read team cards, not individual scores',()=>check(`
 const {teamCardPlayers}=await import('./src/engine/contest-results.ts').then(m=>m.default??m);
 const {buildSnapshot}=await import('./src/services/live-share-snapshot.ts').then(m=>m.default??m);
 players.forEach(p=>p.scores.fill(0));const group={id:'g',name:'g',players};
 const contest={id:'x',name:'x',course,status:'active',games:['chapman'],betUnit:.03,gameConfig:config,hasTeams:true,createdAt:'',groups:[group],auxiliaryByScope:{'default/g':{teamCards:holes({Red:4,Blue:5})}}};
 assert.deepEqual(teamCardPlayers(contest).map(p=>p.scores.reduce((a,b)=>a+b,0)),[72,90]);
 const snapshot=buildSnapshot(contest);assert.equal(snapshot.players[0].total,72);assert.equal(snapshot.games[0].standings[0].units,2);
 delete contest.auxiliaryByScope['default/g'].teamCards[18];assert.equal(buildSnapshot(contest).games[0].pending,true);
`));
