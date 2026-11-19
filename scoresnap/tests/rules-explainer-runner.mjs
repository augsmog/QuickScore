import assert from 'node:assert/strict';
import fs from 'node:fs';
const C=await import('../src/engine/calculators/index.ts').then(m=>m.default??m);
const {calculateSettlement}=await import('../src/engine/settlement.ts').then(m=>m.default??m);
function run(f){
 const p=f.players,c=f.course;
 const teams=[...new Set(p.map(x=>x.team))].map(name=>({name,players:p.filter(x=>x.team===name)}));
 const scores=teams.map(t=>({name:t.name,score:t.players[0].scores}));
 const args={match_play:[p[0],p[1],c],nassau:[p[0],p[1]],nassau_press:[p[0],p[1]],closeout:[p[0],p[1],c],skins:[p,c,false,f.gameConfig.skinsMode],skins_carry:[p,c,true,f.gameConfig.skinsMode],vegas:[teams[0].players,teams[1]?.players,c],fourball:[teams[0].players,teams[1]?.players,c],best_ball:[teams,c],shamble:[teams,c],scramble:[scores,c],alternate_shot:[scores,c],chapman:[scores,c]};
 const names={mod_stableford:'ModStableford',bingo_bango_bongo:'BingoBangoBongo',aces_deuces:'AcesDeuces',fourball:'FourBall',skins_carry:'Skins'};
 const fn='calc'+(names[f.id]??f.id.split('_').map(s=>s[0].toUpperCase()+s.slice(1)).join(''));
 return {result:C[fn](...(args[f.id]??[p,c])),netByPlayer:calculateSettlement(p,c,[f.id],f.betUnit,f.auxiliaryData,f.gameConfig).netByPlayer};
}

export function evaluate(f) {
const actual=run(f);
const r=actual.result;
let stated;
if(Array.isArray(r)) {
 const key=f.id==='quota'?'overUnder':f.id==='chicago'?'netScore':['stableford','mod_stableford'].includes(f.id)?'points':'total';
 stated=Object.fromEntries(r.map(x=>[x.name,x[key]]));
} else if(r.totals) stated=r.totals;
else if(r.points) stated=r.points;
else if('finalStatus' in r) stated={lead:r.finalStatus};
else if(f.id==='vegas') stated={team1Won:r.team1Won,team2Won:r.team2Won};
else stated={front:r.front,back:r.back,overall:r.overall};

return {...actual,stated};
}
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/rules-explainer-examples.json',import.meta.url)));
if (process.argv.includes('--refresh')) {
 for (const f of fixtures) { const a=evaluate(f); f.expected={result:a.result,netByPlayer:a.netByPlayer}; f.statedResult=a.stated; }
 fs.writeFileSync(new URL('./fixtures/rules-explainer-examples.json',import.meta.url),JSON.stringify(fixtures,null,2)+'\n');
} else {
 const chosen=process.argv[2];
 if(chosen) assert.ok(fixtures.some(f=>f.id===chosen),'Unknown format: '+chosen);
 for(const f of fixtures.filter(f=>!chosen||f.id===chosen)) {
  const a=evaluate(f);
  if (['alternate_shot','chapman','bingo_bango_bongo'].includes(f.id)) {
    const settlement=calculateSettlement(f.players,f.course,[f.id],f.betUnit,f.auxiliaryData,f.gameConfig);
    assert.deepEqual(settlement.transactions,[],f.id+': no settlement transfers');
    assert.ok(Object.values(settlement.netByPlayer).every(n=>n===0));
  }
  if (f.id==='greenies') {
    const named=calculateSettlement(f.players,f.course,[f.id],1,{greenies:{2:f.players[0].id}},f.gameConfig);
    assert.deepEqual(named.netByPlayer,{Alex:3,Casey:-1,Jordan:-1,Sam:-1});
  }
  assert.deepEqual(a.result,f.expected.result);
  assert.deepEqual(a.stated,f.statedResult);
  const cents=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,Math.round(v*100)]));
  assert.deepEqual(cents(a.netByPlayer),cents(f.expected.netByPlayer));
  assert.equal(Object.values(cents(a.netByPlayer)).reduce((a,b)=>a+b,0),0);
  console.log('PASS '+f.id+': exact result, stated values, cents and zero-sum');
 }
}
