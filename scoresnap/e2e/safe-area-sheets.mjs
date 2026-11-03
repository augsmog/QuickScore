import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getSafeAreaProfile} from './safe-area-profiles.mjs';
import {findInteractiveTargetOverlaps} from './interactive-target-geometry.mjs';
const base = process.env.BASE_URL || 'http://127.0.0.1:8089';
const out = process.env.OUT_DIR || 'e2e/screens/safe-area';
const before = process.env.BEFORE_NATIVE_SIM === '1';
const profileName = process.env.DEVICE_PROFILE || 'iphone-15-pro';
const profile = getSafeAreaProfile(profileName);
const {width,height,top,bottom} = profile;
fs.mkdirSync(out, {recursive:true});
const browser = await chromium.launch();
const results = [];
try {
  const context = await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await context.route('**/*', r => {
    // Expo Camera starts its QR worker even for text entry. Keep this layout
    // test offline; decoding is outside this test's scope.
    if (r.request().url() === 'https://cdn.jsdelivr.net/npm/jsqr@1.2.0/dist/jsQR.min.js') return r.fulfill({contentType:'application/javascript',body:'self.jsQR = () => null;'});
    return new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort();
  });
  // Override only safe-area-context's hidden CSS env measurement element. This
  // exercises real providers and consumers; it never pads application content.
  await context.addInitScript(({top,bottom}) => {
    const original = window.getComputedStyle;
    window.getComputedStyle = function(element, ...args) {
      const style = original.call(this,element,...args);
      if (element.style.position === 'fixed' && element.style.visibility === 'hidden' && element.style.transitionProperty === 'padding') {
        return new Proxy(style,{get(target,key) {
          if (key === 'paddingTop') return `${top}px`;
          if (key === 'paddingBottom') return `${bottom}px`;
          const value = Reflect.get(target,key,target);
          return typeof value === 'function' ? value.bind(target) : value;
        }});
      }
      return style;
    };
  }, {top,bottom});
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check = async (name, locator) => {
    await locator.waitFor({state:'visible'});
    const box = await locator.boundingBox();
    assert(box && box.y >= top, `${name} top ${box?.y} must clear ${top}px`);
    assert(box.y + box.height <= height-bottom, `${name} must clear bottom home indicator`);
    results.push({name,box});
  };
  const checkTargets = async screen => {
    const targetSelector = 'button,[role="button"],[role="link"],[role="radio"],[role="checkbox"],[role="switch"],[tabindex="0"],a,input,select,textarea';
    const targets = await page.locator(targetSelector).evaluateAll(elements => elements
      .filter(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); const backingCheckbox = el.matches('input[type="checkbox"]') && el.closest('[role="checkbox"],[role="switch"]'); const parentSemantic = el.parentElement?.closest('[role="button"],[role="link"],button,a,[role="checkbox"],[role="switch"]'); const duplicateFocusable = el.matches('[tabindex="0"]') && parentSemantic; const backdrop = el.matches('[data-testid$="-scrim"]'); const left=Math.max(0,r.left), top=Math.max(0,r.top), right=Math.min(innerWidth,r.right), bottom=Math.min(innerHeight,r.bottom); const hit = right>left && bottom>top ? document.elementFromPoint((left+right)/2,(top+bottom)/2) : null; const covered = hit && hit !== el && !el.contains(hit); return !backingCheckbox && !duplicateFocusable && !backdrop && !covered && right>left && bottom>top && r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0; })
      .map(el => { const r = el.getBoundingClientRect(); const parent = el.parentElement?.closest('button,[role="button"],[role="link"],[role="radio"],[role="checkbox"],[role="switch"],a,input,select,textarea'); return {id:elements.indexOf(el),parentId:parent ? elements.indexOf(parent) : null,tag:el.tagName.toLowerCase(),role:el.getAttribute('role'),tabindex:el.getAttribute('tabindex'),testid:el.getAttribute('data-testid'),name: el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText?.trim().replace(/\s+/g,' ').slice(0,60) || el.getAttribute('type') || el.tagName.toLowerCase(), left:r.left,top:r.top,right:r.right,bottom:r.bottom,width: r.width, height: r.height}; }));
    for (const target of targets) assert(target.width >= 44 && target.height >= 44, `${screen}: ${target.name} target ${target.width}x${target.height} must be at least 44x44 CSS px`);
    const overlaps = findInteractiveTargetOverlaps(targets);
    assert.deepEqual(overlaps, [], `${screen}: interactive targets overlap by more than 2 CSS px: ${JSON.stringify(overlaps)}; targets: ${JSON.stringify(targets)}`);
    results.push({name:`${screen} interactive targets`,count:targets.length,targets,overlaps});
  };
  await page.goto(base,{waitUntil:'networkidle'});
  await page.getByText('See All',{exact:true}).click();
  const title = page.getByText('50+ game modes',{exact:true});
  await title.waitFor();
  await page.waitForTimeout(500); // RN Modal slide transition must finish before measuring.
  await checkTargets('game mode library');
  if (before) {
    // origin/main's web SafeAreaView inherits React context correctly, unlike
    // iOS's native ancestor lookup. Emulate that missing native provider only
    // for this reference screenshot; the normal regression never mutates layout.
    await title.evaluate(el=>{el.parentElement.parentElement.style.paddingTop='0px';el.parentElement.parentElement.style.paddingBottom='0px';});
    await page.screenshot({path:`${out}/before-sim.png`});
    assert((await title.boundingBox()).y < top);
    console.log('Captured origin/main native missing-provider simulation');
  } else {
    const boundary = page.getByTestId('safe-modal-content');
    await boundary.waitFor();
    await check('library title',title);
    await check('library close',page.getByRole('button',{name:'Close game mode library'}));
    const padding = await boundary.evaluate(el=>({top:getComputedStyle(el).paddingTop,bottom:getComputedStyle(el).paddingBottom}));
    assert.deepEqual(padding,{top:`${top}px`,bottom:`${bottom}px`});
    await page.screenshot({path:`${out}/after-sim.png`});
    await page.getByRole('button',{name:'Close game mode library'}).click();
    await boundary.waitFor({state:'hidden'});
    await page.getByTestId('home-scroll').getByText('Modified Stableford (SnapScore)',{exact:true}).click();
    await page.waitForTimeout(500);
    await check('game info close',page.getByTestId('game-info-close'));
    await checkTargets('game info');
    const viewport = page.viewportSize();
    const scrim = await page.getByTestId('game-info-scrim').boundingBox();
    const surface = await page.getByTestId('game-info-sheet').boundingBox();
    assert.equal(scrim.y, 0, 'scrim starts at window top');
    assert.equal(scrim.x, 0);
    assert.equal(scrim.width, viewport.width);
    assert.equal(scrim.y + scrim.height, viewport.height, 'scrim covers window bottom');
    assert.equal(surface.y + surface.height, viewport.height, 'sheet flush with window bottom');
    await check('game info action', page.getByTestId('game-info-sheet').getByText('Try Pro with Modified Stableford (SnapScore)',{exact:true}));
    const bottomPadding = await page.getByTestId('game-info-sheet').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom));
    assert(bottomPadding >= bottom, 'home inset reserved inside opaque surface');
    results.push({name:'game info geometry',scrim,surface,bottomPadding});
    await page.screenshot({path:`${out}/after-sim-sheet.png`});
    await page.goto(base+'/scan',{waitUntil:'networkidle'});
    await checkTargets('scan text entry');
    await check('scan title',page.getByText('Enter scorecard as text',{exact:true}));
    await check('scan dismiss',page.getByRole('button',{name:'Go Back',exact:true}));
    await page.goto(base+'/scan/review?scanData=%7Bbad',{waitUntil:'networkidle'});
    await checkTargets('scan review error');
    await check('review error title',page.getByText('Invalid Scorecard Data',{exact:true}));
    await check('review error dismiss',page.getByTestId('review-back'));
    await page.goto(base,{waitUntil:'networkidle'});
    await page.getByText('New Contest',{exact:true}).locator('visible=true').click();
    await checkTargets('new contest');
    await check('new contest title',page.getByText('New Contest',{exact:true}).locator('visible=true'));
    await check('new contest dismiss',page.getByTestId('new-contest-back'));
    await page.goto(base+'/paywall',{waitUntil:'networkidle'});
    await checkTargets('paywall');
    await check('paywall dismiss',page.getByRole('button',{name:'Close',exact:true}));
    await page.goto(base+'/join/ZZZZZZ',{waitUntil:'networkidle'});
    await checkTargets('join');
    await check('join dismiss',page.getByTestId('join-dismiss'));
    await page.goto(base+'/r/not-a-real-token',{waitUntil:'networkidle'});
    await checkTargets('spectator');
    await check('spectator title',page.getByText('Live scoreboard',{exact:true}));
    const geometry = async (name, bottomSheet = true) => {
      await page.waitForTimeout(500);
      const scrim = await page.getByTestId(`${name}-scrim`).boundingBox();
      const sheet = page.getByTestId(`${name}-sheet`);
      const surface = await sheet.boundingBox();
      assert.deepEqual(scrim, {x:0,y:0,width,height}, `${name}: full-window scrim`);
      assert(surface.y >= top, `${name}: surface clears status bar`);
      if (bottomSheet) assert.equal(surface.y + surface.height,height,`${name}: flush bottom`);
      const padding = await sheet.evaluate(el=>parseFloat(getComputedStyle(el).paddingBottom));
      assert(padding >= bottom,`${name}: inset inside surface`);
      const controls = await sheet.locator('[tabindex="0"]').all();
      for (const control of controls) {
        const box = await control.boundingBox();
        if (box && box.y >= surface.y && box.y < height) {
          assert(box.y >= top && box.y + box.height <= height-bottom, `${name}: control clears safe edges: ${JSON.stringify(box)}`);
        }
      }
      results.push({name,scrim,surface,padding,controls:controls.length});
      await checkTargets(name);
    };
    // Course search is feature-gated; exercise it whenever enabled in this export.
    await page.goto(base+'/contest/new',{waitUntil:'networkidle'});
    if (await page.getByText('Search courses...',{exact:true}).count()) {
      await page.getByText('Search courses...',{exact:true}).click();
      await geometry('course-search');
      await check('course search title',page.getByText('Find Your Course',{exact:true}));
    }
    // Local persisted fixtures only. All external requests remain blocked.
    const course={name:'Safe area fixture',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:380}))};
    const fixture={id:'safe-fixture',name:'Safe area fixture',course,status:'active',betUnit:1,hasTeams:false,
      groups:[{id:'g',name:'Group 1',players:['Amy','Ben','Cam','Dan'].map((name,i)=>({id:`p${i}`,name,handicap:0,team:null,scores:Array(18).fill(0)}))}],
      games:['wolf'],gameConfig:{rulesVersion:1},createdAt:new Date().toISOString()};
    await page.evaluate(c=>localStorage.setItem('snapscore-contests',JSON.stringify({version:0,state:{contests:[c],activeContestId:c.id}})),fixture);
    await page.goto(base+'/contest/safe-fixture/scorecard?groupId=g',{waitUntil:'networkidle'});
    await page.getByText(/Record Wolf decision before play/).click();
    await geometry('preplay',false);
    await check('preplay cancel',page.getByText('Cancel — remains pending',{exact:true}));
    await page.getByText('Cancel — remains pending',{exact:true}).click();
    await page.getByTestId('score-next-hole').click();
    await geometry('auxiliary');
    await page.goto(base+'/scan/game-details?contestId=safe-fixture&groupId=g',{waitUntil:'networkidle'});
    await geometry('game-prompt');
    const scanned=[{name:'Amy',scores:Array(18).fill(4),handicap:0}];
    await page.goto(base+'/scan/review?contestId=safe-fixture&groupId=g&scanData='+encodeURIComponent(JSON.stringify(scanned)),{waitUntil:'networkidle'});
    await page.getByText(/^(Match|Rematch)$/).first().click();
    await geometry('player-match');
    await check('player match cancel',page.getByText('Cancel',{exact:true}));
    assert.deepEqual(errors,[],'no browser errors');
    console.log(`PASS safe-area sheets (${profileName} ${width}x${height} top=${top} bottom=${bottom})`,JSON.stringify(results));
  }
} finally {
  fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
  await browser.close();
}
