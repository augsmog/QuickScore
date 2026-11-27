// Native screenshot of the fix branch (iPhone 17 Pro simulator, 27 Nov, guest): below the Game
// Modes chips Home was blank down to the tab bar. With no active game and no finished round the
// two round sections render nothing. Decision: say so. An empty state takes their place, telling
// a new user what will appear there. It adds no button: the two ways to start are in the hero.
const fs = require('node:fs');
const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');

test('Home shows a rounds empty state only when there is no active game and no finished round', () => {
  const at = home.indexOf('testID="home-rounds-empty"');
  expect(at).toBeGreaterThan(-1);
  const guard = home.slice(home.lastIndexOf('{', home.lastIndexOf('&& (', at)), at);
  expect(guard).toContain('activeContests.length === 0 && completedContests.length === 0 && (');
});

test('it sits after Game Modes, where the blank space was, inside the scroll view', () => {
  const at = home.indexOf('testID="home-rounds-empty"');
  expect(at).toBeGreaterThan(home.indexOf('{/* ── Game Modes ── */}'));
  expect(at).toBeLessThan(home.indexOf('</ScrollView>'));
});

test('it names the section, says what is missing and what will appear, and is read as one item', () => {
  const at = home.indexOf('testID="home-rounds-empty"');
  const block = home.slice(home.lastIndexOf('&& (', at), home.indexOf(')}', at));
  expect(block).toContain('YOUR ROUNDS');
  expect(block).toContain('No rounds yet');
  expect(block).toContain('Rounds you start show up here, and stay after you settle up.');
  expect(block).toContain('accessible');
  expect(block).not.toMatch(/onPress|Pressable/); // no second start button
});
