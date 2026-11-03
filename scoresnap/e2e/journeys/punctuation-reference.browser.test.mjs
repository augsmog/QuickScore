import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {containOffline} from './offline-containment.mjs';import {paintedText} from './painted-value.mjs';
const values=['$5.00','render@snapscore.test','−$1,234.00','1:23 PM'];
async function fixture(t,value){const browser=await chromium.launch();t.after(()=>browser.close());const context=await browser.newContext({serviceWorkers:'block'});await containOffline(context,'http://127.0.0.1:8192');const page=await context.newPage();await page.setContent('<style>body{background:#fff;margin:20px}#value{font:24px Arial;color:#175c3a;display:inline-block;white-space:pre}</style><span id="value"></span>');await page.locator('#value').evaluate((el,value)=>el.textContent=value,value);return {page,locator:page.locator('#value')};}
for(const value of values)test(`readable punctuation: ${value}`,async t=>{const {locator}=await fixture(t,value);await paintedText(locator,value);});
for(const [value,symbol] of [['$5.00','.'],['$5.00','$'],['render@snapscore.test','@'],['−$1,234.00','−'],['−$1,234.00',','],['1:23 PM',':']])for(const mutation of ['erased','covered','clipped'])test(`${mutation} meaningful ${symbol} in ${value}`,async t=>{
 const {locator}=await fixture(t,value);
 await locator.evaluate((el,{symbol,mutation})=>{const i=el.firstChild.textContent.indexOf(symbol);const range=document.createRange();range.setStart(el.firstChild,i);range.setEnd(el.firstChild,i+symbol.length);const r=range.getBoundingClientRect(),box=el.getBoundingClientRect();
  if(mutation==='erased'){const x=r.x-box.x,end=x+r.width;el.style.webkitMaskImage=`linear-gradient(to right,#000 0px,#000 ${x}px,transparent ${x}px,transparent ${end}px,#000 ${end}px,#000 100%)`;}
  else {const cover=document.createElement('div');Object.assign(cover.style,{position:'fixed',left:`${r.x}px`,top:`${r.y}px`,width:`${mutation==='clipped'?r.width/2:r.width}px`,height:`${r.height}px`,background:'#fff',zIndex:'1000',pointerEvents:'none'});document.body.append(cover);}
 },{symbol,mutation});await assert.rejects(()=>paintedText(locator,value),/Unreadable value/);
});
