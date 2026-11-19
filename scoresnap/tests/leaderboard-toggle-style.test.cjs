const fs = require('fs');
const assert = require('node:assert');

// AUG-619: Gross/Net control must match Figma 11:43 (compact pill, theme tokens).
// AUG-253b moved the individual rows into the virtualized LeaderboardResultsList, so the
// toggle markup now ends where the screen hands off to <LeaderboardResultsList> (the old
// `{individualResults.map` row loop no longer lives in this file); slice to that boundary.
const src = fs.readFileSync('app/contest/[id]/index.tsx', 'utf8');
const start = src.indexOf('testID="leaderboard-rank-toggle"');
// Slice exactly the `grossNetToggle` const (ends at its `) : null;` ternary tail),
// not everything up to <LeaderboardResultsList — the individual header now also
// holds the AUG-735 player-search field, which has its own styling and must not
// be folded into the toggle-styling assertions.
const block = src.slice(start, src.indexOf(') : null;', start));

test('toggle is compact 150x36, right-aligned pill on surfaceMid', () => {
  assert.ok(start > 0);
  const pre = src.slice(start - 200, start);
  assert.match(pre, /justifyContent: "flex-end"/);
  assert.match(block, /width: 150, height: 36, backgroundColor: COLORS\.surfaceMid, borderRadius: RADII\.full, padding: 2, gap: 2/);
});

test('segments are 72 wide pills with primary/onPrimary active state', () => {
  assert.equal((block.match(/width: 72,/g) || []).length, 2);
  assert.equal((block.match(/borderRadius: RADII\.full,/g) || []).length, 3);
  assert.match(block, /COLORS\.primary : "transparent"/);
  assert.match(block, /fontFamily: FONTS\.semibold, fontSize: 15, color: COLORS\.onPrimary/);
  assert.match(block, /\.\.\.TYPOGRAPHY\.caption, color: COLORS\.textDim/);
  assert.doesNotMatch(block, /surfaceLow|surfaceHigh|fontSize: 13|RADII\.md/);
  assert.doesNotMatch(block, /#[0-9A-Fa-f]{3,6}/);
});
