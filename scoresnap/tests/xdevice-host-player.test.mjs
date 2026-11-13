import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { selectHostPlayer } from '../e2e/xdevice-host-player.mjs';

const round = {
  groups: [{ id: 'g1', name: 'Group 1' }, { id: 'g2', name: 'Group 2' }],
  players: [
    { displayName: 'Charlie', group_id: 'g1' },
    { displayName: 'Bravo', group_id: 'g2' },
  ],
};

test('host selects each snapshot group after closing the sheet; wrong scores remain detectable', async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(1500);
    await page.setContent(`
      <button onclick="render('Charlie', 6)">Group 1</button>
      <button onclick="render('Bravo', 5)">Group 2</button>
      <div id="players"></div>
      <div data-testid="round-status-sheet" style="position:fixed;inset:0;background:white">
        <span>Current online snapshot</span>
        <button data-testid="round-status-done" onclick="this.parentElement.hidden=true">Done</button>
      </div>
      <script>
        function render(name, score) {
          document.querySelector('#players').innerHTML = '<div><span>' + name + '</span><span>Thru 1 — ' + score + ' (+1)</span></div>'
            + '<button data-testid="score-par-' + name + '"><span>' + score + '</span></button>';
        }
        render('Charlie', 6);
      </script>`);
    assert.equal(await page.getByTestId('score-par-Bravo').count(), 0);
    await selectHostPlayer(page, round, 'Bravo');
    assert.equal(await page.getByTestId('round-status-sheet').isVisible(), false);
    const assertBravoScore = async () => assert.equal(await page.getByTestId('score-par-Bravo').innerText(), '5');
    await assertBravoScore();
    assert.equal(await page.getByText('Bravo', { exact: true }).locator('..').getByText(/^Thru 1 — 5 \(/).isVisible(), true);
    // A synchronized payload cannot hide an incorrect rendered value.
    await page.getByTestId('score-par-Bravo').locator('span').evaluate(el => el.textContent = '9');
    await assert.rejects(assertBravoScore(), /'9' !== '5'/);
    await selectHostPlayer(page, round, 'Charlie');
    assert.equal(await page.getByTestId('score-par-Charlie').innerText(), '6');
    await assert.rejects(selectHostPlayer(page, round, 'Missing'), /snapshot player/);
    await assert.rejects(selectHostPlayer(page, { ...round, groups: [] }, 'Bravo'), /snapshot group/);
  } finally { await browser.close(); }
});

test('ambiguous player and group metadata cannot silently select the first match', async () => {
  await assert.rejects(selectHostPlayer({}, { ...round, players: [...round.players, round.players[1]] }, 'Bravo'), /one snapshot player/);
  await assert.rejects(selectHostPlayer({}, { ...round, groups: [...round.groups, round.groups[1]] }, 'Bravo'), /one snapshot group/);
  await assert.rejects(selectHostPlayer({}, { ...round, groups: round.groups.map(group => ({ ...group, name: 'Same' })) }, 'Bravo'), /Ambiguous snapshot group name/);
});
