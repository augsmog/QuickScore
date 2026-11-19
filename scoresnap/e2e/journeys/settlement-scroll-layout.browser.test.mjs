import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {setup,cases,ready} from './adapter.mjs';
import {stablePaint} from './acceptance-common.mjs';
import {auditCapture} from './capture-layout.mjs';
import {containOffline} from './offline-containment.mjs';
import {SAFE_AREA_PROFILES,simulateSafeArea} from '../safe-area-profiles.mjs';

const manifest=JSON.parse(fs.readFileSync(new URL('./journeys.json',import.meta.url)));
const journey=manifest.journeys.find(j=>j.id==='J-settlement-mark-lifecycle');
const base=process.env.BASE_URL||'http://127.0.0.1:8092';
const output=path.resolve(process.env.OUT_DIR||'e2e/journey-screens/settlement-scroll');
fs.mkdirSync(output,{recursive:true});

for(const [profileName,profile] of Object.entries(SAFE_AREA_PROFILES)) {
  test(`${profileName}: settlement lifecycle leaves no clipped visible target at BY GAME`,async t=>{
    const browser=await chromium.launch();t.after(()=>browser.close());
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},serviceWorkers:'block'});
    await containOffline(context,base);
    await context.addInitScript(simulateSafeArea,profile);
    const page=await context.newPage();page.setDefaultTimeout(5000);
    await setup(context,page,journey,base);await stablePaint(page);
    const captures=[];
    const act={
      activate:async target=>{await target.click();await stablePaint(page);},
      scroll:async(target,dy)=>{await target.evaluate((el,dy)=>el.scrollBy(0,dy),dy);await stablePaint(page);},
    };
    try {
      await cases[journey.id]({page,act,enter:screen=>ready(page,screen),
        navigate:async route=>{await page.goto(base+route);await stablePaint(page);},
        reload:async()=>{await page.reload();await stablePaint(page);},
        check:async(_name,fn)=>fn(),
        step:async capture=>{
          await stablePaint(page);
          const screenshot=path.join(output,`${profileName}-${capture}.png`);
          const layout=await auditCapture(page,{profileName,profile,journey:journey.id,capture,screenshot});
          await page.screenshot({path:screenshot});
          captures.push({capture,screenshot,layout});
          assert.deepEqual(layout.failures,[],`${capture}: strict overlap and safe-area audit`);
          // AUG-1374: size must describe the painted fragment at the current
          // scroll position, even when its full border box is reachable later.
          for(const target of layout.targets) {
            assert(target.width>=44&&target.height>=44,
              `${capture}: visible target must be >=44x44: ${JSON.stringify(target)}`);
          }
        },
      });
      for(const capture of ['by-game-0','by-game-1','other-still-marked']) {
        assert(captures.some(c=>c.capture===capture),`missing ${capture}`);
      }
    } finally {
      fs.writeFileSync(path.join(output,`${profileName}-geometry.json`),JSON.stringify(captures,null,2));
    }
  });
}
