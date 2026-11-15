const runNode=require('./helpers/run-node.cjs');
test('Next hole warns before advancing with an unscored player, but can still advance (AUG-291)',()=>{
 runNode(['--import','tsx','--input-type=module','-e',`
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync('app/contest/[id]/index.tsx','utf8');

// allScoredOnHole is computed once, ahead of handleNextHole, and reused for both
// the warning gate and the Next-button styling (no duplicate computation).
assert.equal((ui.match(/const allScoredOnHole = displayPlayers\\.every\\(/g)||[]).length,1);

const nextHole=ui.slice(ui.indexOf('const handleNextHole = useCallback'),ui.indexOf('const handlePrevHole'));
assert.ok(nextHole.includes('if (!allScoredOnHole) {'),'handleNextHole must gate on allScoredOnHole');
assert.ok(nextHole.includes('showAlert('),'unscored players must surface a visible warning');
assert.ok(nextHole.includes('"Confirmation required"'));
assert.ok(nextHole.includes('{ text: "Keep Scoring", style: "cancel" }'),'cancelling must stay on the hole, not silently advance');
assert.ok(nextHole.includes('{ text: "Continue Anyway", onPress: proceed }'),'organizer can still choose to move on');

// The existing Tier-2 aux-prompt / advance behavior must still run after the
// warning is dismissed (or skipped entirely when the hole is fully scored).
assert.ok(nextHole.includes('setShowAuxPrompt(true)'));
assert.ok(nextHole.includes('advanceToNextHole()'));
`]);
});
