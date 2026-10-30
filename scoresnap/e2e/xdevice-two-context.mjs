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
const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));
for(const p of [a,b]) { p.setDefaultTimeout(20000); p.on('dialog',d=>d.accept()); }
const shot=(p,n)=>p.screenshot({path:path.join(out,`${n}.png`),fullPage:true});
const text=(p,s)=>p.getByText(s,{exact:true}).filter({visible:true}).first();
async function signIn(p,who) {
  await p.goto(`${base}/auth/sign-in`);
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
    await text(a,'Start Contest').click();
    await a.waitForURL(/\/contest\/[^/]+$/);
    const contestUrl=a.url();
    await text(a,'Enable online sharing').click();
    const label=await a.getByTestId('organizer-join-code').innerText();
    const code=label.match(/Join code: ([A-Z0-9]{6})/)[1];
    await text(a,'Copy / share invite').click();
    await shot(a,'02-share');
    await b.goto(`${base}/join/${code}`);
    if(!await b.getByLabel('Join code').inputValue()) await b.getByLabel('Join code').fill(code);
    await b.getByPlaceholder('Display name').fill('Xdev Joiner');
    await text(b,'Find contest').click();
    await b.getByText(/Request sent/).waitFor();
    await shot(b,'03-request');
    await text(a,'Online sync').click();
    await text(a,'Retry sync').click();
    await text(a,'Approve as Xdev Joiner').click();
    await shot(a,'04-approved');
    await b.getByText('Xdev Joiner',{exact:true}).first().waitFor({timeout:40000});
    await shot(b,'05-claimed');
    await a.goto(`${contestUrl}/scorecard`);
    await a.getByTestId('score-par-Xdev Joiner').click();
    await shot(a,'06-score');
    await b.getByText(/Hole 1 · current 4/).waitFor({timeout:20000});
    await shot(b,'07-received');
    // A fresh isolated actor has no contests. B sees only this approved round.
    await b.goto(`${base}/join/enter`);
    await b.getByText('Xdev Joiner',{exact:true}).first().waitFor();
    assert.equal(await b.getByText(/Confirmed tournament totals/).count(),1,'B must see exactly the approved contest');
    await shot(b,'08-private');
    console.log('PASS two isolated signed-in browsers: enrollment, invite, approval, score propagation <=20s, approved-contest discovery');
  }
} finally { await Promise.all(contexts.map(c=>c.close())); await browser.close(); }
