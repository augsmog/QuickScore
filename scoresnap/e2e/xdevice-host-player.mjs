import assert from 'node:assert/strict';

// Scorecard renders only the selected group. Resolve it from the authorized
// snapshot rather than assuming every player is in the host's initial group.
export async function selectHostPlayer(page, round, name) {
  const players = round?.players.filter(player => player.displayName === name) ?? [];
  assert.equal(players.length, 1, `Expected one snapshot player: ${name}`);
  const groups = round.groups.filter(group => group.id === players[0].group_id);
  assert.equal(groups.length, 1, `Expected one snapshot group for player: ${name}`);
  const [group] = groups;
  assert.equal(round.groups.filter(candidate => candidate.name === group.name).length, 1, 'Ambiguous snapshot group name');
  const sheet = page.getByTestId('round-status-sheet');
  if (await sheet.isVisible()) {
    await page.getByTestId('round-status-done').click();
    await sheet.waitFor({ state: 'hidden' });
  }
  if (round.groups.length > 1) {
    await page.getByText(group.name, { exact: true }).filter({ visible: true }).first().click();
  }
  const score = page.getByTestId(`score-par-${name}`);
  await score.waitFor({ state: 'visible' });
  return score;
}
