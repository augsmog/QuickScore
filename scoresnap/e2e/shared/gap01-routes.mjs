import assert from 'node:assert/strict';

// Exercise the exported router, including browser history, on a real UI-created round.
export async function checkGap01Routes(page, contestUrl) {
  const root = new URL(contestUrl).pathname;
  const selected = name => page.getByRole('tab', {name, exact: true, selected: true});
  await page.getByTestId('round-edit').click();
  await page.waitForURL(url => url.pathname === `${root}/edit`);
  await page.getByText('Edit Contest', {exact: true}).waitFor();
  assert.equal(await page.getByTestId('contest-header').count(), 0);
  await page.goBack();
  await selected('Scorecard').waitFor();
  await page.getByRole('tab', {name: 'Games', exact: true}).click();
  await page.waitForURL(url => url.pathname === `${root}/games`);
  await page.getByText('Add a game', {exact: true}).click();
  await page.waitForURL(url => url.pathname === `${root}/edit`);
  await page.getByText('Edit Contest', {exact: true}).waitFor();
  await page.goBack();
  await page.waitForURL(url => url.pathname === `${root}/games`);
  await selected('Games').waitFor();
  await page.reload();
  await selected('Games').waitFor();

  // Use the same local round as a tournament, then restore its original data.
  const original = await page.evaluate(() => localStorage.getItem('snapscore-contests'));
  try {
    await page.evaluate(root => {
      const saved = JSON.parse(localStorage.getItem('snapscore-contests'));
      const contest = saved.state.contests.find(c => c.id === root.split('/')[2]);
      contest.isTournament = true;
      contest.currentRound = 1;
      contest.rounds = [{id: 'gap01-round', number: 1, name: 'Round 1', groups: contest.groups}];
      localStorage.setItem('snapscore-contests', JSON.stringify(saved));
    }, root);
    await page.reload();
    await page.getByTestId('round-tournament-rounds').click();
    await page.waitForURL(url => url.pathname === `${root}/tournament-rounds`);
    await page.getByText('Tournament Rounds', {exact: true}).waitFor();
    assert.equal(await page.getByTestId('contest-header').count(), 0);
    await page.goBack();
    await page.waitForURL(url => url.pathname === `${root}/games`);
    await selected('Games').waitFor();
  } catch (error) {
    console.error('GAP01 tournament return', page.url(), await page.locator('body').innerText());
    throw error;
  } finally {
    await page.evaluate(original => localStorage.setItem('snapscore-contests', original), original);
    await page.goto(contestUrl);
    await selected('Scorecard').waitFor();
  }
}
