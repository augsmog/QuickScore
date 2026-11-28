const fs = require('fs');
const assert = require('node:assert');

// AUG-1164: J-free-paywall-recover/-group-first audit found the Add-Team button at
// 38px tall, the per-player team chips at 28x28/36x28, and contest-continue overlapping
// the iPhone 15 Pro/Pro Max bottom safe-area band. Measured live (chromium, draft-screen
// journey) before the fix: Add Team container 335-390 x 38, team chips 28x28, contest-continue
// bottom edge 10px past the safe band on both 15 Pro and Pro Max.
//
// AUG-1376 (device-layout gate): the fixed 44pt literals were replaced by the platform-aware
// `SETUP_MIN_TARGET` token (and the shared `setupTargets()` style objects), which is 44pt on
// iOS/web and 48dp on Android — because Android Material tap targets must be >=48dp. These tests
// therefore assert each control is sized from that platform-aware token (so it meets whichever
// minimum the running platform requires), not a hard-coded 44; the numeric >=44/>=48 guarantee of
// the token itself is proven in e2e/tournament-setup-layout.test.mjs. The intent — every New
// Contest tap target clears the minimum — is unchanged; the old undersized literals are still
// guarded against.
const src = fs.readFileSync('app/contest/new.tsx', 'utf8');

// The platform-aware minimum is destructured from setupTargets(Platform.OS) — 44pt iOS/web,
// 48dp Android. Every tap-target assertion below is against this token, not a fixed 44.
test('tap targets are sized from the platform-aware setupTargets(Platform.OS) minimum', () => {
  assert.match(src, /import\s*\{[^}]*\bsetupTargets\b[^}]*\}\s*from\s*"\.\.\/\.\.\/src\/ui\/tournament-setup-layout"/);
  assert.match(src, /minTarget:\s*SETUP_MIN_TARGET[\s\S]{0,400}=\s*setupTargets\(Platform\.OS\)/);
});

test('screen root clears the bottom safe-area band for the fixed footer', () => {
  // The edges now come from modalSheetSafeEdges(Platform.OS): on iPhone the sheet drops the TOP
  // inset (tests/new-contest-sheet-header.test.cjs). The BOTTOM inset, which is what keeps the
  // fixed footer clear of the home indicator, must be there on every platform.
  assert.match(src, /<SafeScreen style=\{\{ flex: 1, backgroundColor: COLORS\.bg \}\} edges=\{modalSheetSafeEdges\(Platform\.OS\)\}>/);
  const ts = require('typescript');
  const m = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/ui/tournament-setup-layout.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
  for (const os of ['ios', 'android', 'web', undefined]) assert.ok(m.exports.modalSheetSafeEdges(os).includes('bottom'), `bottom inset missing on ${os}`);
});

test('Add Team control meets the platform tap target', () => {
  const start = src.indexOf('onPress={addTeam}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minHeight: SETUP_MIN_TARGET,/);
  assert.doesNotMatch(block, /minHeight: 38,/);
});

test('player-team chips (<=4 teams) meet the platform tap target', () => {
  const start = src.indexOf('onPress={() => updatePlayer(player.id, "team", isActive ? null : t.id)}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  // Chips use the shared platform-aware teamChipStyle (square >= SETUP_MIN_TARGET + horizontal pad).
  assert.match(block, /\.\.\.teamChipStyle,/);
  assert.doesNotMatch(block, /\bheight: 28,/);
  assert.doesNotMatch(block, /\bwidth: 28,/);
});

test('player-team chips (>4 teams) meet the platform tap target', () => {
  const start = src.indexOf('const nextTeam = nextIdx === teams.length ? null : teams[nextIdx].id;');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minWidth: SETUP_MIN_TARGET,/);
  assert.match(block, /minHeight: SETUP_MIN_TARGET,/);
  assert.doesNotMatch(block, /\bheight: 28,/);
});

// AUG-1176: J-free-paywall-recover/-group-first "modes" capture found every
// game-mode-* card (renderGameCard) rendering at 43px, 1px under the 44px minimum,
// because this renderer had no explicit minHeight unlike the other card variants.
test('game-mode picker cards meet the platform tap target', () => {
  const start = src.indexOf('testID={`game-mode-${game.id}`}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minHeight: SETUP_MIN_TARGET,/);
});

// AUG-1155: J-home-create-cancel "edit" capture found the "Number of groups"
// stepper's minus/plus buttons rendering at raw 36x36, below the 44px minimum.
test('number-of-groups stepper minus button meets the platform tap target', () => {
  const start = src.indexOf('if (numGroups > 1) {');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /width: SETUP_MIN_TARGET,/);
  assert.match(block, /height: SETUP_MIN_TARGET,/);
  assert.doesNotMatch(block, /\bwidth: 36,/);
  assert.doesNotMatch(block, /\bheight: 36,/);
});

test('number-of-groups stepper add-group button meets the platform tap target', () => {
  const start = src.indexOf('testID="add-group" accessibilityLabel="Add group"');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /width: SETUP_MIN_TARGET,/);
  assert.match(block, /height: SETUP_MIN_TARGET,/);
  assert.doesNotMatch(block, /\bwidth: 36,/);
  assert.doesNotMatch(block, /\bheight: 36,/);
});

// AUG-1155: J-free-paywall-recover/-group-first "inline" capture found the skins
// mode (Net/Gross) and scope (Whole field/Each group) radio buttons rendering at
// raw 40px tall, below the 44px minimum (padding:12 with no explicit minHeight).
test('skins-mode radio buttons meet the platform tap target', () => {
  const start = src.indexOf('onPress={() => setGameConfig((prev) => ({ ...prev, skinsMode: mode }))}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minHeight: SETUP_MIN_TARGET,/);
});

test('skins-scope radio buttons meet the platform tap target', () => {
  const start = src.indexOf('onPress={() => setGameConfig(prev => ({ ...prev, skinsScope: scope }))}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minHeight: SETUP_MIN_TARGET,/);
});

// AUG-1155: J-create-8p-multiday "eight-players" capture found the remove-player
// (X) button rendering at raw 24x24 (padding:4 around a 16px icon, no min target).
test('remove-player button meets the platform tap target', () => {
  const start = src.indexOf('onPress={() => removePlayer(player.id)}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minWidth: SETUP_MIN_TARGET,/);
  assert.match(block, /minHeight: SETUP_MIN_TARGET,/);
  assert.doesNotMatch(block, /padding: 4,/);
});

// AUG-1208: the same button had a name but no role, so a screen reader did not call it a button.
test('remove-player button is announced as a button with the player\'s name', () => {
  const end = src.indexOf('onPress={() => removePlayer(player.id)}');
  const block = src.slice(src.lastIndexOf('<AnimatedPressable', end), end);
  assert.match(block, /accessibilityRole="button"/);
  assert.match(block, /accessibilityLabel=\{`Remove \$\{player\.name \|\| "player"\}`\}/);
});
