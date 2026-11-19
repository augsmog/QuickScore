const runNode=require('./helpers/run-node.cjs');
test('Next hole warns before advancing with an unscored player, and Save pars actually saves par (AUG-291)',()=>{
 runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync('app/contest/[id]/index.tsx','utf8');

// allScoredOnHole is computed once from the shared hole-nav helper, ahead of
// handleNextHole, and reused for both the warning gate and Next-button styling.
assert.equal((ui.match(/const allScoredOnHole = computeAllScoredOnHole\\(/g)||[]).length,1);

const nextHole=ui.slice(ui.indexOf('const handleNextHole = useCallback'),ui.indexOf('const handlePrevHole'));
assert.ok(nextHole.includes('if (!allScoredOnHole) {'),'handleNextHole must gate on allScoredOnHole');
assert.ok(nextHole.includes('showAlert('),'unscored players must surface a visible warning');
assert.ok(nextHole.includes('"Confirmation required"'));
assert.ok(nextHole.includes('{ text: "Stay", style: "cancel" }'),'cancelling must stay on the hole, not silently advance');
assert.ok(nextHole.includes('{ text: "Save pars", onPress: saveParsAndProceed }'),'the approved action actually saves par, not just dismisses the warning');

// Save pars must persist a real score (not just advance) for every unscored
// player on the current hole, via the same store call manual par-entry uses.
assert.ok(nextHole.includes('const saveParsAndProceed = () => {'));
assert.ok(nextHole.includes('for (const p of playersNeedingPar(displayPlayers, currentHole)) {'));
assert.ok(nextHole.includes('updateScore(contest.id, group.id, p.id, currentHole, par);'));

// The existing Tier-2 aux-prompt / advance behavior must still run after
// pars are saved (or skipped entirely when the hole is already fully scored).
assert.ok(nextHole.includes('setShowAuxPrompt(true)'));
assert.ok(nextHole.includes('advanceToNextHole()'));
`]);
});
