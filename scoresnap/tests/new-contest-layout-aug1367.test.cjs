const fs = require('fs');
const assert = require('node:assert');

// AUG-1367: owner smoke test of SnapScore 1.0.1 build 32 (TestFlight, RC 587e88f3,
// Nov 19 2026) found the New Contest screen broken:
//  (a) the Multi-Day switch box overflowed into its "Multi-Day Tournament" label;
//  (b) the rounds picker was hard-indented 48pt under the switch;
//  (c) Team Mode OFF read as a solid dark pill (dark thumb on a track that blended
//      into the card);
//  (d) the player card packed avatar/name/HCP/team/remove on one cramped row so the
//      HCP field and A/B team chips were clipped / misaligned.
// Root cause of (a)/(c)'s overflow: a native iOS UISwitch has a fixed ~51x31pt
// intrinsic size; forcing it into style={{ width: 44, height: 44 }} does not shrink
// it — the switch overflows the 44pt box onto the adjacent label. The fix wraps each
// switch in the pure `switchTapSlot` helper (>=44pt tap target, no forced switch box)
// and restructures the player card into deliberate wrapping rows.
const src = fs.readFileSync('app/contest/new.tsx', 'utf8');

function blockAfter(marker, end = '</Switch>') {
  const start = src.indexOf(marker);
  assert.ok(start > 0, `marker not found: ${marker}`);
  // Switch is self-closing (`/>`) here, so slice a generous window around it.
  return src.slice(start - 200, start + 600);
}

test('switchTapSlot is imported from the shared pure layout module', () => {
  assert.match(src, /import\s*\{[^}]*\bswitchTapSlot\b[^}]*\}\s*from\s*"\.\.\/\.\.\/src\/ui\/tournament-setup-layout"/);
});

test('no native Switch is forced into a width/height-constrained box', () => {
  // The forced 44x44 box is exactly what clips the native switch into its label.
  assert.doesNotMatch(src, /style=\{\{\s*width:\s*44,\s*height:\s*44\s*\}\}/);
});

test('Multi-Day Tournament switch sits in a switchTapSlot (no overlap with its label)', () => {
  const block = blockAfter('testID="tournament-toggle"');
  // The switch must be preceded by a switchTapSlot wrapper and not carry a forced box.
  const wrapIdx = src.indexOf('<View style={switchTapSlot}>', src.indexOf('Tournament Toggle'));
  const toggleIdx = src.indexOf('testID="tournament-toggle"');
  assert.ok(wrapIdx > 0 && wrapIdx < toggleIdx, 'tournament toggle must be wrapped in switchTapSlot');
  assert.doesNotMatch(block, /width:\s*44,\s*height:\s*44/);
});

test('rounds picker is no longer hard-indented 48pt', () => {
  // The whole file must not reintroduce the paddingLeft:48 indent the rounds block used.
  assert.doesNotMatch(src, /paddingLeft:\s*48/);
});

test('Team Mode switch has a contrasting off-state (not a dark pill) and a tap slot', () => {
  const start = src.indexOf('testID="team-mode"');
  assert.ok(start > 0);
  const block = src.slice(start - 120, start + 400);
  // Off-track must not be surfaceHighest (which blends into the card) and the thumb
  // must be the light card color, not the near-black text color.
  assert.doesNotMatch(block, /false:\s*COLORS\.surfaceHighest/);
  assert.doesNotMatch(block, /thumbColor=\{COLORS\.text\}/);
  assert.match(block, /false:\s*COLORS\.border/);
  assert.match(block, /thumbColor=\{COLORS\.card\}/);
  // Wrapped in the shared tap slot, no forced box.
  assert.ok(src.lastIndexOf('<View style={switchTapSlot}>', start) > start - 200,
    'team-mode switch must be wrapped in switchTapSlot');
});

test('player card stacks identity and controls on separate rows (no single cramped row)', () => {
  const start = src.indexOf('{players.map((player, idx) => {');
  assert.ok(start > 0);
  const end = src.indexOf('<AnimatedPressable\n              onPress={addPlayer}');
  const card = src.slice(start, end > 0 ? end : start + 6000);
  // Card container is a column, and the handicap/team controls live in a wrapping row.
  assert.match(card, /flexDirection:\s*"column"/);
  assert.match(card, /flexWrap:\s*"wrap"/);
  // Name field flexes to fill its row so it is never squeezed by the controls.
  const nameIdx = card.indexOf('placeholder={idx === 0 ? "Your name"');
  assert.ok(nameIdx > 0);
  // The flex:1 lives in the name TextInput's style, which follows the placeholder.
  assert.match(card.slice(nameIdx, nameIdx + 500), /flex:\s*1/);
});

test('player-team chips still meet the 44x44 tap target (AUG-1164 regression guard)', () => {
  const start = src.indexOf('onPress={() => updatePlayer(player.id, "team", isActive ? null : t.id)}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</AnimatedPressable>', start));
  assert.match(block, /minWidth:\s*44,/);
  assert.match(block, /minHeight:\s*44,/);
  assert.doesNotMatch(block, /\bheight:\s*28,/);
});
