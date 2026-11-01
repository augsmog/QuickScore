import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:8089';
assert(['true', 'false'].includes(process.env.EXPECT_CROSS_DEVICE_SHARING), 'explicit sharing expectation required');
const sharing = process.env.EXPECT_CROSS_DEVICE_SHARING === 'true';
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // Offline smoke must never reach external services.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue() : route.abort();
  });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByText('Build contests. Settle up.', { exact: false }).waitFor();
  // Use the stable control ID: staged launch copy can change its label.
  const joins = page.getByTestId('home-join-code');
  assert.equal(await joins.count(), sharing ? 1 : 0);
  if (sharing) {
    assert(await joins.isVisible(), 'sharing-on home join must be visible');
  } else {
    const wordmark = page.getByText('SNAPSCORE', { exact: true });
    const scroll = page.getByTestId('home-scroll');
    const wordBox = await wordmark.boundingBox();
    const scrollBox = await scroll.boundingBox();
    assert(wordBox && scrollBox);
    // The design's existing wordmark margin is 18px; a hidden join row
    // must add no padding or other layout space above it.
    assert(Math.abs(wordBox.y - scrollBox.y - 18) <= 3,
      `expected 18px wordmark margin, got ${wordBox.y - scrollBox.y}`);
    assert(await wordmark.evaluate(el => {
      const content = el.parentElement.parentElement;
      return content.firstElementChild === el.parentElement;
    }), 'wordmark must be the first scroll content element');

    await page.getByText('Modified Stableford (SnapScore)', { exact: true }).click();
    const sheet = page.getByTestId('game-info-sheet');
    await sheet.waitFor({ state: 'visible' });
    const style = await sheet.evaluate(el => {
      const s = getComputedStyle(el);
      return { top: s.borderTopWidth, left: s.borderLeftWidth, right: s.borderRightWidth,
        color: s.borderTopColor, radius: s.borderTopLeftRadius };
    });
    assert.equal(style.top, '1px');
    assert.equal(style.left, '1px');
    assert.equal(style.right, '1px');
    assert.equal(style.radius, '24px');
    const rgba = style.color.match(/^rgba\(23,\s*92,\s*58,\s*([\d.]+)\)$/);
    assert(rgba, `expected translucent forest border, got ${style.color}`);
    assert(Number(rgba[1]) >= 0.25 && Number(rgba[1]) <= 0.35);
    await page.getByTestId('game-info-scrim').waitFor({ state: 'visible' });
    fs.mkdirSync('e2e/screens', { recursive: true });
    await page.screenshot({ path: 'e2e/screens/game-sheet-390x844.png' });

    await page.goto(`${base}/auth/sign-in`, { waitUntil: 'networkidle' });
    // Offline anonymous sessions can reach auth; if routing changes, only
    // an explicit redirect to the loaded home screen is accepted.
    if (new URL(page.url()).pathname === '/auth/sign-in') {
      await page.getByText('Join with code — no account needed', { exact: true }).waitFor({ state: 'detached' });
      await page.getByText('Create Account', { exact: false }).waitFor();
    } else {
      await page.getByText('Build contests. Settle up.', { exact: false }).waitFor();
      console.log('Offline auth redirected to home; join text remains absent');
    }
    assert.equal(await page.getByText(/Join with code/i).count(), 0);
  }
  assert.deepEqual(errors, [], 'no browser page errors');
  console.log(`PASS: join gate sharing=${sharing}${sharing ? '' : ', home spacing, game sheet, and sign-in'}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
