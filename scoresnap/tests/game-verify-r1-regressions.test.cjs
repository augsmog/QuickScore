const runNode=require('./helpers/run-node.cjs');
function check(source){runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
const c=await import('./src/engine/calculators/index.ts').then(m=>m.default??m);
const r=await import('./src/engine/contest-results.ts').then(m=>m.default??m);
const {calculateSettlement:cash}=await import('./src/engine/settlement.ts').then(m=>m.default??m);
const course={name:'Override',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
const players=['A','B','C','D'].map(id=>({id,name:id,handicap:0,scores:Array(18).fill(4)}));
const config={rulesVersion:1,inputRulesVersion:1};
${source}
`]);}
test('BBB birdie or better: exact category points and dollars',()=>check(`
 const pair=players.slice(0,2),aux={bbb:Object.fromEntries(course.holes.map(h=>[h.num,{bingo:null,bango:null,bongo:null}]))};aux.bbb[1].bingo='A';
 for(const score of [1,2,3,4]){pair[0].scores[0]=score;assert.deepEqual(cash(pair,course,['bingo_bango_bongo'],1,aux,{...config,bbbBirdieDouble:true}).netByPlayer,{A:score<4?1:.5,B:score<4?-1:-.5});}
`));
test('Joker leaderboard and money agree across groups and tournament rounds',()=>check(`
 players[2].scores[0]=3;const groups=[{id:'g1',name:'g1',players:players.slice(0,2)},{id:'g2',name:'g2',players:players.slice(2)}];
 const contest={groups,course,games:['stableford'],betUnit:1,gameConfig:{...config,jokerEnabled:true},auxiliaryByScope:{}};
 for(const g of groups)contest.auxiliaryByScope[r.scopeKey(undefined,g.id)]={jokerDeclarations:{0:Object.fromEntries(g.players.map(p=>[p.id,[1,2]]))}};
 const expected=[['C',42],['A',40],['B',40],['D',40]];
 assert.deepEqual(r.contestStableford(contest).map(p=>[p.playerId,p.points]),expected);
 assert.deepEqual(r.calculateContestSettlement(contest).netByPlayer,{A:-1,B:-1,C:3,D:-1});
 contest.isTournament=true;contest.rounds=[{id:'r1',number:1,course,groups},{id:'r2',number:2,course,groups}];
 for(const round of contest.rounds)for(const g of groups)contest.auxiliaryByScope[r.scopeKey(round.id,g.id)]=contest.auxiliaryByScope[r.scopeKey(undefined,g.id)];
 assert.deepEqual(r.contestStableford(contest).map(p=>[p.playerId,p.points]),expected.map(([p,n])=>[p,n*2]));
 assert.deepEqual(r.calculateContestSettlement(contest).netByPlayer,{A:-2,B:-2,C:6,D:-2});
 const fs=await import('node:fs');assert.ok(fs.readFileSync('app/contest/[id]/games.tsx','utf8').includes('contestStableford(contest)'));
`));
test('Flat Net Skins honors course handicap with legacy parity',()=>check(`
 const pair=players.slice(0,2);pair[0].courseHandicaps={Override:18};pair[1].scores.fill(3);
 for(const carry of [false,true]){assert.equal(c.calcSkins(pair,course,carry,'net',config).totals.B,0);assert.deepEqual(cash(pair,course,[carry?'skins_carry':'skins'],1,undefined,config).netByPlayer,{A:0,B:0});}
 assert.equal(c.calcSkins(pair,course,false,'net').totals.B,18);assert.equal(c.calcSkins(pair,course,false,'gross',config).totals.B,18);
`));
test('Version-one previews stop at the shared confirmed prefix including net and Bisque',()=>check(`
 const pair=players.slice(0,2);pair[0].scores[1]=0;pair[1].scores[1]=5;
 for(const extra of [{},{netHandicap:true},{bisqueHandicap:true}]){const aux={bisque:{1:{beforePlay:true,strokes:{A:0,B:0}}}};const match=c.calcMatchPlay(...pair,course,{...config,...extra},aux);assert.equal(match.finalStatus,0);assert.equal(match.results.length,1);}
 assert.deepEqual(c.calcStableford(pair,course,config).map(p=>p.points),[2,2]);pair[0].scores[1]=NaN;assert.deepEqual(c.calcStableford(pair,course,config).map(p=>p.points),[2,2]);
 assert.equal(c.calcMatchPlay(...pair,course).results.length,18);
`));
test('Barracuda exact point table and cash reject inflated birdies',()=>check(`
 const pair=players.slice(0,2);pair[0].scores=[1,2,3,4,5,6,7,...Array(11).fill(4)];const on={...config,modifiedStableford:true};
 const scored=c.calcStableford(pair,course,on);assert.deepEqual(scored.find(p=>p.playerId==='A').holePoints,[8,5,2,0,-1,-3,-3,...Array(11).fill(0)]);assert.equal(scored.find(p=>p.playerId==='A').points,8);
 assert.deepEqual(cash(pair,course,['stableford'],.03,undefined,on).netByPlayer,{A:.03,B:-.03});
`));

test('All variants retain independent numerical units and cash acceptance fixtures',()=>{runNode(['--import','tsx','tests/fixtures/game-variant-numerical-acceptance.ts']);});

test('Playable count derives from distinct delivered registries',()=>check(`
 const t=await import('./src/engine/types.ts').then(m=>m.default??m);
 assert.equal(t.PLAYABLE_BASE_GAME_IDS.length,30);assert.equal(t.PLAYABLE_OPTION_IDS.length,26);assert.equal(t.PLAYABLE_FORMAT_IDS.length,1);
 const ids=[...t.PLAYABLE_BASE_GAME_IDS,...t.PLAYABLE_OPTION_IDS,...t.PLAYABLE_FORMAT_IDS];assert.equal(new Set(ids).size,ids.length);assert.equal(t.PLAYABLE_GAME_COUNT,ids.length);assert.equal(t.PLAYABLE_GAME_COUNT,57);
`));
