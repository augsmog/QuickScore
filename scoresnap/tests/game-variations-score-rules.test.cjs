const runNode = require('./helpers/run-node.cjs');
const path = require('node:path');
for (const [game,key,calc,args] of [
 ['stableford','modifiedStableford','calcStableford','players,course'],
 ['stableford','netHandicap','calcStableford','players,course'],
 ['vegas','birdieFlip','calcVegas','players.slice(0,2),players.slice(2),course'],
 ['vegas','eagleDoubles','calcVegas','players.slice(0,2),players.slice(2),course'],
 ['vegas','birdieBlocksBirdie','calcVegas','players.slice(0,2),players.slice(2),course'],
 ['sixes','escalatingSegments','calcSixes','players,course'],
 ['sixes','sixesPresses','calcSixes','players,course'],
 ['rabbit','doubleRabbit','calcRabbit','players,course'],
]) test(`${game} ${key} changes scoring and balanced cents`,()=>{runNode(['--import','tsx','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 const c=await import('./src/engine/calculators/index.ts').then(m=>m.default??m);
 const {calculateSettlement}=await import('./src/engine/settlement.ts').then(m=>m.default??m);
 const course={name:'Rules',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
 const players=['A','B','C','D'].map((name,i)=>({id:name,name,team:i<2?'Red':'Blue',handicap:i*10,scores:Array.from({length:18},(_,h)=>i===0?3:i===1?5:i===2?4:6)}));
 if('${key}'==='modifiedStableford') {players[0].scores.fill(4);players[1].scores=Array.from({length:18},(_,h)=>h<8?2:6);players[2].scores.fill(7);players[3].scores.fill(7);}
 if('${key}'==='eagleDoubles') players[0].scores[0]=2;
 if('${key}'==='birdieBlocksBirdie') players[2].scores[0]=3;
 const base={rulesVersion:1,...('${key}'==='birdieBlocksBirdie'?{birdieFlip:true}:{})};
 const config={...base,${key}:true};
 const a=c.${calc}(${args},base),b=c.${calc}(${args},config);
 assert.notDeepEqual(a,b);
 const old=calculateSettlement(players,course,['${game}'],.03,undefined,base);
 const money=calculateSettlement(players,course,['${game}'],.03,undefined,config);
 assert.notDeepEqual(old,money);
 assert.ok(Math.abs(Object.values(money.netByPlayer).reduce((a,b)=>a+b,0))<1e-8);
 money.transactions.forEach(t=>assert.ok(Math.abs(t.amount*100-Math.round(t.amount*100))<1e-7));
 `],{cwd:path.resolve(__dirname,'..')});});
