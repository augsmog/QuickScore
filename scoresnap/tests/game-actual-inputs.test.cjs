const runNode=require('./helpers/run-node.cjs');const path=require('node:path');
for(const game of ['wolf','hammer','snake','greenies','bingo_bango_bongo']) test(`${game}: actual inputs, pending gaps, balanced cents`,()=>{runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
const {actualInputLedger}=await import('./src/engine/actual-inputs.ts').then(m=>m.default??m);
const {calculateSettlement}=await import('./src/engine/settlement.ts').then(m=>m.default??m);
const game='${game}',config={rulesVersion:1,inputRulesVersion:1};
const course={name:'Events',holes:Array.from({length:18},(_,i)=>({num:i+1,par:3,hcp:i+1,yards:100}))};
const players=['A','B','C','D'].slice(0,game==='hammer'?2:4).map((name,i)=>({id:name,name,handicap:0,scores:Array(18).fill(i===0?2:3)}));
const key=game==='bingo_bango_bongo'?'bbb':game;
const aux={[key]:Object.fromEntries(Array.from({length:18},(_,i)=>[i+1,game==='wolf'?{partnerId:null,isLoneWolf:true}:game==='hammer'?{hammered:true,hammerBy:'B',accepted:false}:game==='snake'?['B']:game==='greenies'?'B':{bingo:'B',bango:'B',bongo:'B'}]))};
assert.equal(actualInputLedger(game,players,course,undefined,config).pending,true);
const ledger=actualInputLedger(game,players,course,aux,config);assert.equal(ledger.pending,false);assert.notEqual(ledger.totals.B,0);
assert.ok(Math.abs(Object.values(ledger.totals).reduce((a,b)=>a+b,0))<1e-8);
const money=calculateSettlement(players,course,[game],.03,aux,config);assert.ok(money.transactions.length>0);
assert.equal(calculateSettlement(players,course,[game],.03,undefined,config).pending,true);
assert.ok(Math.abs(Object.values(money.netByPlayer).reduce((a,b)=>a+b,0))<1e-8);
delete aux[key][9];const gap=actualInputLedger(game,players,course,aux,config);assert.equal(gap.pending,true);assert.equal(gap.holes,8);
`],{cwd:path.resolve(__dirname,'..')});});
