import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {SAFE_AREA_PROFILES} from '../safe-area-profiles.mjs';
import {containOffline} from './offline-containment.mjs';
import {seedAcceptance, reveal, stablePaint} from './acceptance-common.mjs';
import {settingsInventory} from './focused-cases.mjs';

// Use a real Expo web export with EXPO_PUBLIC_PRO_ENABLED=true, matching journey CI.
const base=process.env.BASE_URL||'http://127.0.0.1:8092';
for(const [name,profile] of Object.entries(SAFE_AREA_PROFILES)) {
  test(`Settings named targets, edge activation and safe scroll viewport: ${name}`,async t=>{
    const browser=await chromium.launch();t.after(()=>browser.close());
    const context=await browser.newContext({viewport:profile,serviceWorkers:'block'});
    await containOffline(context,base);
    // Same simulated native insets used by the capture auditor, before app boot.
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
    },profile);
    await seedAcceptance(context,{kind:'profile',tier:'free',origin:new URL(base).origin});
    const page=await context.newPage();page.setDefaultTimeout(8000);
    await page.goto(base+'/settings',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Delete Account',exact:true}).waitFor();
    await stablePaint(page);
    const act={scroll:async(locator,delta)=>{
      await locator.evaluate((el,delta)=>el.scrollBy({top:delta,behavior:'instant'}),delta);
      await stablePaint(page);
    }};
    for(const [role,names] of Object.entries(settingsInventory)) {
      assert.equal(await page.getByRole(role).count(),names.length);
      for(const label of names) {
        const control=page.getByRole(role,{name:label,exact:true});
        assert.equal(await control.count(),1,label);
        await reveal(page,act,control);
        const rect=await control.boundingBox();
        assert(rect&&rect.width>=44&&rect.height>=44,`${label}: ${JSON.stringify(rect)}`);
        assert(rect.y>=profile.top-0.5,`${label}: overlaps top band`);
        assert(rect.y+rect.height<=profile.height-profile.bottom+0.5,`${label}: overlaps bottom band`);
        if(role==='switch') {
          const before=await control.isChecked();
          // Activate the expanded area outside the former 40x20 switch.
          await page.mouse.click(rect.x+2,rect.y+2);
          assert.equal(await control.isChecked(),!before,`${label}: expanded target must toggle`);
          const text=page.getByText(label,{exact:true});
          const textRect=await text.boundingBox();
          assert(textRect&&textRect.x+textRect.width<=rect.x,`${label}: label overlaps switch`);
          if(label==='Show in Leaderboards') {
            const hintRect=await page.getByText('Appear in group leaderboards',{exact:true}).boundingBox();
            assert(hintRect&&hintRect.x+hintRect.width<=rect.x,`${label}: helper overlaps switch`);
          }
        }
      }
    }
  });
}
