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
  assert.match(block, /minHeight: 44,/);
});

test('player-team chips (<=4 teams) meet the 44x44 tap target', () => {
  const start = src.indexOf('onPress={() => updatePlayer(player.id, "team", isActive ? null : t.id)}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minWidth: 44,/);
  assert.match(block, /minHeight: 44,/);
  assert.doesNotMatch(block, /\bheight: 28,/);
});

test('player-team chips (>4 teams) meet the 44x44 tap target', () => {
  const start = src.indexOf('const nextTeam = nextIdx === teams.length ? null : teams[nextIdx].id;');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minWidth: 44,/);
  assert.match(block, /minHeight: 44,/);
  assert.doesNotMatch(block, /\bheight: 28,/);
});

// AUG-1176: J-free-paywall-recover/-group-first "modes" capture found every
// game-mode-* card (renderGameCard) rendering at 43px, 1px under the 44px minimum,
// because this renderer had no explicit minHeight unlike the other card variants.
test('game-mode picker cards meet the 44px tap target', () => {
  const start = src.indexOf('testID={`game-mode-${game.id}`}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minHeight: 44,/);
});
