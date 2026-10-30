const runNode=require('./helpers/run-node.cjs');
function check(source){runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
import fs from 'node:fs';
const r=await import('./src/engine/contest-results.ts').then(m=>m.default??m);
const load=async n=>import('./src/engine/calculators/'+n+'.ts').then(m=>m.default??m);
const {calcNassauRules}=await load('nassau'),{calcScopedSkins}=await load('skins'),{calcVegas}=await load('vegas'),{calcSixes}=await load('sixes');
const course={name:'First course',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
const players=scores=>scores.map((s,i)=>({id:'ABCD'[i],name:'ABCD'[i],handicap:0,team:i<2?'X':'Y',scores:Array(18).fill(s)}));
function fixture(first,second){const group={id:'g',name:'Group',players:players(first)};return {groups:[group],course,games:['nassau'],betUnit:1,gameConfig:{rulesVersion:1,inputRulesVersion:1,nassauWeights:[1,1,2]},isTournament:true,currentRound:2,rounds:[{id:'r1',number:1,name:'First',course,groups:[group]},{id:'r2',number:2,name:'Second',course:{...course,name:'Second course',holes:course.holes.map(h=>({...h,par:5}))},groups:[{...group,players:players(second)}]}]};}
${source}`]);}
test('Tournament Nassau cancelling weighted rounds display opposing results and zero combined cash',()=>check(`
const c=fixture([3,4],[4,3]);const rows=r.contestPrimaryRounds(c);
assert.deepEqual(rows.map(({contest:x})=>{const n=calcNassauRules(x.groups[0].players,x.course,false,x.gameConfig);return [n.front,n.back,n.overall];}),[[9,9,18],[-9,-9,-18]]);
assert.deepEqual(r.calculateContestSettlement(c).netByPlayer,{A:0,B:0});assert.deepEqual(rows.map(x=>x.roundName),['First','Second']);
`));
test('Skins Vegas Sixes use independent round cards and changed course pars',()=>check(`
const c=fixture([3,4,5,6],[5,6,3,4]);c.gameConfig.birdieFlip=true;
const rows=r.contestPrimaryRounds(c).map(x=>x.contest);
assert.deepEqual(rows.map(x=>calcScopedSkins(x.groups,x.course,false,x.gameConfig)[0].result.totals),[{A:18,B:0,C:0,D:0},{A:0,B:0,C:18,D:0}]);
assert.deepEqual(rows.map(x=>{const p=x.groups[0].players;return calcVegas(p.slice(0,2),p.slice(2),x.course,x.gameConfig).holes[0];}),[{hole:1,t1:34,t2:65,diff:-31},{hole:1,t1:56,t2:34,diff:22}]);
assert.deepEqual(rows.map(x=>calcSixes(x.groups[0].players,x.course,x.gameConfig).totals),[{A:18,B:-6,C:-6,D:-6},{A:-6,B:-6,C:18,D:-6}]);
for(const game of ['skins','vegas','sixes']){c.games=[game];assert.equal(Object.values(r.calculateContestSettlement(c).netByPlayer).reduce((a,b)=>a+b,0),0);}
`));
test('All primary branches get scoped round inputs; legacy and single-round contexts retain identity',()=>check(`
const c=fixture([3,4],[4,3]);c.auxiliaryByScope={'r1/g':{marker:1},'r2/g':{marker:2}};
const rows=r.contestPrimaryRounds(c);for(let i=0;i<2;i++){const x=rows[i].contest;assert.equal(x.groups,c.rounds[i].groups);assert.equal(x.course,c.rounds[i].course);assert.equal(x.isTournament,false);assert.equal(x.rounds,undefined);assert.equal(r.scopedAuxiliary(x,'g').marker,i+1);}
for(const config of [undefined,{}, {rulesVersion:1}]){const x={...c,gameConfig:config,isTournament:config?.rulesVersion===1?false:true};assert.equal(r.contestPrimaryRounds(x)[0].contest,x);}
const ui=fs.readFileSync('app/contest/[id]/games.tsx','utf8');assert.ok(ui.includes('contestPrimaryRounds(contest).flatMap'));assert.ok(ui.includes('const allPlayers = contest.groups.flatMap'));assert.ok(ui.includes('roundName &&'));
`));
