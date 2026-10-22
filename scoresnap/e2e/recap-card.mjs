// Start Expo web first; captures only the shared card, using local sample data.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 1000 }, deviceScaleFactor: 2 });
  // The fixture requires no remote services. Keep screenshots local and deterministic.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.goto('http://127.0.0.1:8081/dev/recap-card');
  const card = page.getByTestId('recap-card');
  await card.waitFor({ state: 'visible', timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await card.screenshot({ path: '/tmp/snapscore-recap-card.png' });
  console.log('/tmp/snapscore-recap-card.png');
} finally {
  await browser.close();
}
