// Run against an exported web build. Mock only the Supabase network boundary.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  let state = 'active'; let calls = 0; let messages = []; let posts = 0; let limited = false;
  await context.route('**/rest/v1/rpc/list_moderated_messages', async route => {
    const p = route.request().postDataJSON();
    assert.deepEqual(p, {p_token:'a'.repeat(64),p_local_id:null,p_session:p.p_session});
    assert.match(p.p_session,/^[a-f0-9]{64}$/);
    await route.fulfill({status:state === 'active' ? 200 : 400,contentType:'application/json',body:JSON.stringify(state === 'active' ? messages : {message:state+' link',code:'P0001'})});
  });
  let senderSession;
  await context.route('**/rest/v1/rpc/post_message', async route => {
    const p = route.request().postDataJSON();
    assert.equal(p.p_token,'a'.repeat(64)); assert.match(p.p_session,/^[a-f0-9]{64}$/);
    if (senderSession) assert.equal(p.p_session,senderSession);
    senderSession=p.p_session;
    assert.equal(p.p_name,'Pat'); posts++;
    if (limited) { await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'chat rate limit',code:'P0001'})}); return; }
    messages.push({id:'message-1',participant_id:'participant-pat',is_own:true,display_name:p.p_name,body:p.p_body,created_at:new Date().toISOString()});
    await route.fulfill({status:200,contentType:'application/json',body:'null'});
  });
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
  await page.getByLabel('Chat display name').fill('Pat');
  await page.getByRole('button',{name:'Join chat',exact:true}).click();
  const markup='<img src=x onerror=alert(1)> Nice shot!';
  await page.getByLabel('Chat message').fill(markup);
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await page.getByText('Pat: '+markup,{exact:true}).waitFor();
  assert.equal(await page.locator('img[src="x"]').count(),0);
  assert.equal(posts,1);
  console.log('PASS: anonymous posting renders markup as literal text');
  await page.reload();
  await page.getByText('Chatting as Pat',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Chat display name').count(),0);
  await page.getByText('Pat: '+markup,{exact:true}).waitFor();
  messages=[]; // Simulate a host soft-removing the message at the RPC boundary.
  await page.getByText('Pat: '+markup,{exact:true}).waitFor({state:'detached',timeout:12000});
  console.log('PASS: persisted display name and removed message disappears on poll');
  limited=true;
  await page.getByLabel('Chat message').fill('Retry later');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await page.getByText('Chat is busy. Wait 30 seconds before trying again.',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Chat message').inputValue(),'Retry later');
  assert.equal(posts,2);
  console.log('PASS: rate limit preserves draft and session and pauses sending');
  state='expired';
  await page.getByText('This share link has expired.',{exact:true}).waitFor({timeout:16000});
  assert.equal(await page.getByText('Sam',{exact:true}).count(),0); assert(calls>=2);
  console.log('PASS: polling removes scoreboard on expiry');
  state='active';
  messages=[{id:'message-2',participant_id:'participant-pat',is_own:true,display_name:'Pat',body:'Visible before revocation',created_at:new Date().toISOString()}];
  await page.getByText('Pat: Visible before revocation',{exact:true}).waitFor({timeout:12000});
  await page.getByLabel('Chat message').waitFor();
  state='revoked';
  await page.getByText('This share link has been revoked.',{exact:true}).waitFor({timeout:16000});
  assert.equal(await page.getByLabel('Chat message').count(),0);
  assert.equal(await page.getByRole('button',{name:'Send message',exact:true}).count(),0);
  assert.equal(posts,2);
  assert.equal(await page.getByText('Pat: Visible before revocation',{exact:true}).count(),0);
  console.log('PASS: revoked state clears chat and composer');
} finally { await browser.close(); }
