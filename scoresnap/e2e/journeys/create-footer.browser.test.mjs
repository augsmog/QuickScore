import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {SAFE_AREA_PROFILES} from '../safe-area-profiles.mjs';
import {containOffline} from './offline-containment.mjs';
import {seedAcceptance,stablePaint} from './acceptance-common.mjs';
import {assertCreateFooterClear} from './create-footer.mjs';

const base=process.env.BASE_URL||'http://127.0.0.1:8092';
for(const [name,profile] of Object.entries(SAFE_AREA_PROFILES)) {
  test(`New Contest player controls clear Continue: ${name}`,async t=>{
    const browser=await chromium.launch();t.after(()=>browser.close());
    const context=await browser.newContext({viewport:profile,serviceWorkers:'block'});
    await containOffline(context,base);
    await context.addInitScript(({top,bottom})=>{
      const original=window.getComputedStyle;
      window.getComputedStyle=function(el,...args){
        const style=original.call(this,el,...args);
        if(el.style.position==='fixed'&&el.style.visibility==='hidden'&&el.style.transitionProperty==='padding')
          return new Proxy(style,{get(target,key){
            if(key==='paddingTop')return `${top}px`;
            if(key==='paddingBottom')return `${bottom}px`;
            const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
          }});
        return style;
      };
    },profile);
    await seedAcceptance(context,{kind:'profile',origin:new URL(base).origin});
    const page=await context.newPage();page.setDefaultTimeout(5000);
    await page.goto(base+'/contest/new',{waitUntil:'domcontentloaded'});
    await page.getByPlaceholder('Your name').waitFor();await stablePaint(page);
    const dir=path.resolve(process.env.OUT_DIR||'e2e/create-footer-screens',name);fs.mkdirSync(dir,{recursive:true});
    await page.screenshot({path:path.join(dir,'initial.png')});
    const geometry=await assertCreateFooterClear(page);
    const evidence={...geometry,controls:[]};
    t.after(()=>fs.writeFileSync(path.join(dir,'geometry.json'),JSON.stringify(evidence,null,2)));
    // The last row and Add Player must remain fully reachable as the list grows.
    for(let count=2;count<=4;count++) {
      for(const control of [page.getByPlaceholder(`Player ${count} name`,{exact:true}),page.getByText('+ ADD PLAYER',{exact:true}).locator('..')]) {
        await control.scrollIntoViewIfNeeded();await stablePaint(page);
        const box=await control.boundingBox();
        evidence.controls.push({players:count,control:await control.getAttribute('placeholder')||'Add Player',box});
        assert(box&&box.height>=44,'full player control must render');
        assert(box.y>=geometry.scroll.top-0.5&&box.y+box.height<=geometry.footer.top+0.5,
          `player control covered: ${JSON.stringify(box)}`);
        assert(await control.evaluate(el=>{
          const r=el.getBoundingClientRect();return [[r.x+10,r.y+10],[r.right-10,r.bottom-10]].every(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit===el||el.contains(hit);});
        }),'player control corners must receive pointer hits');
      }
      await page.screenshot({path:path.join(dir,`players-${count}-add-player.png`)});
      if(count<4)await page.getByText('+ ADD PLAYER',{exact:true}).click();
    }
    // Negative control: emulate an overlay without changing the footer labels.
    await page.getByTestId('contest-continue').evaluate(el=>el.parentElement.style.transform='translateY(-30px)');
    await assert.rejects(()=>assertCreateFooterClear(page),/overlaps Continue footer/);
  });
}
