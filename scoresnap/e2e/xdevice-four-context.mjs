// Disposable CI stack only. Four ordinary identities; never log sessions or credentials.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:8089';
const out = process.env.OUT_DIR ?? '/tmp/xdevice-four-context';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
const pages = await Promise.all(contexts.map(c => c.newPage()));
const names = ['Xdev Host', 'Xdev Bravo', 'Xdev Charlie', 'Xdev Delta'];
const snapshots = new WeakMap();
const text = (p, value) => p.getByText(value, { exact: true }).filter({ visible: true }).first();
function configure(p) {
  p.setDefaultTimeout(20000);
  p.on('dialog', d => d.accept());
  p.on('response', async r => {
    if (r.url().endsWith('/rpc/fetch_snapshot') && r.ok()) {
      try { const s = await r.json(); if (!snapshots.has(p) || s.revision >= snapshots.get(p).revision) snapshots.set(p, s); } catch {}
    }
  });
}
pages.forEach(configure);
let stepNumber = 0;
async function step(name, work) {
  const n = ++stepNumber;
  try {
    await work();
    for (const [i, p] of pages.entries()) if (!p.isClosed()) await p.screenshot({ path: path.join(out, `${n}-${i}.png`), fullPage: true });
    console.log(`STEP ${n} ${name} ok`);
  } catch (error) { throw new Error(`STEP ${n} ${name} failed: ${error.message}`, { cause: error }); }
}
async function poll(name, check) {
  const deadline = Date.now() + 30000;
  let last;
  do {
    try { if (await check()) return; } catch (error) { last = error.message; }
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw Error(`${name}: 30s deadline exceeded${last ? ` (${last})` : ''}`);
}
async function signIn(p, who) {
  await p.goto(`${base}/auth/sign-in`);
  await p.getByText(/Skip|Already have an account/).first().waitFor();
  if (await text(p, 'Skip').isVisible()) { await text(p, 'Skip').click(); await p.goto(`${base}/auth/sign-in`); }
  await text(p, 'Already have an account? Sign in').click();
  await p.getByPlaceholder('Email address').waitFor();
  const email = process.env[`XDEV_${who}_EMAIL`], password = process.env[`XDEV_${who}_PASSWORD`];
  if (!email || !password) return false;
  await p.getByPlaceholder('Email address').fill(email);
  await p.getByPlaceholder('Password', { exact: true }).fill(password);
  await text(p, 'Sign In').click();
  await p.waitForURL(u => !u.pathname.includes('/auth/'));
  return true;
}
async function save(i, hole, value) {
  const p = pages[i];
  // Scope both controls to the first round if the fixture ever gains more rounds.
  await p.getByLabel(new RegExp(` hole ${hole} strokes$`)).first().fill(String(value));
  await text(p, `Save hole ${hole}`).click();
}
async function retry(i) {
  await text(pages[i], i === 0 ? 'Retry sync' : 'Retry queued scores').click();
}
const expected = [];
function expectCell(i, hole, value) {
  const found = expected.find(c => c.i === i && c.hole === hole);
  if (found) found.value = value; else expected.push({ i, hole, value });
}
async function converge(indices) {
  for (const i of indices) await retry(i);
  await poll(`contexts ${indices.join(',')} converge to every expected cell and UI total`, async () => {
    for (const i of indices) {
      const s = snapshots.get(pages[i]);
      if (!s) return false;
      for (const cell of expected) {
        const player = s.rounds[0].players.find(p => p.displayName === names[cell.i]);
        if (player?.cells.find(c => c.hole === cell.hole)?.strokes !== cell.value) return false;
      }
      if (i === 0) {
        if (!await text(pages[i], 'Current online snapshot').isVisible()) return false;
        const heading = await pages[i].getByText(/^HOLE \d{2}$/).first().innerText();
        const hole = Number(heading.match(/\d+/)[0]);
        for (const cell of expected.filter(c => c.hole === hole)) {
          const displayed = await pages[i].getByTestId(`score-par-${names[cell.i]}`).innerText();
          if (Number(displayed.trim().split(/\s/)[0]) !== cell.value) return false;
        }
      }
      // Guests expose confirmed totals for every player, even though only their own cells are editable.
      if (i !== 0) for (const owner of [1, 2, 3]) {
        const sum = expected.filter(c => c.i === owner).reduce((n, c) => n + c.value, 0);
        if (sum && !await text(pages[i], `${names[owner]}: ${sum} · incomplete`).isVisible()) return false;
      }
    }
    return true;
  });
}
async function queueEntries(p) {
  return p.evaluate(() => Object.keys(localStorage).filter(k => k.includes('snapscore.outbox.v1.')).flatMap(k => JSON.parse(localStorage.getItem(k)).entries));
}
let contestId, contestUrl, code;
try {
  const signed = [];
  await step('sign in A B C D', async () => {
    for (let i = 0; i < 4; i++) signed.push(await signIn(pages[i], 'ABCD'[i]));
  });
  if (signed.some(ok => !ok)) {
    assert.equal(process.env.XDEV_SIGNIN_ONLY, '1', 'All A–D credentials required; XDEV_SIGNIN_ONLY=1 allows only sign-in smoke');
    console.log('PASS sign-in screen in four isolated contexts; full flow NOT RUN (credentials absent)');
  } else {
    await step('create four-player contest and enable sharing', async () => {
      const a = pages[0];
      await a.goto(`${base}/contest/new`);
      await a.getByPlaceholder('Your name').fill(names[0]);
      await a.getByPlaceholder('Player 2 name').fill(names[1]);
      for (let i = 2; i < 4; i++) { await text(a, '+ ADD PLAYER').click(); await a.getByPlaceholder(`Player ${i + 1} name`).fill(names[i]); }
      await a.getByText(/^Next/i).filter({ visible: true }).last().click();
      await a.getByText(/^Next/i).filter({ visible: true }).last().click();
      await text(a, /^START CONTEST/i).click();
      await a.waitForURL(/\/contest\/[^/]+$/);
      contestUrl = a.url(); contestId = new URL(contestUrl).pathname.split('/').pop();
      await text(a, 'Enable online sharing').click();
      const label = await a.getByTestId('organizer-join-code').innerText();
      code = label.match(/Join code: ([A-Z0-9]{6})/)?.[1];
      assert(code, 'Organizer join code available');
      await text(a, 'Online sharing enabled. Share this invite with signed-in players.').waitFor();
      await text(a, 'Online sync').click();
    });
    for (let i = 1; i < 4; i++) await step(`request and approve ${'ABCD'[i]} into distinct slot`, async () => {
      const p = pages[i];
      await p.goto(`${base}/join/${code}`);
      await p.getByLabel('Join code').fill(code);
      await p.getByPlaceholder('Display name').fill(names[i]);
      await text(p, 'Find contest').click();
      await p.getByText(/Request sent/).waitFor();
      assert.equal(await p.getByText(/Confirmed tournament totals/).count(), 0, 'Pending identity has no totals');
      for (const name of names) assert.equal(await text(p, name).count(), 0, 'Pending identity has no roster');
      await retry(0);
      await text(pages[0], `${names[i]} requests a player slot`).waitFor();
      const decided = pages[0].waitForResponse(r => r.url().endsWith('/rpc/decide_join_request') && r.request().method() === 'POST');
      await text(pages[0], `${names[i]} requests a player slot`).locator('..').getByText(`Approve as ${names[i]}`, { exact: true }).click();
      assert((await decided).ok(), 'Host approval accepted');
      await p.reload();
      await text(p, names[i]).waitFor();
      await text(p, 'Confirmed tournament totals · queued edits excluded').waitFor();
    });
    await step('host opens synchronized scoring screen', async () => {
      await pages[0].goto(`${contestUrl}/scorecard`);
      await text(pages[0], 'Online sync').click();
      await retry(0);
      await text(pages[0], 'Current online snapshot').waitFor();
    });
    await step('offline drafts visible immediately; reconnect D B C', async () => {
      for (const i of [1, 2, 3]) {
        await contexts[i].setOffline(true);
        await save(i, 1, i + 4);
        await pages[i].getByText(new RegExp(`^Hole 1 · current clear · queued ${i + 4} · par`)).first().waitFor();
        expectCell(i, 1, i + 4);
      }
      for (const i of [3, 1, 2]) { await contexts[i].setOffline(false); await retry(i); await pages[i].getByText(new RegExp(`^Hole 1 · current ${i + 4} · par`)).first().waitFor(); }
      await converge([0, 1, 2, 3]);
    });
    await step('same-hole conflict explicit and Keep current resolves', async () => {
      await contexts[1].setOffline(true);
      await save(1, 2, 9);
      await pages[1].getByText(/^Hole 2 · current clear · queued 9 · par/).first().waitFor();
      await text(pages[0], 'NEXT').click();
      await text(pages[0], 'HOLE 02').waitFor();
      await pages[0].getByTestId(`score-par-${names[1]}`).click();
      await poll('host hole two accepted before B reconnects', async () => {
        const cell = snapshots.get(pages[0])?.rounds[0].players.find(p => p.displayName === names[1])?.cells.find(c => c.hole === 2);
        return cell?.strokes != null;
      });
      const current = snapshots.get(pages[0]).rounds[0].players.find(p => p.displayName === names[1]).cells.find(c => c.hole === 2).strokes;
      assert.notEqual(current, 9);
      await contexts[1].setOffline(false); await retry(1);
      await pages[1].getByText(/^Hole 2: conflict ·/).first().waitFor();
      await text(pages[1], 'Use my score').waitFor();
      await text(pages[1], 'Keep current').click();
      await poll('conflict removed', async () => (await queueEntries(pages[1])).every(e => e.state !== 'conflict'));
      await poll('conflict actions gone', async () => !await text(pages[1], 'Keep current').isVisible() && !await text(pages[1], 'Use my score').isVisible());
      expectCell(1, 2, current);
      await converge([0, 1, 2, 3]);
    });
    await step('host leaves; players continue; host returns without loss or duplicates', async () => {
      await pages[0].close(); await contexts[0].setOffline(true);
      for (const i of [1, 2, 3]) { await save(i, 3, i + 7); expectCell(i, 3, i + 7); }
      await converge([1, 2, 3]);
      await contexts[0].setOffline(false);
      pages[0] = await contexts[0].newPage(); configure(pages[0]);
      await pages[0].goto(`${contestUrl}/scorecard`);
      await text(pages[0], 'Online sync').click();
      await converge([0, 1, 2, 3]);
      for (const i of [1, 2, 3]) assert.equal((await queueEntries(pages[i])).length, 0, 'No duplicated or pending player operations');
    });
    await step('host RPC revocation denies queued write and removes roster across reloads', async () => {
      // Freeze D's stale authorized screen, revoke while it is disconnected, then enqueue AFTER revocation.
      await contexts[3].setOffline(true);
      const memberId = await pages[3].evaluate(() => {
        const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
        if (!key) throw Error('D session storage missing');
        return JSON.parse(localStorage.getItem(key)).user.id;
      });
      const api = process.env.EXPO_PUBLIC_SUPABASE_URL, anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      assert(api && anon, 'Public disposable API configuration required');
      assert.equal(new URL(api).hostname, '127.0.0.1', 'Revocation restricted to disposable local stack');
      const result = await pages[0].evaluate(async ({ api, anon, contestId, memberId }) => {
        const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
        if (!key) throw Error('Host session storage missing');
        const session = JSON.parse(localStorage.getItem(key));
        const r = await fetch(`${api}/rest/v1/rpc/revoke_membership`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ contest_id: contestId, member_id: memberId }) });
        return { status: r.status, json: await r.json() };
      }, { api, anon, contestId, memberId });
      assert.equal(result.status, 200, 'Host revoke RPC succeeds'); assert.equal(result.json.status, 'revoked');
      await save(3, 4, 15);
      await pages[3].getByText(/^Hole 4 · current clear · queued 15 · par/).first().waitFor();
      await contexts[3].setOffline(false); await retry(3);
      await poll('D durable draft denied, never acknowledged', async () => (await queueEntries(pages[3])).some(e => e.draft.hole === 4 && e.draft.strokes === 15 && e.state === 'denied'));
      for (let attempt = 0; attempt < 2; attempt++) {
        const discovery = pages[3].waitForResponse(r => r.url().endsWith('/rpc/my_sync_status') && r.request().method() === 'POST');
        await pages[3].reload();
        const response = await discovery; assert(response.ok(), 'Revoked discovery completes');
        const status = await response.json();
        assert(!status.memberships.some(m => m.contest_id === contestId && m.status === 'approved'));
        await poll('D roster and scorecard absent', async () => !await text(pages[3], 'Confirmed tournament totals · queued edits excluded').isVisible() && !await text(pages[3], names[3]).isVisible());
        await pages[3].evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
      }
      await converge([0, 1, 2]);
      for (const i of [0, 1, 2]) assert.equal(snapshots.get(pages[i]).rounds[0].players.find(p => p.displayName === names[3]).cells.find(c => c.hole === 4).strokes, null, 'Post-revocation score never propagated');
      const denied = (await queueEntries(pages[3])).filter(e => e.draft.hole === 4);
      assert.equal(denied.length, 1); assert.equal(denied[0].state, 'denied', 'Denied draft survives reload');
      console.log('Product gap: host has no in-app remove-device control; revocation exercised via host-session backend RPC');
    });
    console.log('PASS four isolated browsers: approve x3, offline reconnect D,B,C, same-hole conflict resolved, host leave/return, removed-phone lockout');
  }
} catch (error) {
  for (const [i, p] of pages.entries()) if (!p.isClosed()) await p.screenshot({ path: path.join(out, `failure-${i}.png`), fullPage: true }).catch(() => {});
  throw error;
} finally { await Promise.all(contexts.map(c => c.close())); await browser.close(); }
