import "./create-footer.browser.test.mjs";
import "./layout-targets.browser.test.mjs";
import "./settlement-scroll-layout.browser.test.mjs";
// Render the production export: no substitute HTML or style-source assertions.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {containOffline} from './offline-containment.mjs';
import {setup,roundId} from './adapter.mjs';
import {stablePaint} from './acceptance-common.mjs';
import {SAFE_AREA_PROFILES} from '../safe-area-profiles.mjs';
// Simulate only safe-area-context's hidden CSS measurement, never app geometry.
const simulateInsets=({top,bottom})=>{
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
};
const output=path.resolve(process.env.OUT_DIR||'e2e/journey-screens/layout-controls');
fs.mkdirSync(output,{recursive:true});
const base=process.env.BASE_URL||'http://127.0.0.1:8092';
for(const [name,profile] of Object.entries(SAFE_AREA_PROFILES)) {
 test(`${name}: recent rounds scroll viewport clears the bottom tabs`,async t=>{
  const browser=await chromium.launch();t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},serviceWorkers:'block'});
  await containOffline(context,base);await context.addInitScript(simulateInsets,profile);const page=await context.newPage();page.setDefaultTimeout(5000);
  await setup(context,page,{id:'J-settlement-mark-lifecycle'},base);await stablePaint(page);
  const viewport=await page.getByTestId('home-scroll').boundingBox();
  const home=await page.locator('a,[role=tab]').filter({hasText:/^Home$/}).boundingBox();
  await page.screenshot({path:path.join(output,`${name}-home.png`)});
  fs.writeFileSync(path.join(output,`${name}-home.json`),JSON.stringify({viewport,home},null,2));
  assert(viewport&&home,'real home scroll view and tab must render');
  assert(viewport.y+viewport.height<=home.y+2,`scroll bottom ${viewport.y+viewport.height} intersects tab at ${home.y}`);
  const cards=page.locator('[tabindex="0"]').filter({hasText:'Journey course'});
  // iPhone SE's viewport only leaves room for one full card above the tab bar
  // before the next would render mid-cut (AUG-1159); Home keeps the most
  // recent completed round in that case, which is still round B.
  assert.equal(await cards.count(),name==='iphone-se'?1:2);
  await cards.last().scrollIntoViewIfNeeded();const card=await cards.last().boundingBox();
  assert(card.y>=viewport.y&&card.y+card.height<=viewport.y+viewport.height+2);
  await cards.last().click();await page.waitForURL(/\/contest\/acceptance-round-b/);
 });
 test(`${name}: Gross and Net have separate 44px painted targets and switch selection`,async t=>{
  const browser=await chromium.launch();t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},serviceWorkers:'block'});
  await containOffline(context,base);await context.addInitScript(simulateInsets,profile);const page=await context.newPage();page.setDefaultTimeout(5000);
  await setup(context,page,{id:'layout-rank',fixture:'two-player-empty-v1',start:'round'},base);
  for(const player of ['Augie','Sam'])await page.getByTestId(`score-par-${player}`).click();
  await page.getByTestId('journey-leaderboard').click();
  await page.waitForURL(`${base}/contest/${roundId}/leaderboard`);const gross=page.getByTestId('leaderboard-rank-gross'),net=page.getByTestId('leaderboard-rank-net');
  await gross.waitFor();await stablePaint(page);
  const a=await gross.boundingBox(),b=await net.boundingBox();
  await page.screenshot({path:path.join(output,`${name}-rank.png`)});
  fs.writeFileSync(path.join(output,`${name}-rank.json`),JSON.stringify({gross:a,net:b},null,2));
  for(const r of [a,b])assert(r.width>=44&&r.height>=44,`visible target ${JSON.stringify(r)} must be >=44x44`);
  assert(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)<=2,'rank controls overlap');
  const color=el=>getComputedStyle(el).backgroundColor;
  const selected=await gross.evaluate(color),inactive=await net.evaluate(color);assert.notEqual(selected,inactive);
  await net.click();await stablePaint(page);assert.equal(await net.evaluate(color),selected);assert.equal(await gross.evaluate(color),inactive);
  await gross.click();await stablePaint(page);assert.equal(await gross.evaluate(color),selected);
 });
}
