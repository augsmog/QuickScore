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

    // AUG-1129: observe real browser Back after reload beyond the first render,
    // including Forward and another Back, to catch a deferred second popstate.
    for (const tab of ['Games', 'Leaderboard']) {
      for (const entry of ['round-edit', 'add-game', 'round-tournament-rounds']) {
        if (entry === 'add-game' && tab !== 'Games') continue;
        await page.getByRole('tab', {name: tab, exact: true}).click();
        await selected(tab).waitFor();
        await page.reload();
        await selected(tab).waitFor();
        const tabPath = new URL(page.url()).pathname;
        const child = entry === 'round-tournament-rounds' ? 'tournament-rounds' : 'edit';
        if (entry === 'add-game') await page.getByText('Add a game', {exact: true}).click();
        else await page.getByTestId(entry).click();
        await page.waitForURL(url => url.pathname === `${root}/${child}`);
        await page.getByText(child === 'edit' ? 'Edit Contest' : 'Tournament Rounds', {exact: true}).waitFor();
        await page.evaluate(() => {
          window.__gap01Pops = [];
          window.addEventListener('popstate', () => window.__gap01Pops.push(location.pathname));
        });
        const back = async () => {
          await page.evaluate(() => { window.__gap01Pops = []; });
          await page.goBack();
          await page.waitForURL(url => url.pathname === tabPath);
          await selected(tab).waitFor();
          // React Navigation queues history reconciliation asynchronously.
          await page.waitForTimeout(500);
          assert.equal(new URL(page.url()).pathname, tabPath, `${entry}: stable Back URL after reload`);
          assert.equal(await selected(tab).count(), 1, `${entry}: stable selected ${tab}`);
          assert.deepEqual(await page.evaluate(() => window.__gap01Pops), [tabPath], `${entry}: exactly one browser Back`);
          if (tab === 'Games') await page.getByText('Add a game', {exact: true}).waitFor();
          else await page.getByText('No scores yet', {exact: true}).waitFor();
        };
        await back();
        await page.goForward();
        await page.waitForURL(url => url.pathname === `${root}/${child}`);
        await page.getByText(child === 'edit' ? 'Edit Contest' : 'Tournament Rounds', {exact: true}).waitFor();
        await back();
        console.log(`PASS: AUG-1129 ${tab} reload -> ${entry} -> Back/Forward/Back (one popstate per Back)`);
        // Explicit screen Back also preserves the origin when the child itself reloads.
        if (entry === 'add-game') await page.getByText('Add a game', {exact: true}).click();
        else await page.getByTestId(entry).click();
        await page.waitForURL(url => url.pathname === `${root}/${child}`);
        await page.reload();
        await page.getByTestId('round-child-back').click();
        await page.waitForURL(url => url.pathname === tabPath);
        await selected(tab).waitFor();
        await page.waitForTimeout(500);
        assert.equal(new URL(page.url()).pathname, tabPath, `${entry}: explicit Back after child reload`);
        assert.equal(await selected(tab).count(), 1);
        console.log(`PASS: AUG-1129 ${tab} -> ${entry} reload -> explicit Back`);
      }
    }
  } catch (error) {
    console.error('GAP01 tournament return', page.url(), await page.locator('body').innerText());
    throw error;
  } finally {
    await page.evaluate(original => localStorage.setItem('snapscore-contests', original), original);
    await page.goto(contestUrl);
    await selected('Scorecard').waitFor();
  }
}
