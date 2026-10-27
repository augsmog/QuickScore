import assert from 'node:assert/strict';
import { calcStrokePlay } from '../../src/engine/calculators/stroke-play';
import { calcStableford } from '../../src/engine/calculators/stableford';
import { calcSkins } from '../../src/engine/calculators/skins';
import { calculateSettlement } from '../../src/engine/settlement';
const players=JSON.parse(process.argv[2]);
const course={name:'Fixture',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:350}))};
assert.deepEqual(players[0].scores,Array(18).fill(4));
assert.equal(players[0].scores.reduce((a:number,b:number)=>a+b,0),72);
assert.deepEqual(calcStrokePlay(players,course).map(p => p.total), [72,108]);
assert.deepEqual(calcStableford(players,course).map(p => p.points), [36,0]);
for (const mode of ['gross','net'] as const) {
 assert.deepEqual(calcSkins(players,course,false,mode).totals, {'Player A':18,'Player B':0});
 const settlement = calculateSettlement(players,course,['skins'],5,undefined,{skinsMode:mode});
 assert.deepEqual(settlement.netByPlayer, {'Player A':45,'Player B':-45});
}
console.log('corrected calculators PASS');
