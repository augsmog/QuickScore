const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const read=p=>fs.readFileSync(p,'utf8');
test('signed amounts and round status use exact approved strings',()=>{
 execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 const {signedRoundAmount,settlementLeader,roundProgressNotice}=await import('./src/ui/copy.ts').then(m=>m.default??m);
 assert.equal(signedRoundAmount(-19),'−$19.00');
 assert.equal(signedRoundAmount(31),'+$31.00');
 assert.equal(signedRoundAmount(0),'+$0.00');
 assert.equal(signedRoundAmount(-0.001),'+$0.00');
 assert.equal(signedRoundAmount(1.234),'+$1.23');
 for(const final of [true,false]) {
 assert.equal(settlementLeader('Amy',final), final?'Amy finished on top':'Amy is on top');
 assert.equal(roundProgressNotice(final),final?null:'Current standings · results may change');
 const {buildRecapModel}=await import('./src/ui/recap/model.ts').then(m=>m.default??m);
 assert.equal(buildRecapModel({netByPlayer:{Amy:5},transactions:[]},{title:'Round',course:'Pines',games:[],completed:final}).headline,'Round recap');
 }
 const {PLAYABLE_GAME_COUNT}=await import('./src/engine/types.ts').then(m=>m.default??m);
 assert.ok(PLAYABLE_GAME_COUNT>=50); console.log('PLAYABLE_GAME_COUNT='+PLAYABLE_GAME_COUNT);
 `],{stdio:'pipe'});
});
test('screens render approved copy and shared tested formatters',()=>{
 const profile=read('app/(tabs)/profile.tsx');
 expect(profile).toContain('ROUND RESULTS');expect(profile).toContain('Finish a round to see your results here.');expect(profile).toContain('signedRoundAmount(item.amount)');
 expect(profile).not.toContain('item.isWin ? "+"');
 const onboarding=read('app/onboarding.tsx');expect(onboarding).toContain('See Who Owes What');expect(onboarding).toContain('No more bar napkin math.');
 expect(read('src/ui/PaywallTeaser.tsx')).toContain('Try Pro free for 7 days');
 const settlement=read('app/contest/[id]/settlement.tsx');expect(settlement).toContain('settlementLeader(topWinner[0], contest.status === "completed")');expect(settlement).not.toContain('ChipStack');
 const recap=read('src/ui/recap/RecapCard.tsx');expect(recap).toContain('roundProgressNotice(model.completed)');expect(recap).not.toContain('🏆');
});
