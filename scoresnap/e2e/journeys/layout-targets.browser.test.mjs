import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {setup,cases,ready} from './adapter.mjs';
import {stablePaint} from './acceptance-common.mjs';
import {assertTargetSize,assertRulesSurface} from './layout-targets.mjs';
import {containOffline} from './offline-containment.mjs';
import {SAFE_AREA_PROFILES} from '../safe-area-profiles.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('./journeys.json',import.meta.url)));
const base=process.env.BASE_URL||'http://127.0.0.1:8092';
const output=path.resolve(process.env.OUT_DIR||'e2e/journey-screens/layout-targets');
fs.mkdirSync(output,{recursive:true});
for(const [profile,viewport] of Object.entries(SAFE_AREA_PROFILES))for(const id of ['J-game-rules','J-settlement-mark-lifecycle','J-by-game-nine','J-settlement-tab-runtime-recalc']) {
  test(`${profile}: ${id} real layout and negative controls`,async t=>{
    const browser=await chromium.launch();t.after(()=>browser.close());
    const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},serviceWorkers:'block'});
    await containOffline(context,base);
    const page=await context.newPage();page.setDefaultTimeout(5000);
    const journey=manifest.journeys.find(j=>j.id===id);
    await setup(context,page,journey,base);await stablePaint(page);
    const observations=[];
    const act={activate:async target=>{await target.click();await stablePaint(page);},scroll:async(target,dy)=>{await target.evaluate((el,dy)=>el.scrollBy(0,dy),dy);await stablePaint(page);}};
    const enter=screen=>ready(page,screen);
    await cases[id]({page,act,enter,navigate:async route=>{await page.goto(base+route);await stablePaint(page);},reload:async()=>{await page.reload();await stablePaint(page);},
      check:async(name,fn)=>{await fn();observations.push(name);
        if(id==='J-game-rules'&&name==='rule') {
          // A real foreground collision must fail, while the actual backdrop
          // behind the sheet must not be mistaken for an overlapping control.
          const injected=await page.getByTestId('game-info-sheet').evaluate(root=>{
            const close=root.querySelector('[data-testid="game-info-close"]');
            const b=document.createElement('button');b.textContent='negative collision';
            Object.assign(b.style,{position:'absolute',left:`${close.offsetLeft}px`,top:`${close.offsetTop}px`,width:'44px',height:'44px'});close.parentElement.append(b);return true;
          });assert(injected);
          await assert.rejects(()=>assertRulesSurface(page),/control-overlap|text-over-control/);
          await page.getByTestId('game-info-sheet').getByRole('button',{name:'negative collision',exact:true}).evaluate(el=>el.remove());
          await assertRulesSurface(page);observations.push('overlap-negative-rejected');
        }
        if(name==='unmarked'||name==='nine-hole-signed-rows'||name==='same-contest-tab-retains') {
          const target=page.getByRole('button',{name:/^(Mark settled|Unsettle) /}).first();
          const original=await target.getAttribute('style');
          await target.evaluate(el=>{el.style.minHeight='19px';el.style.height='19px';el.style.maxHeight='19px';});
          try{await assert.rejects(()=>assertTargetSize(target),/>=44x44/);}finally{await target.evaluate((el,style)=>el.setAttribute('style',style),original);}
          await assertTargetSize(target);observations.push('size-negative-rejected');
        }
      },
      step:async name=>{
        await stablePaint(page);
        await page.screenshot({path:path.join(output,`${profile}-${id}-${name}.png`)});
      }});
    fs.writeFileSync(path.join(output,`${profile}-${id}.json`),JSON.stringify({profile,id,observations},null,2));
  });
}
