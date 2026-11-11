import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.BASE_URL;
const out = process.env.OUT_DIR || 'e2e/journey-screens/pro-off-free';
if (!base) throw new Error('BASE_URL is required');
fs.mkdirSync(out, { recursive: true });
fs.rmSync(path.join(out, 'run-log.json'), { force: true });
const trace = [];
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
let page;
let startingRound = false;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.addInitScript(origin => {
    if (location.origin !== origin) return;
    if (!localStorage.getItem('pro-off-free-seeded')) {
      localStorage.setItem('snapscore-onboarding', JSON.stringify({ version: 0, state: { hasCompletedOnboarding: true, hasSeenDemo: true } }));
      localStorage.setItem('snapscore-scans', JSON.stringify({ version: 1, state: { tier: 'free', isPro: false, isTD: false, scanMonth: '', scansUsed: 0 } }));
      localStorage.setItem('pro-off-free-seeded', '1');
    }
  }, new URL(base).origin);
  page = await context.newPage();
  page.on('pageerror', error => {
    trace.push({ type: 'pageerror', message: error.message });
    if (startingRound && /Your plan does not include this hosting configuration/i.test(error.message)) {
      trace.push({ type: 'first-pro-gate', screen: 'skins-create', text: error.message });
    }
  });
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  trace.push({ type: 'boot', url: page.url(), onboarding: await page.evaluate(() => localStorage.getItem('snapscore-onboarding')) });
  await page.getByTestId('home-new-contest').waitFor({ state: 'visible' });
  await page.getByTestId('home-new-contest').click();
  await page.getByPlaceholder('Your name', { exact: true }).fill('Flag Off Golfer');
  await page.getByPlaceholder('Player 2 name', { exact: true }).fill('Flag Off Partner');
  await page.getByPlaceholder('My Course', { exact: true }).fill('Flag Off Course');
  await page.getByTestId('contest-continue').click();
  const modes = page.getByTestId('contest-step-gamemodes');
  await modes.waitFor({ state: 'visible' });
  const skins = modes.getByTestId('game-mode-skins');
  await skins.waitFor({ state: 'visible' });
  await skins.click();
  assert.equal(await modes.getByTestId('skins-mode-net').count(), 1, 'Skins must be selectable as a former-Pro game');
  await page.getByTestId('contest-continue').click();
  await page.getByTestId('contest-step-round-settings').waitFor({ state: 'visible' });
  startingRound = true;
  await page.getByTestId('contest-start').click();
  let created = false;
  try { await page.getByTestId('contest-screen').waitFor({ state: 'visible', timeout: 5000 }); created = true; } catch {}
  if (!created) {
    const gate = trace.find(item => item.type === 'first-pro-gate');
    if (gate) {
      await page.screenshot({ path: path.join(out, 'first-pro-gate-skins-create.png'), fullPage: true });
      fs.writeFileSync(path.join(out, 'run-log.json'), JSON.stringify(trace, null, 2));
      console.error(`FIRST_PRO_GATE skins-create: ${gate.text}`);
      throw new Error('Flag-on journey stopped at the first Pro gate while creating the Skins round');
    }
    throw new Error('Round creation did not complete and no first Pro gate was observed');
  }
  startingRound = false;
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('snapscore-contests'));
    const contest = saved.state.contests.at(-1);
    if (!contest || contest.groups.length !== 1 || contest.games.includes('skins') !== true) throw new Error(`Expected the newly created single-group Skins round: ${JSON.stringify({ active: saved.state.activeContestId, count: saved.state.contests.length, groups: contest?.groups?.length, games: contest?.games })}`);
    contest.groups[0].players.forEach((player, index) => { player.scores = Array.from({ length: contest.course.holes.length }, () => index === 0 ? 4 : 5); });
    localStorage.setItem('snapscore-contests', JSON.stringify(saved));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('contest-screen').waitFor({ state: 'visible' });
  const contest = page.getByTestId('contest-screen');
  await contest.getByRole('tab', { name: 'Settlement', exact: true }).click();
  const freeSettlement = page.getByTestId('settle-free');
  await Promise.race([
    freeSettlement.waitFor({ state: 'visible' }),
    page.getByTestId('settlement-scroll').waitFor({ state: 'visible' }),
  ]);
  const gated = await freeSettlement.count();
  if (gated) {
    await page.screenshot({ path: path.join(out, 'first-pro-gate-settlement.png'), fullPage: true });
    const text = (await freeSettlement.innerText()).replace(/\s+/g, ' ').trim();
    trace.push({ type: 'first-pro-gate', screen: 'settlement', text });
    fs.writeFileSync(path.join(out, 'run-log.json'), JSON.stringify(trace, null, 2));
    console.error(`FIRST_PRO_GATE settlement: ${text}`);
    throw new Error('Flag-on journey stopped at the first Pro gate on Settlement');
  }
  await page.getByTestId('settlement-scroll').waitFor({ state: 'visible' });
  const settlementText = (await page.getByTestId('settlement-scroll').innerText()).replace(/\s+/g, ' ').trim();
  assert.match(settlementText, /\$\d+\.\d{2}/, 'Settle up must render an amount');
  assert.doesNotMatch(settlementText, /PaywallTeaser|Upgrade|Try Pro|See all plans|part of SnapScore Pro/i);
  await page.screenshot({ path: path.join(out, 'settlement.png'), fullPage: true });
  trace.push({ type: 'settlement', text: settlementText });

  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-new-contest').waitFor({ state: 'visible' });
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();
  const statistics = page.getByText('Statistics', { exact: true });
  await statistics.first().waitFor({ state: 'visible' });
  await statistics.first().click();
  await page.waitForURL(url => url.pathname === '/statistics');
  const statisticsHeading = page.getByText('Statistics', { exact: true }).last();
  await statisticsHeading.waitFor({ state: 'visible' });
  assert.equal(new URL(page.url()).pathname, '/statistics', 'Profile action must navigate to the Statistics screen');
  const statsText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  assert.doesNotMatch(statsText, /Statistics with SnapScore Pro|See settlement, statistics, game variants, and unlimited cloud scans with Pro|Try Pro free for 7 days|Back to scores|free cloud scans this month|Upgrade to SnapScore Pro|Upgrade|Pro plan badge/i);
  assert.match(statsText, /Statistics/);
  await page.screenshot({ path: path.join(out, 'statistics.png'), fullPage: true });
  trace.push({ type: 'statistics', text: statsText.slice(0, 1200) });
  assert.deepEqual(trace.filter(x => x.type === 'pageerror'), [], 'page must not report runtime errors');
  fs.writeFileSync(path.join(out, 'run-log.json'), JSON.stringify(trace, null, 2));
  console.log('PRO_OFF_FREE_PASS: skins selected, settlement amount rendered, Statistics opened without a Pro gate');
} catch (error) {
  try { await page?.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }); } catch {}
  fs.writeFileSync(path.join(out, 'run-log.json'), JSON.stringify([...trace, { type: 'failure', message: error.message }], null, 2));
  throw error;
} finally {
  await browser.close();
}
