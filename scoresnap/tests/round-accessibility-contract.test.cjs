const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const journeys = JSON.parse(read('e2e/journeys/journeys.json')).journeys;

function features(id) {
  const journey = journeys.find(item => item.id === id);
  expect(journey).toBeDefined();
  return journey.features;
}

test('round score, tabs, and invite semantics are fully gated by exact roles and names', () => {
  const round = features('J-round-score-settle-reload');
  for (const [name, role, accessibleName] of [
    ['score-Augie', 'button', 'Set Augie score to par'],
    ['score-Sam', 'button', 'Set Sam score to par'],
    ['settle', 'tab', 'Settlement'],
    ['leaderboard', 'tab', 'Leaderboard'],
  ]) {
    const feature = round.find(item => item.name === name);
    expect(feature).toMatchObject({ role, accessibleName });
    expect(feature.reachability).toBeUndefined();
  }

  const invite = features('J-invite-from-round').find(item => item.name === 'invite');
  expect(invite).toMatchObject({ role: 'button', accessibleName: 'Invite players' });
  expect(invite.reachability).toBeUndefined();
});

test('round controls publish the same semantics in their React Native components', () => {
  const scorecard = read('app/contest/[id]/index.tsx');
  const tabs = read('app/contest/[id]/_layout.tsx');
  const invite = read('src/ui/ContestJoinCode.tsx');

  expect(scorecard).toMatch(/testID=\{`score-par-\$\{player\.name\}`\}[\s\S]{0,180}accessibilityRole="button"[\s\S]{0,120}accessibilityLabel=\{`Set \$\{player\.name\} score to par`\}/);
  expect(tabs).toMatch(/accessibilityRole="tab"[\s\S]{0,100}accessibilityLabel=\{tab\.label\}[\s\S]{0,140}accessibilityState=\{\{ selected: activeTab === tab\.key \}\}[\s\S]{0,100}aria-selected=\{activeTab === tab\.key\}/);
  expect(invite).toMatch(/<Pressable accessibilityRole="button" accessibilityLabel="Invite players" onPress=\{share\}/);
});
