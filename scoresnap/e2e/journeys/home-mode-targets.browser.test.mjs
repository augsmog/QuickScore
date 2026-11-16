import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {getSafeAreaProfile} from '../safe-area-profiles.mjs';
import {containOffline} from './offline-containment.mjs';
import {setup,ready,contests} from './adapter.mjs';
import {homeModeNames as names,homeModeTargets,assertHomeModeTargets} from './home-mode-targets.mjs';

// Real offline Expo export, never substitute HTML. Explicit browser-test command.
const base=process.env.BASE_URL||'http://127.0.0.1:8092';
// Optional independent capture auditor; preserve ALL findings, including other tickets.
const auditor=process.env.CAPTURE_AUDITOR?await import(pathToFileURL(process.env.CAPTURE_AUDITOR)):null;
for(const profileName of ['iphone-se','iphone-15-pro','iphone-pro-max']) {
  test(`Home mode visible targets and clipped-chip reveal: ${profileName}`,async t=>{
    const browser=await chromium.launch();t.after(()=>browser.close());
    const context=await browser.newContext({viewport:getSafeAreaProfile(profileName),serviceWorkers:'block'});
    await containOffline(context,base);
    // Match the capture harness's simulated native safe-area environment.
    await context.addInitScript(({top,bottom})=>{
      const original=window.getComputedStyle;
      window.getComputedStyle=function(el,...args){
        const style=original.call(this,el,...args);
        if(el.style.position==='fixed'&&el.style.visibility==='hidden'&&el.style.transitionProperty==='padding')
          return new Proxy(style,{get(target,key){
            if(key==='paddingTop')return `${top}px`;
            if(key==='paddingBottom')return `${bottom}px`;
            const value=Reflect.get(target,key,target);
            return typeof value==='function'?value.bind(target):value;
          }});
        return style;
      };
    },getSafeAreaProfile(profileName));
    const page=await context.newPage();page.setDefaultTimeout(5000);
    const dir=path.resolve(process.env.OUT_DIR||'e2e/home-mode-screens',profileName);
    fs.mkdirSync(dir,{recursive:true});
    const evidence={profileName,journey:'J-home-create-cancel',captures:[]};
    t.after(()=>fs.writeFileSync(path.join(dir,'geometry.json'),JSON.stringify(evidence,null,2)));
    const chip=name=>page.getByText(name,{exact:true}).locator('..');
    async function capture(label,{chips=true}={}) {
      const targets=chips?await homeModeTargets(page):[];
      const screenshot=path.join(dir,`${label}.png`);
      const layout=auditor?await auditor.auditCapture(page,{profileName,profile:getSafeAreaProfile(profileName),journey:evidence.journey,capture:label,screenshot}):null;
      await page.screenshot({path:screenshot});evidence.captures.push({label,targets,layout});
      assertHomeModeTargets(targets,label);
      return targets;
    }
    await setup(context,page,{fixture:'fresh-context-v1',start:'home'},base);
    assert.equal((await contests(page)).length,0);
    const entry=await capture('entry'),clipped=entry.find(r=>r.name===names[3]);
    assert(clipped.width<clipped.rawWidth,'fixture must exercise horizontal clipping');
    await page.getByTestId('home-new-contest').click();await ready(page,'create');await capture('create',{chips:false});
    await page.getByPlaceholder('Your name').fill('Unsubmitted');await capture('edit',{chips:false});
    await page.getByTestId('new-contest-back').click();await ready(page,'home');
    assert.equal((await contests(page)).length,0);await capture('cancel-home');
    // Negative rendered fixture: a transient scroll position exposing a sliver
    // must fail the same gate. Restore native snapping before positive reveal.
    const scroller=await chip(names[0]).evaluateHandle(el=>{
      for(let a=el.parentElement;a;a=a.parentElement)
        if(a.scrollWidth>a.clientWidth&&/auto|scroll/.test(getComputedStyle(a).overflowX))return a;
      throw Error('mode row must be horizontally scrollable');
    });
    const snap=await scroller.evaluate((el,width)=>{
      const prior=el.style.scrollSnapType;el.style.scrollSnapType='none';el.scrollLeft=width-20;return prior;
    },entry[0].rawWidth);
    await assert.rejects(()=>capture('clipped-negative'),/Stroke Play visible/);
    await scroller.evaluate((el,snap)=>{el.scrollLeft=0;el.style.scrollSnapType=snap;},snap);
    await page.waitForFunction(el=>el.scrollLeft===0,scroller);
    await chip(names[3]).scrollIntoViewIfNeeded();
    await scroller.dispose();
    const revealed=await capture('revealed'),target=revealed.find(r=>r.name===names[3]);
    assert.equal(target.width,target.rawWidth,'scroll must fully reveal the clipped chip');
    await chip(names[3]).click();await page.getByTestId('game-info-sheet').waitFor({state:'visible'});
    await capture('mode-open',{chips:false});
    assert(await page.getByTestId('game-info-sheet').getByText(names[3],{exact:true}).isVisible());
  });
}
