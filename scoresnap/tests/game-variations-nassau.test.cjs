const runNode=require('./helpers/run-node.cjs');
for(const [key,value] of [['nassauWeights','[1,1,2]'],['pressThePress','true'],['alohaPressOn18','true'],['noPressLast','true'],['netHandicap','true']]) test(`Nassau ${key} is honored by scoring and settlement`,()=>{
 runNode(['--import','tsx','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 const {calcNassauRules}=await import('./src/engine/calculators/nassau.ts').then(m=>m.default??m);
 const {calculateSettlement}=await import('./src/engine/settlement.ts').then(m=>m.default??m);
 const course={name:'Rules',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
 const players=['A','B'].map((name,i)=>({id:name,name,handicap:i*36,scores:Array(18).fill(i?5:4)}));
 if('${key}'==='noPressLast') {players[0].scores=Array(18).fill(4);players[1].scores=Array(18).fill(4);players[1].scores[6]=5;players[1].scores[7]=5;players[1].scores[8]=5;}
 const base={rulesVersion:1},config={...base,${key}:${value}};
 const old=calcNassauRules(players,course,true,base),result=calcNassauRules(players,course,true,config);
 assert.notDeepEqual(old,result);
 const a=calculateSettlement(players,course,['nassau_press'],.03,undefined,base);
 const b=calculateSettlement(players,course,['nassau_press'],.03,undefined,config);
 assert.notDeepEqual(a,b);
 assert.ok(Math.abs(Object.values(b.netByPlayer).reduce((a,b)=>a+b,0))<1e-8);
 `]);
});
