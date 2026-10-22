const {execFileSync}=require('node:child_process');
test('uneven three-way splits reconcile cents and ledger in Net and Gross',()=>{
execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
const {calculateSettlement}=await import('./src/engine/settlement.ts').then(m=>m.default??m);
const course={name:'Test',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
const cents=n=>Math.round(n*100);
for(const skinsMode of ['net','gross']) for(const unit of [0.01,1,2.35]) {
const players=['A','B','C'].map((name,i)=>({id:name,name,handicap:0,scores:Array.from({length:18},(_,h)=>h===0&&i===0?3:4)}));
const s=calculateSettlement(players,course,['skins'],unit,undefined,{skinsMode});
assert.equal(Object.values(s.netByPlayer).reduce((a,n)=>a+cents(n),0),0);
assert.equal(cents(s.netByPlayer.A),Math.round(unit*100*2/3));
assert.ok(Math.abs(cents(s.netByPlayer.B)-cents(s.netByPlayer.C))<=1);
for(const p of players) assert.equal(s.transactions.reduce((a,t)=>a+(t.to===p.name?cents(t.amount):0)-(t.from===p.name?cents(t.amount):0),0),cents(s.netByPlayer[p.name]));
assert.deepEqual(s,calculateSettlement(players,course,['skins'],unit,undefined,{skinsMode}));
}
const players=['A','B','C','D'].map((name,i)=>({id:name,name,handicap:0,scores:Array.from({length:18},(_,h)=>h<3&&i===h?3:4)}));
assert.deepEqual(calculateSettlement(players,course,['skins'],4/3).netByPlayer,{A:0.34,B:0.33,C:0.33,D:-1});
`],{stdio:'pipe'});
});
