const runNode=require('./helpers/run-node.cjs');
const fs=require('fs');
// AUG-1369: TD paywall must be reachable from New Contest with Pro dormant (default OFF).
test('new-contest multi-day / multi-group routes to TD paywall with Pro off',()=>{
 runNode(['--import','tsx','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 const e=await import('./src/services/entitlements.ts').then(m=>m.default??m);
 e.setProEnabled(false);
 const r=(d,t)=>e.newContestPaywallRoute(d,t);
 for (const tier of ['free','pro']) {
  assert.equal(r({isTournament:true,numRounds:2,numGroups:1},tier),'/paywall?tier=td');
  assert.equal(r({isTournament:false,numRounds:4,numGroups:2},tier),'/paywall?tier=td');
  assert.equal(r({isTournament:false,numRounds:4,numGroups:1},tier),null);
 }
 assert.equal(r({isTournament:true,numRounds:4,numGroups:3},'td'),null);
 `]);
});
test('wizard and settings wire the TD entry',()=>{
 const n=fs.readFileSync('app/contest/new.tsx','utf8'), s=fs.readFileSync('app/settings.tsx','utf8');
 expect(n.includes('newContestPaywallRoute(')).toBe(true);
 expect(s.includes('router.push("/paywall?tier=td")')).toBe(true);
});
