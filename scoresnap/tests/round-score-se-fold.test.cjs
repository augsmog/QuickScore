const fs = require('fs');
const assert = require('node:assert');

// AUG-1243: once AUG-1155 wired real safe-area simulation into every journey, the
// iphone-se profile's 20px status-bar inset left the second player's score row
// clipped ~11px below the player-score ScrollView's fold (J-round-score-settle-reload
// / J-score-hand both failed on score-Sam with "outside-viewport-or-clipped" at
// {x:144,y:533,width:90,height:63}). Fixed by reclaiming a few more px of vertical
// room on sub-700px-tall viewports; this guards the reclaim against being reverted.
const src = fs.readFileSync('app/contest/[id]/index.tsx', 'utf8');

test('very-compact (SE-class, <700px) viewports reclaim vertical room above and within the player-score list', () => {
  assert.match(src, /const veryCompact = Dimensions\.get\("window"\)\.height < 700;/);
  const start = src.indexOf('{/* ── Player Score Steppers ── */}');
  assert.ok(start > 0);
  const scrollViewBlock = src.slice(start, src.indexOf('showsVerticalScrollIndicator', start));
  assert.match(scrollViewBlock, /marginTop: veryCompact \? 0 /);
  assert.match(scrollViewBlock, /paddingBottom: veryCompact \? 2 /);
  assert.match(scrollViewBlock, /gap: veryCompact \? 2 /);
});
