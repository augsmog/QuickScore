import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {containOffline} from './offline-containment.mjs';
import {paintedText} from './painted-value.mjs';
test('external WebSocket is intercepted without connecting',async t=>{
 const browser=await chromium.launch();t.after(()=>browser.close());const context=await browser.newContext({serviceWorkers:'block'});const blocked=[];
 await containOffline(context,'http://127.0.0.1:8192',kind=>blocked.push(kind));const page=await context.newPage();
 await page.evaluate(()=>new Promise(resolve=>{const ws=new WebSocket('wss://network-probe.invalid/socket');ws.onclose=resolve;ws.onerror=resolve;}));
 assert.deepEqual(blocked,['websocket']);
});
for(const mutation of ['none','transparent','covered'])test(`painted values reject ${mutation}`,async t=>{
 const browser=await chromium.launch();t.after(()=>browser.close());const context=await browser.newContext({serviceWorkers:'block'});await containOffline(context,'http://127.0.0.1:8192');const page=await context.newPage();
 await page.setContent('<style>#value{font:24px Arial;color:#17251e;background:#faf4e8;display:inline-block;position:relative}</style><div id="value">$5.00</div>');
 if(mutation==='transparent')await page.locator('#value').evaluate(el=>el.style.webkitTextFillColor='transparent');
 if(mutation==='covered')await page.locator('#value').evaluate(el=>{const cover=document.createElement('div');Object.assign(cover.style,{position:'absolute',inset:'0',background:'#faf4e8'});el.append(cover);});
 if(mutation==='none')await paintedText(page.locator('#value'),'$5.00');else await assert.rejects(()=>paintedText(page.locator('#value'),'$5.00'),/Unreadable value/);
});
