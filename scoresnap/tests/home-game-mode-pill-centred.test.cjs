// Build 34 on the owner's phone: on Home, the GAME MODES pills ("Stroke Play", "Match Play") had
// their label pushed to the left of a wide pill. The pill has a fixed width; its content was not
// centred in it. The label (and the "Soon" tag when there is one) is now centred as a group.
const fs = require('node:fs');
const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');

test('a Home game-mode pill centres its label', () => {
  const list = home.slice(home.indexOf('data={allGameNames}'), home.indexOf('{/* ── Recent Rounds ── */}'));
  const pill = list.slice(list.indexOf('<Pressable'), list.indexOf('{/* icon removed */}'));
  expect(pill).toContain('width: modeChipWidth');
  expect(pill).toContain('flexDirection: "row"');
  expect(pill).toContain('alignItems: "center"');
  expect(pill).toContain('justifyContent: "center"');
  const label = list.slice(list.indexOf('{/* icon removed */}'), list.indexOf('{item.name}'));
  expect(label).toContain('textAlign: "center"');
  expect(label).toContain('flexShrink: 1');
});
