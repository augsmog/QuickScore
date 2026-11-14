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

test('consumer report retains host actions across close/reopen without duplicating snapshots', async () => {
  const { ObservationArchive, observeConsumerActions, writeConsumerReport } = await import('../e2e/xdevice-consumer-report.mjs');
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
  const out = await mkdtemp(path.join(tmpdir(), 'consumer-report-'));
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    await context.addInitScript(observeConsumerActions);
    await context.route('http://consumer.test/**', route => route.fulfill({ contentType: 'text/html', body: '<button>Create competition</button><button>Share code</button><button>Approve request</button><button>Retry sync</button>' }));
    const old = await context.newPage();
    await old.goto('http://consumer.test/');
    for (const name of ['Create competition', 'Share code', 'Approve request']) await old.getByRole('button', { name, exact: true }).click();
    const archive = new ObservationArchive();
    await archive.archive(0, old);
    await archive.archive(0, old); // Archiving the same retiring page is idempotent.
    await old.close();
    const fresh = await context.newPage();
    await fresh.goto('http://consumer.test/');
    const empty = await context.newPage();
    await empty.goto('http://consumer.test/');
    const devices = [{ name: 'iPhone SE' }, { name: 'iPad' }];
    const report = () => writeConsumerReport({ pages: [fresh, empty], devices, out, observations: archive });
    await report();
    await fresh.getByRole('button', { name: 'Retry sync', exact: true }).click();
    await report();
    await report(); // Reading does not consume or append the live page snapshot.
    const receipt = JSON.parse(await readFile(path.join(out, 'consumer-ux.json'), 'utf8'));
    assert.deepEqual(receipt.rows[0].targets.map(target => target.label), ['Create competition', 'Share code', 'Approve request', 'Retry sync']);
    assert.equal(receipt.rows[0].activations, 4);
    assert.equal(receipt.rows[0].persona, 'group organizer');
    assert.equal(receipt.rows[0].device, 'iPhone SE');
    assert.equal(receipt.rows[1].activations, 0);
    assert.match(receipt.rows[1].findability, /NOT ASSESSED/);
    assert.match(await readFile(path.join(out, 'consumer-ux.md'), 'utf8'), /group organizer.*iPhone SE.*4/);
  } finally { await browser.close(); await rm(out, { recursive: true, force: true }); }
});

test('failed observation archival can retry without losing events or changing other participants', async () => {
  const { ObservationArchive } = await import('../e2e/xdevice-consumer-report.mjs');
  const archive = new ObservationArchive();
  let fail = true;
  const old = { evaluate: async () => { if (fail) throw new Error('read interrupted'); return [{ type: 'activate', label: 'Create' }]; } };
  await assert.rejects(archive.archive(0, old), /read interrupted/);
  fail = false;
  await archive.archive(0, old);
  const later = { evaluate: async () => [{ type: 'activate', label: 'Retry' }] };
  const empty = { evaluate: async () => [] };
  assert.deepEqual(await archive.collect([later, empty]), [[{ type: 'activate', label: 'Create' }, { type: 'activate', label: 'Retry' }], []]);
  assert.deepEqual(await archive.collect([old, empty]), [[{ type: 'activate', label: 'Create' }], []]);
});
