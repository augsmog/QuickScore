// Two browsers with no account join by player link and keep score, and a third watches by
// spectator link. The server is the local throwaway database through bridge.cjs. Static
// files are served file-first, then by the site's _redirects rules, with no catch-all.
const http = require('http'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const DIST = process.argv[2], TOKEN = (process.env.PLAYER_TOKEN || '').trim();
const OUT = process.env.OUT_DIR || require('os').tmpdir();
if (!DIST || !/^[a-f0-9]{64}$/.test(TOKEN)) { console.error('usage: PLAYER_TOKEN=<64 hex> node journey.cjs <dist-site folder>'); process.exit(2); }
const DB = process.env.WEB_LINKS_DB || 'postgresql://postgres@127.0.0.1:54777/postgres';
const asHost = sql => execFileSync('psql', [DB, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { encoding: 'utf8', input: `begin; set local role authenticated; set local request.jwt.claims='{"sub":"71000000-0000-4000-8000-000000000001","is_anonymous":false,"role":"authenticated"}'; ${sql}; commit;` }).trim();
const rules = fs.readFileSync(path.join(DIST, '_redirects'), 'utf8').trim().split('\n').map(l => l.split(/\s+/));
const file = p => fs.existsSync(p) && fs.statSync(p).isFile() ? p : null;
function resolve(url) {
  const clean = decodeURIComponent(url.split('?')[0]);
  const direct = file(path.join(DIST, clean)) || file(path.join(DIST, clean, 'index.html')) || file(path.join(DIST, clean + '.html'));
  if (direct) return direct;
  for (const [from, to, code] of rules) if (code === '200' && clean.startsWith(from.replace('*', ''))) return resolve(to);
  return null;
}
const web = http.createServer((q, s) => { const f = resolve(q.url); if (!f) { s.statusCode = 404; return s.end('not found'); } s.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(s); }).listen(54400);
const steps = [];
const step = (name, ok, detail = '') => { steps.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) throw Error(name + ' ' + detail); };
const text = async (page, id) => (await page.getByTestId(id).first().innerText()).replace(/\s+/g, ' ').trim();
(async () => {
  // PW_CHROMIUM: path to a Chromium binary, for machines where the project's Playwright has no browser downloaded.
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const open = async label => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    await page.goto(`http://127.0.0.1:54400/p/${TOKEN}`);
    return { page, errors, label };
  };
  try {
    const A = await open('A');
    await A.page.getByText('Who are you?').waitFor({ timeout: 20000 });
    step('browser A, no account: link opens the roster', true, (await A.page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 110));
    await A.page.screenshot({ path: path.join(OUT, 'web-links-1-pick.png') });
    await A.page.getByTestId('guest-pick-Matt').click();
    await A.page.getByTestId('guest-hole').waitFor({ timeout: 20000 });
    step('A picks Matt and is in with no approval', (await text(A.page, 'guest-identity')) === 'Scoring as Matt', await text(A.page, 'guest-hole'));
    step('A sees the whole of Group A and nobody from Group B', await A.page.getByTestId('guest-plus-Augie').count() === 1 && await A.page.getByTestId('guest-plus-Chris').count() === 0);
    await A.page.getByTestId('guest-plus-Matt').click();
    await A.page.waitForFunction(() => document.querySelector('[data-testid="guest-score-Matt"]')?.textContent === '4');
    await A.page.getByTestId('guest-minus-Matt').click();
    await A.page.waitForFunction(() => document.querySelector('[data-testid="guest-score-Matt"]')?.textContent === '3');
    await A.page.getByTestId('guest-plus-Augie').click();
    await A.page.waitForTimeout(2500);
    step('A enters Matt 3 and Augie 4 on hole 1', (await text(A.page, 'guest-score-Matt')) === '3' && (await text(A.page, 'guest-score-Augie')) === '4');
    await A.page.screenshot({ path: path.join(OUT, 'web-links-2-card.png') });
    const cells = () => JSON.parse(asHost(`select public.fetch_snapshot('72000000-0000-4000-8000-000000000001')`)).rounds[0].players.map(p => `${p.displayName}:${p.cells[0].strokes ?? '-'}`).join(' ');
    step('the organizer\'s view of the server has A\'s scores', cells().startsWith('Matt:3 Augie:4'), cells());

    const B = await open('B');
    await B.page.getByTestId('guest-pick-Chris').click({ timeout: 20000 });
    await B.page.getByTestId('guest-hole').waitFor({ timeout: 20000 });
    await B.page.getByTestId('guest-plus-Chris').click();
    await B.page.waitForFunction(() => document.querySelector('[data-testid="guest-score-Chris"]')?.textContent === '4');
    await B.page.getByTestId('guest-plus-Dave').click();
    await B.page.waitForFunction(() => document.querySelector('[data-testid="guest-score-Dave"]')?.textContent === '4');
    await B.page.getByTestId('guest-plus-Dave').click();
    await B.page.waitForTimeout(2500);
    step('browser B, a second guest, keeps Group B: Chris 4, Dave 5', (await text(B.page, 'guest-score-Dave')) === '5', cells());
    await B.page.getByTestId('guest-tab-board').click();
    await B.page.getByTestId('guest-board-Matt').waitFor();
    step('B\'s leaderboard shows the score A entered', (await text(B.page, 'guest-board-Matt')).includes('-1'), await text(B.page, 'guest-board-Matt'));
    const net = await text(B.page, 'guest-net-Matt');
    step('B sees the money: Matt is up, Dave is down (amounts come from the app\'s own settlement engine)', /\+\$\d/.test(net) && (await text(B.page, 'guest-net-Dave')).includes('−$'), `${net} | ${await text(B.page, 'guest-net-Dave')}`);
    await B.page.screenshot({ path: path.join(OUT, 'web-links-3-board.png'), fullPage: true });

    // A spectator: a third browser with the spectator link. No sign-in, no way to score.
    const before = (await (await fetch('http://127.0.0.1:54399/__calls')).json()).filter(c => c === 'guest sign-in').length;
    const watch = asHost(`select public.create_spectator_link('72000000-0000-4000-8000-000000000001')`);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const C = await context.newPage(); const cErrors = []; C.on('pageerror', e => cErrors.push(String(e).slice(0, 160)));
    await C.goto(`http://127.0.0.1:54400/r/${watch}`);
    await C.getByTestId('spectator-title').waitFor({ timeout: 20000 });
    const after = (await (await fetch('http://127.0.0.1:54399/__calls')).json()).filter(c => c === 'guest sign-in').length;
    step('browser C, spectator link: board opens with no sign-in', after === before, await text(C, 'spectator-title'));
    step('spectator sees the same scores and money as the players', (await text(C, 'guest-board-Matt')).includes('-1') && (await text(C, 'guest-net-Matt')) === net, `${await text(C, 'guest-board-Matt')} | ${await text(C, 'guest-net-Matt')}`);
    step('spectator page has no score buttons and no chat', await C.getByTestId('guest-plus-Matt').count() === 0 && !(await C.locator('body').innerText()).includes('Round chat'));
    await C.screenshot({ path: path.join(OUT, 'web-links-5-spectator.png'), fullPage: true });
    const members = JSON.parse(asHost(`select public.list_player_link_members('72000000-0000-4000-8000-000000000001')`));
    step('the organizer\'s list shows both web scorers and their cards', members.length === 2, members.map(m => `${m.player_name}/${m.groups[0].name}`).join(', '));
    step('no page errors for the spectator', cErrors.length === 0, cErrors.join(' | '));

    // The organizer changes a score (as the phone would); A sees it after reopening the page.
    asHost(`select public.write_score('72000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002',1,'set',6,1,gen_random_uuid(),'host')`);
    await A.page.reload();
    await A.page.getByTestId('guest-hole').waitFor({ timeout: 20000 });
    step('A reopens the page: still Matt, no re-pick', (await text(A.page, 'guest-identity')) === 'Scoring as Matt');
    await A.page.getByTestId('guest-hole-prev').click().catch(() => {});
    const augie = async () => { for (let i = 0; i < 3; i++) { if ((await text(A.page, 'guest-hole')) === 'Hole 1') break; await A.page.getByTestId('guest-hole-prev').click(); } return text(A.page, 'guest-score-Augie'); };
    step('a score changed by the organizer shows in browser A', (await augie()) === '6', `Augie hole 1 = ${await augie()}`);

    // Organizer ends web access: the next action in the browser is refused and says why.
    asHost(`select public.revoke_player_links('72000000-0000-4000-8000-000000000001')`);
    await B.page.reload();
    await B.page.getByTestId('guest-error').waitFor({ timeout: 20000 });
    step('after the organizer ends the links, B is told so', true, await text(B.page, 'guest-error'));
    await B.page.screenshot({ path: path.join(OUT, 'web-links-4-ended.png') });
    step('scores entered on the web stay after access ends', cells().includes('Chris:4 Dave:5'), cells());
    step('no page errors in either browser', A.errors.length + B.errors.length === 0, [...A.errors, ...B.errors].join(' | '));
  } catch (e) { steps.push('STOPPED: ' + String(e.message).slice(0, 300)); process.exitCode = 1; }
  console.log(steps.join('\n'));
  console.log('server calls:', (await (await fetch('http://127.0.0.1:54399/__calls')).json()).reduce((m, c) => { const k = c.replace(/ ok$/, ''); m[k] = (m[k] || 0) + 1; return m; }, {}));
  await browser.close(); web.close();
})();
