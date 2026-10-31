const runNode=require('./helpers/run-node.cjs');
function check(source){runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
const r=await import('./src/engine/contest-results.ts').then(m=>m.default??m);
const {calcSkins}=await import('./src/engine/calculators/skins.ts').then(m=>m.default??m);
const course={name:'Round course',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
const players=['A','B'].map(id=>({id,name:id,handicap:id==='B'?2:0,scores:Array(18).fill(4)}));
const config={rulesVersion:1,inputRulesVersion:1};
${source}
`]);}
test('Tournament Bisque display uses each round course, cards and declarations and agrees with cash',()=>check(`
 players[1].scores[0]=5;const group={id:'g',name:'Pair',players};
 const second=players.map(p=>({...p,scores:Array(18).fill(5)}));second[0].scores[0]=6;
 const contest={groups:[group],course,games:['match_play'],betUnit:1,gameConfig:{...config,bisqueHandicap:true},isTournament:true,currentRound:2,
 rounds:[{id:'r1',number:1,name:'First',course,groups:[group]},{id:'r2',number:2,name:'Second',course:{...course,name:'Other',holes:course.holes.map(h=>({...h,par:5}))},groups:[{...group,players:second}]}],auxiliaryByScope:{}};
 for(const round of contest.rounds)contest.auxiliaryByScope[r.scopeKey(round.id,'g')]={bisque:Object.fromEntries(course.holes.map(h=>[h.num,{beforePlay:true,strokes:{A:0,B:round.id==='r1'&&h.num===1?2:0}}]))};
 const rows=r.contestMatchPlay(contest);assert.deepEqual(rows.map(x=>[x.roundName,x.p1.name,x.p2.name,x.status]),[['First','A','B',-1],['Second','A','B',-1]]);
 assert.deepEqual(r.calculateContestSettlement(contest).netByPlayer,{A:-2,B:2});
 const fs=await import('node:fs');const ui=fs.readFileSync('app/contest/[id]/games.tsx','utf8');assert.ok(ui.includes('contestMatchPlay(contest).map'));assert.ok(ui.includes('{roundName}'));
 contest.isTournament=false;assert.equal(r.contestMatchPlay(contest).length,1);
`));
test('Version-one flat Skins confirms only a shared prefix, with legacy parity',()=>check(`
 for(const gap of [0,NaN,Infinity,undefined])for(const carry of [false,true])for(const mode of ['gross','net']){
 const pair=players.map(p=>({...p,handicap:0,scores:Array(18).fill(4)}));pair[0].scores[1]=gap;pair[1].scores[1]=3;pair[1].scores[2]=3;
 const result=calcSkins(pair,course,carry,mode,config);assert.deepEqual(result,{skins:[{hole:1,winner:carry?'Carry':'Push',value:0}],totals:{A:0,B:0},remaining:carry?1:0});
 assert.equal(calcSkins(pair,course,carry,mode).skins.length,18);
 }
`));
