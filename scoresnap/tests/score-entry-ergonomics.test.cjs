const runNode=require('./helpers/run-node.cjs');
test('in-round score stepper and hole navigation targets meet selected 56pt design',()=>{
 runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {SCORE_STEPPER_TARGET,HOLE_NAV_TARGET}=await import('./src/ui/score-entry-metrics.ts').then(m=>m.default??m);
const screen=fs.readFileSync('app/contest/[id]/scorecard.tsx','utf8');
assert.equal(SCORE_STEPPER_TARGET,56);
assert.equal(HOLE_NAV_TARGET,56);
assert.ok(SCORE_STEPPER_TARGET>=44 && HOLE_NAV_TARGET>=44);
assert.equal((screen.match(/width: SCORE_STEPPER_TARGET/g)||[]).length,2);
assert.equal((screen.match(/height: SCORE_STEPPER_TARGET/g)||[]).length,2);
assert.equal((screen.match(/minHeight: HOLE_NAV_TARGET/g)||[]).length,2);
assert.ok(screen.includes('score-minus-'));
assert.ok(screen.includes('score-plus-'));
assert.ok(screen.includes('Decrease ' + '$' + '{player.name} score'));
assert.ok(screen.includes('Increase ' + '$' + '{player.name} score'));
assert.match(screen,/testID="score-prev-hole"/);
assert.match(screen,/testID="score-next-hole"/);
assert.match(screen,/accessibilityLabel="Previous hole"/);
assert.match(screen,/accessibilityLabel="Next hole"/);
`]);
});
