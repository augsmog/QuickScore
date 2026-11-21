const { chromium } = require('/workspace/aos-state/test-program/nm/current/node_modules/playwright');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({deviceScaleFactor:1});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('file://' + path.resolve(__dirname, '../scoresnap/site/support/index.html'));
  await page.screenshot({path:path.join(__dirname,'support-desktop.png'),fullPage:true});
  await page.setViewportSize({width:375,height:812});
  await page.screenshot({path:path.join(__dirname,'support-375.png'),fullPage:true});
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
