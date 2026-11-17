const fs = require('fs');
const assert = require('node:assert');

// AUG-1155: J-create-8p-multiday "created" capture found the multi-group
// scorecard's "Group 1"/"Group 2" selector pills rendering at raw 69x29,
// below the 44px minimum (paddingVertical:6, no explicit minHeight).
const src = fs.readFileSync('app/contest/[id]/index.tsx', 'utf8');

test('group selector pills meet the 44px tap target', () => {
  const start = src.indexOf('{/* Group Selector (if multiple groups) */}');
  assert.ok(start > 0);
  const block = src.slice(start, src.indexOf('</Pressable>', start));
  assert.match(block, /minHeight: 44,/);
});
