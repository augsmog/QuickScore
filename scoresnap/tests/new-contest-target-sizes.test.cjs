const fs = require('fs');
const assert = require('node:assert');

// AUG-1164: J-free-paywall-recover/-group-first audit found the Add-Team button at
// 38px tall, the per-player team chips at 28x28/36x28, and contest-continue overlapping
// the iPhone 15 Pro/Pro Max bottom safe-area band. Measured live (chromium, draft-screen
// journey) before the fix: Add Team container 335-390 x 38, team chips 28x28, contest-continue
// bottom edge 10px past the safe band on both 15 Pro and Pro Max.
const src = fs.readFileSync('app/contest/new.tsx', 'utf8');

test('screen root clears the bottom safe-area band for the fixed footer', () => {
  assert.match(src, /<SafeScreen style=\{\{ flex: 1, backgroundColor: COLORS\.bg \}\} edges=\{\["top", "bottom"\]\}>/);
});

test('Add Team control meets the 44px tap target', () => {
  const start = src.indexOf('onPress={addTeam}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minHeight: minTarget,/);
});

test('player-team chips (<=4 teams) meet the 44x44 tap target', () => {
  const start = src.indexOf('onPress={() => updatePlayer(player.id, "team", isActive ? null : t.id)}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minWidth: minTarget,/);
  assert.match(block, /minHeight: minTarget,/);
  assert.doesNotMatch(block, /\bheight: 28,/);
});

test('player-team chips (>4 teams) meet the 44x44 tap target', () => {
  const start = src.indexOf('const nextTeam = nextIdx === teams.length ? null : teams[nextIdx].id;');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minWidth: minTarget,/);
  assert.match(block, /minHeight: minTarget,/);
  assert.doesNotMatch(block, /\bheight: 28,/);
});

// AUG-1176: J-free-paywall-recover/-group-first "modes" capture found every
// game-mode-* card (renderGameCard) rendering at 43px, 1px under the 44px minimum,
// because this renderer had no explicit minHeight unlike the other card variants.
test('game-mode picker cards meet the 44px tap target', () => {
  const start = src.indexOf('testID={`game-mode-${game.id}`}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minHeight: minTarget,/);
});

// AUG-1155: J-home-create-cancel "edit" capture found the "Number of groups"
// stepper's minus/plus buttons rendering at raw 36x36, below the 44px minimum.
test('number-of-groups stepper minus button meets the 44x44 tap target', () => {
  const start = src.indexOf('if (numGroups > 1) {');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /width: minTarget,/);
  assert.match(block, /height: minTarget,/);
  assert.doesNotMatch(block, /\bwidth: 36,/);
  assert.doesNotMatch(block, /\bheight: 36,/);
});

test('number-of-groups stepper add-group button meets the 44x44 tap target', () => {
  const start = src.indexOf('testID="add-group" accessibilityLabel="Add group"');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /width: minTarget,/);
  assert.match(block, /height: minTarget,/);
  assert.doesNotMatch(block, /\bwidth: 36,/);
  assert.doesNotMatch(block, /\bheight: 36,/);
});

// AUG-1155: J-free-paywall-recover/-group-first "inline" capture found the skins
// mode (Net/Gross) and scope (Whole field/Each group) radio buttons rendering at
// raw 40px tall, below the 44px minimum (padding:12 with no explicit minHeight).
test('skins-mode radio buttons meet the 44px tap target', () => {
  const start = src.indexOf('onPress={() => setGameConfig((prev) => ({ ...prev, skinsMode: mode }))}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minHeight: minTarget,/);
});

test('skins-scope radio buttons meet the 44px tap target', () => {
  const start = src.indexOf('onPress={() => setGameConfig(prev => ({ ...prev, skinsScope: scope }))}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minHeight: minTarget,/);
});

// AUG-1155: J-create-8p-multiday "eight-players" capture found the remove-player
// (X) button rendering at raw 24x24 (padding:4 around a 16px icon, no min target).
test('remove-player button meets the 44x44 tap target', () => {
  const start = src.indexOf('onPress={() => removePlayer(player.id)}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minWidth: minTarget,/);
  assert.match(block, /minHeight: minTarget,/);
  assert.doesNotMatch(block, /padding: 4,/);
});
