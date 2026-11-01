// Run: BASE_URL=http://127.0.0.1:8089 OUT_DIR=/tmp/xdev-shots node e2e/xdevice-two-context.mjs
// Existing Playwright dependency; credentials are never printed or persisted.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL ?? 'http://127.0.0.1:8089';
const out=process.env.OUT_DIR ?? '/tmp/xdevice-two-context';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true, ...(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {})});
const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]);
// Block the exact fallback timer in B before application code runs.
await contexts[1].addInitScript(() => {
  const interval = window.setInterval.bind(window);
  window.__xdevBlockedPolls = 0;
  window.setInterval = (fn, delay, ...args) => {
    if (delay === 30000) { window.__xdevBlockedPolls++; return interval(() => {}, 2147483647); }
    return interval(fn, delay, ...args);
  };
});
const [a,b]=await Promise.all(contexts.slice(0,2).map(c=>c.newPage()));
for(const p of [a,b]) { p.setDefaultTimeout(20000); p.on('dialog',d=>d.accept()); }
const shot=(p,n)=>p.screenshot({path:path.join(out,`${n}.png`),fullPage:true});
const text=(p,s)=>p.getByText(s,{exact:true}).filter({visible:true}).first();
const openStatus=async p=>{ if(!await p.getByTestId('round-status-sheet').isVisible().catch(()=>false)){ await p.getByTestId('round-status-chip').filter({visible:true}).first().click(); await p.getByTestId('round-status-sheet').waitFor(); } };
const closeStatus=async p=>{ if(await p.getByTestId('round-status-sheet').isVisible().catch(()=>false)){ await p.getByTestId('round-status-done').click(); await p.getByTestId('round-status-sheet').waitFor({state:'hidden'}); } };
async function signIn(p,who) {
  await p.goto(`${base}/auth/sign-in`);
  await p.getByText(/Skip|Already have an account/).first().waitFor();
  if(await text(p,'Skip').isVisible()) { await text(p,'Skip').click(); await p.goto(`${base}/auth/sign-in`); }
  await text(p,'Already have an account? Sign in').click();
  await p.getByPlaceholder('Email address').waitFor();
  await shot(p,`${who}-signin`);
  const email=process.env[`XDEV_${who}_EMAIL`],password=process.env[`XDEV_${who}_PASSWORD`];
  if(!email||!password) return false;
  await p.getByPlaceholder('Email address').fill(email);
  await p.getByPlaceholder('Password',{exact:true}).fill(password);
  await text(p,'Sign In').click();
  await p.waitForURL(u=>!u.pathname.includes('/auth/'));
  return true;
}
try {
  const signedA=await signIn(a,'A'),signedB=await signIn(b,'B');
  if(!signedA||!signedB) {
    assert.equal(process.env.XDEV_SIGNIN_ONLY,'1','Set all four XDEV credentials for the full test; XDEV_SIGNIN_ONLY=1 permits an explicit sign-in smoke only');
    console.log('PASS sign-in screen in two isolated contexts; full flow NOT RUN (credentials absent)');
  } else {
    await a.goto(`${base}/contest/new`);
    await a.getByPlaceholder('Your name').fill('Xdev Host');
    await a.getByPlaceholder('Player 2 name').fill('Xdev Joiner');
    await shot(a,'01-create');
    await a.getByText(/^Next/i).filter({visible:true}).last().click();
    await a.getByText(/^Next/i).filter({visible:true}).last().click();
    await text(a,/^START CONTEST/i).click();
    await a.waitForURL(/\/contest\/[^/]+$/);
    const contestUrl=a.url();
    await openStatus(a);
    await text(a,'Enable online sharing').click();
    const label=await a.getByTestId('organizer-join-code').innerText();
    const code=label.match(/Join code: ([A-Z0-9]{6})/)[1];
    await text(a,'Online sharing enabled. Share this invite with signed-in players.').waitFor();
    assert.match(code, /^[A-Z0-9]{6}$/);
    // Owner-hosts may have no membership row: a cold page must restore the
    // authorized snapshot before showing the invite or queuing another score.
    await a.reload();
    await a.getByTestId('organizer-join-code').waitFor();
    assert.equal(await text(a,'Enable online sharing').count(),0);
    assert.equal(await a.getByTestId('organizer-join-code').innerText(),label);
    await text(a,'Copy / share invite').click();
    await shot(a,'02-share');
    await b.goto(`${base}/join/${code}`);
    if(!await b.getByLabel('Join code').inputValue()) await b.getByLabel('Join code').fill(code);
    await b.getByPlaceholder('Display name').fill('Xdev Joiner');
    await text(b,'Find contest').click();
    await b.getByText(/Request sent/).waitFor();
    assert.equal(await b.getByText(/Confirmed tournament totals/).count(),0,'No pending scorecard');
    assert.equal(await text(b,'Xdev Host').count(),0,'No pending roster');
    await shot(b,'03-request');
    await text(a,'Online sync').click();
    await text(a,'Retry sync').click();
    await text(a,'Approve as Xdev Joiner').click();
    await shot(a,'04-approved');
    await b.reload();
    await b.getByText('Xdev Joiner',{exact:true}).first().waitFor({timeout:20000});
    await shot(b,'05-claimed');
    let revisionFrames = 0;
    let receivedRevision;
    const revisionDelivered = new Promise(resolve => { receivedRevision = resolve; });
    let subscribed;
    const subscription = new Promise(resolve => { subscribed = resolve; });
    b.on('websocket', ws => ws.on('framereceived', ({payload}) => {
      const frame = String(payload);
      if (frame.includes('phx_reply') && frame.includes('snapscore:') && frame.includes('"status":"ok"')) subscribed();
      if (frame.includes('revision') && !frame.includes('phx_reply')) { revisionFrames++; receivedRevision(); }
    }));
    await b.reload();
    await b.getByText('Xdev Joiner',{exact:true}).first().waitFor();
    await Promise.race([subscription, new Promise((_,reject)=>setTimeout(()=>reject(Error('Private Realtime subscription did not settle')),20000))]);
    assert(await b.evaluate(()=>window.__xdevBlockedPolls)>0,'Foreground polling disabled');
    await a.goto(`${contestUrl}/scorecard`);
    await a.waitForLoadState('networkidle');
    // Cold scoring-route restoration must work without opening Online sync or
    // clicking Retry sync. The earlier manual retry is only for join approval.
    const contestId = new URL(contestUrl).pathname.split('/').pop();
    const restoredSnapshot = a.waitForResponse(r =>
      r.url().endsWith('/rpc/fetch_snapshot') && r.request().method() === 'POST' &&
      r.request().postDataJSON().contest_id === contestId);
    await a.reload();
    const snapshotResponse = await restoredSnapshot;
    assert(snapshotResponse.ok(), 'Cold scoring-route snapshot restored');
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshot.contest_id, contestId);
    assert.equal(snapshot.rounds.length, 1, 'Expected a single-round contest');
    const round = snapshot.rounds[0];
    const player = round.players.find(p => p.displayName === 'Xdev Joiner');
    assert(player, 'Restored snapshot contains the expected player');
    const expectedHole = 1;
    const expectedStrokes = round.course.holes.find(h => h.num === expectedHole)?.par;
    assert(Number.isInteger(expectedStrokes), 'Restored course supplies hole 1 par');
    await openStatus(a);
    await a.getByTestId('organizer-join-code').waitFor();
    assert.equal(await a.getByTestId('organizer-join-code').innerText(), label);
    assert.equal(await text(a,'Enable online sharing').count(), 0);
    await b.waitForLoadState('networkidle');
    const beforeRevision = revisionFrames;
    const scoreStarted = Date.now();
    await closeStatus(a);
    const scoreReceipt = a.waitForResponse(r => {
      if (!r.url().endsWith('/rpc/write_score') || r.request().method() !== 'POST') return false;
      const args = r.request().postDataJSON();
      return args.contest_id === contestId && args.round_id === round.id &&
        args.player_id === player.id && args.hole === expectedHole &&
        args.action === 'set' && args.strokes === expectedStrokes;
    });
    await a.getByTestId('score-par-Xdev Joiner').click();
    const receipt = await scoreReceipt;
    assert(receipt.ok(),'Score RPC succeeded after cold host restoration');
    const scoreResult = await receipt.json();
    assert.equal(scoreResult.status,'accepted');
    assert.equal(scoreResult.strokes, expectedStrokes);
    await shot(a,'06-score');
    await Promise.all([
      b.getByText(new RegExp(`Hole ${expectedHole} · current ${expectedStrokes} · par`)).waitFor({timeout:20000}),
      Promise.race([revisionDelivered, new Promise((_,reject)=>setTimeout(()=>reject(Error('Post-edit Realtime revision deadline')),20000))]),
    ]);
    assert(Date.now()-scoreStarted <= 20000,'Score arrived within 20 seconds');
    assert(revisionFrames > beforeRevision,'Private Realtime revision delivered');
    await shot(b,'07-received');
    const signedOut = await contexts[2].newPage();
    await signedOut.goto(`${base}/join/${code}`);
    if (await text(signedOut,'Skip').isVisible()) { await text(signedOut,'Skip').click(); await signedOut.goto(`${base}/join/${code}`); }
    await signedOut.getByPlaceholder('Display name').fill('Signed out visitor');
    await text(signedOut,'Find contest').click();
    await text(signedOut,'Guest sign-in unavailable. Sign in with email or Apple, then reopen your invite.').waitFor();
    await text(signedOut,'Sign in with email or Apple').waitFor();
    await shot(signedOut,'10-signed-out-recovery');
    await text(signedOut,'Sign in with email or Apple').click();
    // A fresh visitor completes onboarding before the protected Auth route.
    await signedOut.getByText(/Skip|Already have an account/).first().waitFor();
    if (await text(signedOut,'Skip').isVisible()) await text(signedOut,'Skip').click();
    await signedOut.waitForURL(/\/auth\/sign-in/);
    await text(signedOut,'Already have an account? Sign in').waitFor();
    // Enroll another real contest owned by A without approving B for it.
    await a.goto(`${base}/contest/new`);
    await a.getByPlaceholder('Your name').fill('Private Host');
    await a.getByPlaceholder('Player 2 name').fill('Private Player');
    await a.getByText(/^Next/i).filter({visible:true}).last().click();
    await a.getByText(/^Next/i).filter({visible:true}).last().click();
    await text(a,/^START CONTEST/i).click();
    await a.waitForURL(/\/contest\/[^/]+$/);
    const privateUrl=a.url();
    await openStatus(a);
    await text(a,'Enable online sharing').click();
    await a.getByTestId('organizer-join-code').waitFor();
    await shot(a,'08-private-host-round');
    const discovery = b.waitForResponse(r=>r.url().endsWith('/rpc/my_sync_status') && r.request().method()==='POST');
    await b.goto(privateUrl);
    const privateDiscovery = await discovery;
    assert(privateDiscovery.ok(),'Private-page discovery completed');
    await privateDiscovery.finished();
    await b.waitForLoadState('networkidle');
    assert(!await text(b,'Private Player').isVisible(),'B cannot see the unrelated contest roster');

    const settled = b.waitForResponse(r=>r.url().endsWith('/rpc/my_sync_status') && r.request().method()==='POST');
    await b.goto(`${base}/join/enter`);
    const response = await settled;
    assert(response.ok(),'Approved-round discovery completed');
    const status = await response.json();
    assert.equal(status.memberships.filter(m=>m.status==='approved').length,1);
    assert(!status.memberships.some(m=>m.contest_id===new URL(privateUrl).pathname.split('/').pop()),'No unrelated private membership');
    await response.finished();
    await b.waitForLoadState('networkidle');
    await b.getByText('Xdev Joiner',{exact:true}).first().waitFor();
    assert.equal(await b.getByText(/Confirmed tournament totals/).count(),1,'B must see exactly the approved contest');
    assert(!await text(b,'Private Player').isVisible());
    await shot(b,'09-private');
    console.log('PASS two isolated signed-in browsers: enrollment, invite, approval, score propagation <=20s, approved-contest discovery');
  }
} finally { await Promise.all(contexts.map(c=>c.close())); await browser.close(); }
