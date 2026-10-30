const runNode=require('./helpers/run-node.cjs');
test('variations inherit every parent game tier, preserve four Free games and TD hosting gates',()=>{
 runNode(['--import','tsx','--input-type=module','-e',`
 import assert from 'node:assert/strict';
 const e=await import('./src/services/entitlements.ts').then(m=>m.default??m);
 const t=await import('./src/engine/types.ts').then(m=>m.default??m);
 assert.deepEqual(e.FREE_GAMES,['stroke_play','match_play','stableford','best_ball']);
 for(const v of t.GAME_VARIATIONS) for(const game of v.appliesTo) {
  assert.equal(e.canUseGame(game,'free'),e.FREE_GAMES.includes(game));
  assert.equal(e.canUseGame(game,'pro'),true);assert.equal(e.canUseGame(game,'td'),true);
 }
 assert.equal(e.canHostTournament({numGroups:2},'pro'),false);
 assert.equal(e.canHostTournament({numRounds:2},'pro'),false);
 assert.equal(e.canHostTournament({numRounds:2},'td'),true);
 assert.equal(e.canSeeSettlement('free'),false);
 `]);
});
