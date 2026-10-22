// Run against an exported web build. Mock only the Supabase network boundary.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  let state = 'active'; let calls = 0;
  await context.route('**/rest/v1/rpc/get_shared_round', async route => {
    calls++;
    assert.deepEqual(route.request().postDataJSON(), {p_token:'a'.repeat(64)});
    await route.fulfill({status: state === 'active' ? 200 : 400, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(state === 'active' ? {completed:false,players:[{displayName:'Sam',scores:[4,5],total:9,toPar:1}],games:[]} : {message: state + ' link',code:'P0001'})});
  });
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:8089'}/r/${'a'.repeat(64)}`);
  await page.getByText('Sam',{exact:true}).first().waitFor();
  assert.match(await page.innerText('body'),/Hole by hole/);
  assert.match(await page.innerText('body'),/9 strokes/);
  console.log('PASS: public scoreboard without onboarding/login');
  state='expired';
  await page.getByText('This share link has expired.',{exact:true}).waitFor({timeout:16000});
  assert.equal(await page.getByText('Sam',{exact:true}).count(),0); assert(calls>=2);
  console.log('PASS: polling removes scoreboard on expiry');
  state='revoked';
  await page.getByText('This share link has been revoked.',{exact:true}).waitFor({timeout:16000});
  console.log('PASS: revoked state');
} finally { await browser.close(); }
