// Real app UI; run only on the existing disposable stack, never production.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { backend, validateFixture, assertScores, assertBinding, assertShare, eventually } from './contract.mjs';
import { selectHostPlayer } from '../xdevice-host-player.mjs';
import { readHostScoreState } from './host-score-diagnostic.mjs';
const f=JSON.parse(await readFile(process.env.INVITE_FIXTURE,'utf8'));validateFixture(f);
const mode=process.env.INVITE_ANONYMOUS;assert(['true','false'].includes(mode),'Explicit anonymous mode required');
const base=process.env.BASE_URL ?? 'http://127.0.0.1:8089';assert.equal(new URL(base).origin,'http://127.0.0.1:8089');
const out=process.env.OUT_DIR;assert(out);await mkdir(out,{recursive:true});
const db=backend(f), browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
const hostContext=await browser.newContext({permissions:['clipboard-read','clipboard-write']}), guestContext=await browser.newContext();
const host=await hostContext.newPage(), guest=await guestContext.newPage();
for(const p of [host,guest]){p.setDefaultTimeout(30000);p.on('dialog',d=>d.accept());}
const text=(p,s)=>p.getByText(s,{exact:true}).filter({visible:true}).first();
const onboarding=async p=>{await p.goto(base);if(await text(p,'Skip').isVisible()) await text(p,'Skip').click();};
const tables=['contest_join_requests','contest_memberships','score_events'];
const rows=async()=>Promise.all(tables.map(table=>db.read(`${table}?contest_id=eq.${f.contestId}&select=*`)));
async function freshSnapshot(p,trigger){
  const waiting=p.waitForResponse(r=>r.url()===`${f.api}/rest/v1/rpc/fetch_snapshot` && r.ok() && r.request().postDataJSON()?.contest_id===f.contestId);
  waiting.catch(()=>{});await trigger();const r=await waiting;return r.json();
}
try {
  await onboarding(guest);
  const before=await rows();
  await guest.goto(`${base}/join/${f.code}`);
  await guest.getByPlaceholder('Display name').fill('Journey Visitor');
  await text(guest,'Find contest').click();
  if(mode==='false') {
    await text(guest,'Guest sign-in unavailable. Sign in with email or Apple, then reopen your invite.').waitFor();
    assert.equal(await guest.getByText(/Approved online scorecard/).count(),0);
    assert.deepEqual(await rows(),before,'Disabled anonymous join must not create request/membership/score writes');
    await guest.screenshot({path:`${out}/anonymous-disabled.png`,fullPage:true});
    await writeFile(`${out}/receipt.json`,JSON.stringify({mode,contestId:f.contestId,status:'PASS',checks:['real join UI unavailable error','no request/membership/score writes']}));
  } else {
    await text(guest,'Request sent. Your host must approve your spot. Keep this device to retain unsent scores.').waitFor();
    assert.equal(await guest.getByText(/Guest sign-in unavailable|Approved online scorecard/).count(),0);
    const request=await eventually(async()=>{const r=await db.read(`contest_join_requests?contest_id=eq.${f.contestId}&status=eq.pending&select=*`);assert.equal(r.length,1);return r[0];});
    const who=await fetch(`${f.api}/auth/v1/admin/users/${request.requester}`,{headers:{apikey:f.anonKey,Authorization:`Bearer ${f.adminKey}`}});
    assert(who.ok);assert.equal((await who.json()).is_anonymous,true,'UI created a real anonymous Auth identity');
    await onboarding(host);await host.goto(`${base}/auth/sign-in`);
    await text(host,'Already have an account? Sign in').click();
    await host.getByPlaceholder('Email address').fill(f.hostEmail);await host.getByPlaceholder('Password',{exact:true}).fill(f.hostPassword);
    await text(host,'Sign In').click();await host.waitForURL(u=>!u.pathname.includes('/auth/'));
    await freshSnapshot(host,()=>host.goto(`${base}/contest/${f.contestId}`));
    assert.equal(await host.getByTestId('organizer-join-code').innerText(),`Join code: ${f.code}`);
    await text(host,'Copy / share invite').click();
    // Restored-host share() awaits a rejoinHost round trip before writing the
    // clipboard; click() only dispatches the event, so the read must retry.
    await eventually(async()=>assertShare(f,await host.evaluate(()=>navigator.clipboard.readText())));
    await host.getByTestId('round-status-chip').filter({visible:true}).first().click();await text(host,'Online sync').click();
    await text(host,`Approve as ${f.players[1].name}`).click();
    await eventually(async()=>{const m=await db.read(`contest_memberships?contest_id=eq.${f.contestId}&user_id=eq.${request.requester}&select=*`);assert.equal(m.length,1);assertBinding(f,m[0],request.requester);});
    await freshSnapshot(guest,()=>guest.reload());
    const card=guest.getByTestId(`online-guest-${f.contestId}`);
    await card.getByLabel('Journey Round hole 1 strokes').fill('6');await text(card,'Save hole 1').click();
    await host.goto(`${base}/contest/${f.contestId}/scorecard`);
    let snapshot=await freshSnapshot(host,()=>host.reload());
    const score=await selectHostPlayer(host,snapshot.rounds[0],f.players[0].name);
    // Save only allowlisted synthetic score state, including on the failing path.
    const hostRequests={total:0,target:0};
    host.on('request',r=>{
      if(r.url()!==`${f.api}/rest/v1/rpc/write_score` || r.method()!=='POST') return;
      hostRequests.total++;
      try {if(r.postDataJSON()?.player_id===f.players[0].id) hostRequests.target++;} catch {}
    });
    const diagnostic=async phase=>{
      const state=await host.evaluate(readHostScoreState,{contestId:f.contestId,playerId:f.players[0].id,playerName:f.players[0].name,hole:f.hole});
      state.at=new Date().toISOString();
      state.requests={...hostRequests};
      const observed=await db.snapshot();
      const cell=observed.rounds.find(r=>r.id===f.roundId)?.players.find(p=>p.id===f.players[0].id)?.cells.find(c=>c.hole===f.hole);
      state.backendStrokes=Number.isFinite(cell?.strokes)?cell.strokes:null;
      const values=await score.innerText();
      state.controlScores=values.match(/\b\d+\b/g)?.map(Number)??[];
      await writeFile(`${out}/host-score-${phase}.json`,JSON.stringify(state,null,2));
    };
    await diagnostic('before-click');
    const hostWrite=host.waitForResponse(r=>r.url()===`${f.api}/rest/v1/rpc/write_score` && r.request().method()==='POST' && r.request().postDataJSON()?.player_id===f.players[0].id);
    hostWrite.catch(()=>{});
    try {
      await score.click();
      assert((await hostWrite).ok(),'Host write_score RPC succeeded');
    } finally { await diagnostic('after-click'); }
    await eventually(async()=>assertScores(f,await db.snapshot()));
    // Reconnect then cold pages retain the actual sessions and approved identity.
    await guestContext.setOffline(true);await guestContext.setOffline(false);
    for(const p of [host,guest]) {const s=await freshSnapshot(p,()=>p.reload());assertScores(f,s,{owner:p===host});}
    snapshot=await db.snapshot();assertScores(f,snapshot);
    for(const p of f.players) assert.equal(await (await selectHostPlayer(host,snapshot.rounds[0],p.name)).innerText(),String(p.score));
    assert.equal(await card.getByLabel('Journey Round hole 1 strokes').inputValue(),'6');
    const memberships=await db.read(`contest_memberships?contest_id=eq.${f.contestId}&user_id=eq.${request.requester}&select=*`);assert.equal(memberships.length,1);assertBinding(f,memberships[0],request.requester);
    await Promise.all([host.screenshot({path:`${out}/host-persisted.png`,fullPage:true}),guest.screenshot({path:`${out}/guest-rejoined.png`,fullPage:true})]);
    await writeFile(`${out}/receipt.json`,JSON.stringify({mode,contestId:f.contestId,roundId:f.roundId,players:f.players,status:'PASS',checks:['canonical restored invite equals clipboard','anonymous pending then UI approval','intended binding','both groups persisted after reconnect/reload']}));
  }
  console.log(`PASS anonymous ${mode} real join UI journey (browser evidence only)`);
} finally {await browser.close();}
