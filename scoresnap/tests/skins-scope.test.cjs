const { execFileSync } = require('node:child_process');
for (const mode of ['net','gross']) for (const game of ['skins','skins_carry']) {
 test(`scope defaults and isolated cents: ${mode} ${game}`,()=> {
 execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 const {calcScopedSkins,skinsLabel}=await import('./src/engine/calculators/skins.ts').then(m=>m.default??m);
 const {calculateSettlement}=await import('./src/engine/settlement.ts').then(m=>m.default??m);
 const course={name:'Test',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))};
 const players=['A','B','C','D','E','F'].map((name,i)=>({id:name,name,handicap:0,scores:Array(18).fill(i+3)}));
 const groups=[{name:'G1',players:players.slice(0,3)},{name:'G2',players:players.slice(3)}];
 const config={skinsMode:'${mode}'};
 const settle=(cfg,unit=0.01)=>calculateSettlement(players,course,['${game}'],unit,undefined,cfg,groups);
 assert.deepEqual(settle(config),settle({...config,skinsScope:'field'}));
 assert.deepEqual(calcScopedSkins(groups,course,false,config),calcScopedSkins(groups,course,false,{...config,skinsScope:'field'}));
 assert.ok(skinsLabel(config).endsWith(' · Whole field'));
 const outcomes={};
 for(const skinsScope of ['field','group']) {
  const cfg={...config,skinsScope};
  const tables=calcScopedSkins(groups,course,'${game}'==='skins_carry',cfg);
  assert.equal(tables.length,skinsScope==='field'?1:2);
  const s=settle(cfg); outcomes[skinsScope]=s;
  for(const table of tables) {
   const avg=Object.values(table.result.totals).reduce((a,b)=>a+b,0)/table.players.length;
   for(const p of table.players) assert.equal(Math.round(s.netByPlayer[p.name]*100),Math.round(table.result.totals[p.name]-avg));
  }
  for(const unit of [0.01,1/300,0.07]) {
   const s=settle(cfg,unit);
   assert.deepEqual(s,settle(cfg,unit));
   for(const t of s.transactions) {
    assert.ok(Math.abs(t.amount*100-Math.round(t.amount*100))<1e-8);
    if(skinsScope==='group') assert.equal(groups.findIndex(g=>g.players.some(p=>p.name===t.from)),groups.findIndex(g=>g.players.some(p=>p.name===t.to)));
   }
   for(const g of skinsScope==='group'?groups:[{players}]) assert.equal(g.players.reduce((sum,p)=>sum+Math.round(s.netByPlayer[p.name]*100),0),0);
   for(const p of players) assert.equal(s.transactions.reduce((sum,t)=>sum+(t.to===p.name?Math.round(t.amount*100):0)-(t.from===p.name?Math.round(t.amount*100):0),0),Math.round(s.netByPlayer[p.name]*100));
  }
 }
 assert.notDeepEqual(outcomes.field,outcomes.group);
 `],{stdio:'pipe'});
 });
}
