import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base = process.env.BASE_URL || 'http://127.0.0.1:8089';
const out = process.env.OUT_DIR || 'e2e/screens/safe-area';
const before = process.env.BEFORE_NATIVE_SIM === '1';
fs.mkdirSync(out, {recursive:true});
const browser = await chromium.launch();
const results = [];
try {
  const context = await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await context.route('**/*', r => {
    // Expo Camera starts its QR worker even for text entry. Keep this layout
    // test offline; decoding is outside this test's scope.
    if (r.request().url() === 'https://cdn.jsdelivr.net/npm/jsqr@1.2.0/dist/jsQR.min.js') return r.fulfill({contentType:'application/javascript',body:'self.jsQR = () => null;'});
    return new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort();
  });
  // Override only safe-area-context's hidden CSS env measurement element. This
  // exercises real providers and consumers; it never pads application content.
  await context.addInitScript(() => {
    const original = window.getComputedStyle;
    window.getComputedStyle = function(element, ...args) {
      const style = original.call(this,element,...args);
      if (element.style.position === 'fixed' && element.style.visibility === 'hidden' && element.style.transitionProperty === 'padding') {
        return new Proxy(style,{get(target,key) {
          if (key === 'paddingTop') return '59px';
          if (key === 'paddingBottom') return '34px';
          const value = Reflect.get(target,key,target);
          return typeof value === 'function' ? value.bind(target) : value;
        }});
      }
      return style;
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check = async (name, locator) => {
    await locator.waitFor({state:'visible'});
    const box = await locator.boundingBox();
    assert(box && box.y >= 59, `${name} top ${box?.y} must clear 59px`);
    assert(box.y + box.height <= 852-34, `${name} must clear bottom home indicator`);
    results.push({name,box});
  };
  await page.goto(base,{waitUntil:'networkidle'});
  await page.getByText('See All',{exact:true}).click();
  const title = page.getByText('50+ game modes',{exact:true});
  await title.waitFor();
  await page.waitForTimeout(500); // RN Modal slide transition must finish before measuring.
  if (before) {
    // origin/main's web SafeAreaView inherits React context correctly, unlike
    // iOS's native ancestor lookup. Emulate that missing native provider only
    // for this reference screenshot; the normal regression never mutates layout.
    await title.evaluate(el=>{el.parentElement.parentElement.style.paddingTop='0px';el.parentElement.parentElement.style.paddingBottom='0px';});
    await page.screenshot({path:`${out}/before-sim.png`});
    assert((await title.boundingBox()).y < 59);
    console.log('Captured origin/main native missing-provider simulation');
  } else {
    const boundary = page.getByTestId('safe-modal-content');
    await boundary.waitFor();
    await check('library title',title);
    await check('library close',page.getByRole('button',{name:'Close game mode library'}));
    const padding = await boundary.evaluate(el=>({top:getComputedStyle(el).paddingTop,bottom:getComputedStyle(el).paddingBottom}));
    assert.deepEqual(padding,{top:'59px',bottom:'34px'});
    await page.screenshot({path:`${out}/after-sim.png`});
    await page.getByRole('button',{name:'Close game mode library'}).click();
    await boundary.waitFor({state:'hidden'});
    await page.getByTestId('home-scroll').getByText('Modified Stableford (SnapScore)',{exact:true}).click();
    await page.waitForTimeout(500);
    await check('game info close',page.getByTestId('game-info-close'));
    await page.goto(base+'/scan',{waitUntil:'networkidle'});
    await check('scan title',page.getByText('Enter scorecard as text',{exact:true}));
    await check('scan dismiss',page.getByRole('button',{name:'Go Back',exact:true}));
    await page.goto(base+'/scan/review?scanData=%7Bbad',{waitUntil:'networkidle'});
    await check('review error title',page.getByText('Invalid Scorecard Data',{exact:true}));
    await check('review error dismiss',page.getByTestId('review-back'));
    await page.goto(base,{waitUntil:'networkidle'});
    await page.getByText('New Contest',{exact:true}).locator('visible=true').click();
    await check('new contest title',page.getByText('New Contest',{exact:true}).locator('visible=true'));
    await check('new contest dismiss',page.getByTestId('new-contest-back'));
    await page.goto(base+'/paywall',{waitUntil:'networkidle'});
    await check('paywall dismiss',page.getByRole('button',{name:'Close',exact:true}));
    await page.goto(base+'/join/ZZZZZZ',{waitUntil:'networkidle'});
    await check('join dismiss',page.getByTestId('join-dismiss'));
    await page.goto(base+'/r/not-a-real-token',{waitUntil:'networkidle'});
    await check('spectator title',page.getByText('Live scoreboard',{exact:true}));
    assert.deepEqual(errors,[],'no browser errors');
    console.log('PASS safe-area sheets',JSON.stringify(results));
  }
} finally {
  fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
  await browser.close();
}
