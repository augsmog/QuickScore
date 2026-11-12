const runNode = require('./helpers/run-node.cjs');
const path = require('node:path');
const cases = {
 tiered: `{skinsTier:'tiered'}`,
 progressive: `{skinsTier:'progressive'}`,
 birdie: `{birdieMultiplier:true}`,
 validation: `{validationRule:true}`,
 team: `{teamSkins:true}`,
};
for (const [name,config] of Object.entries(cases)) test(`${name}: calculator units change and settlement follows the same units in cents`,()=>{
 runNode(['--import','tsx','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 const {calcSkins}=await import('./src/engine/calculators/skins.ts').then(m=>m.default??m);
 const {calculateSettlement}=await import('./src/engine/settlement.ts').then(m=>m.default??m);
 const course={name:'Rules',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
 const players=['A','B','C','D'].map((name,i)=>({id:name,name,team:i<2?'Red':'Blue',handicap:0,scores:Array(18).fill(i===0?3:5)}));
 if('${name}'==='validation') {players.forEach(p=>p.scores[0]=4);players[0].scores[2]=5;players[2].scores[2]=3;}
 const config={rulesVersion:1,skinsMode:'gross',...${config}};
 const result=calcSkins(players,course,true,'gross',config);
 const baseline=calcSkins(players,course,true,'gross');
 assert.notDeepEqual(result,baseline);
 const money=calculateSettlement(players,course,['skins_carry'],0.03,undefined,config);
 const total=Object.values(result.totals).reduce((a,b)=>a+b,0);
 for(const p of players) assert.ok(Math.abs(money.netByPlayer[p.name]-(result.totals[p.name]-total/players.length)*.03)<=.011);
 assert.ok(Math.abs(Object.values(money.netByPlayer).reduce((a,b)=>a+b,0))<1e-8);
 for(const t of money.transactions) assert.ok(Math.abs(t.amount*100-Math.round(t.amount*100))<1e-7);
 `],{cwd:path.resolve(__dirname,'..')});
});
