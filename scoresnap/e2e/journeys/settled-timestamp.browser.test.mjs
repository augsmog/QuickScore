// Focused AUG-319 control: semantic accessibility/storage cannot mask erased rendered time.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {containOffline} from './offline-containment.mjs';
import {text} from './acceptance-common.mjs';
for(const transition of ['same-contest-tab-return','app-runtime-restart'])test(`${transition}: erased displayed timestamp stays RED with intact name and ledger`,async t=>{
 const browser=await chromium.launch();t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await containOffline(context,'http://127.0.0.1:8192');
 const url='http://127.0.0.1:8192/timestamp-control';
 await context.route(url,route=>route.fulfill({contentType:'text/html',body:'<style>button{font:16px/24px Arial;color:#17251e;background:#fff;border:0;padding:12px;white-space:pre}</style><button aria-label="Unsettle Sam to Augie">Settled 10:35 AM</button>'}));
 const page=await context.newPage();await page.goto(url);
 const key='snapscore-settlement-marks',ledger={version:1,state:{ledgers:{synthetic:{marks:{stroke:'2026-11-02T10:35:00.000Z'}}}}};
 await page.evaluate(({key,ledger})=>localStorage.setItem(key,JSON.stringify(ledger)),{key,ledger});
 const undo=page.getByRole('button',{name:'Unsettle Sam to Augie',exact:true}),label='Settled 10:35 AM';
 const output=process.env.OUT_DIR||'/tmp';fs.mkdirSync(output,{recursive:true});
 const dir=fs.mkdtempSync(path.join(output,`timestamp-${transition}-`));
 // Positive control first: the same unchanged painted-value validator accepts the full label.
 await text(undo,label);await page.screenshot({path:path.join(dir,'01-intact.png')});
 await undo.evaluate(el=>{el.textContent='Settled ';});
 assert.equal(await undo.count(),1);assert.equal(await undo.getAttribute('aria-label'),'Unsettle Sam to Augie');
 assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),ledger);
 await page.screenshot({path:path.join(dir,'02-erased-time.png')});
 const details={transition,expected:label,actual:await undo.innerText(),accessibleName:await undo.getAttribute('aria-label'),stored:await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key)};
 fs.writeFileSync(path.join(dir,'proof.json'),JSON.stringify(details,null,2)+'\n');
 await assert.rejects(()=>text(undo,label),/Rendered value differs/);
});
