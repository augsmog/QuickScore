import { seedPaidTier } from "./shared/paid-tier-fixture.mjs";
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
// Register TS in process; no child-process oracle or live services.
const require = createRequire(import.meta.url);
require('tsx/cjs');
const { calculateSettlement } = require('../src/engine/settlement.ts');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8089';
const OUT = process.env.OUT_DIR || 'e2e/screens/matrix';
const bundles = [
  { id:'duel-match', count:2, games:['Match Play'], ids:['match_play'] },
  { id:'duel-skins', count:2, games:['Skins'], ids:['skins'] },
  { id:'foursome', count:4, games:['Skins','Nassau'], ids:['skins','nassau'], teams:true },
  { id:'foursome-best-ball', count:4, games:['Best Ball'], ids:['best_ball'], teams:true },
  { id:'field-skins', count:8, games:['Skins'], ids:['skins'] },
  { id:'field-best-ball', count:8, games:['Best Ball'], ids:['best_ball'], teams:true },
];
const allFlows = bundles.flatMap(bundle => [9,18].flatMap(holes => ['manual','paste'].map(entry => ({...bundle,holes,entry,id:`${bundle.id}-${holes}-${entry}`}))));
const retries = Number(process.argv.find(arg => arg.startsWith('--retries='))?.slice(10) ?? 0);
assert.ok(Number.isInteger(retries) && retries >= 0, 'Invalid --retries');
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
const skip = (process.argv.find(arg => arg.startsWith('--skip='))?.slice(7) || '').split(',').filter(Boolean);
const flows = (only ? allFlows.filter(flow => flow.id === only) : allFlows).filter(flow => !skip.includes(flow.id));
if (skip.length) console.log(`Quarantined (tracked in docs/QA_FINDINGS.md): ${skip.join(', ')}`);
assert.ok(flows.length, 'Unknown --only flow ID');
if (process.argv.includes('--list')) { console.log(JSON.stringify(flows,null,2)); process.exit(0); }
fs.mkdirSync(OUT,{recursive:true});
const started = Date.now(), results = [];
let browser;
try {
  browser = await chromium.launch();
  for (const flow of flows) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const start = Date.now(), errors = [];
      const context = await browser.newContext({viewport:{width:390,height:844}});
      await seedPaidTier(context, "pro");
      // Permit Expo Camera's public static QR worker; block external service calls.
      await context.route('**/*', route => (new URL(route.request().url()).origin === new URL(BASE).origin || route.request().url() === 'https://cdn.jsdelivr.net/npm/jsqr@1.2.0/dist/jsQR.min.js') ? route.continue() : route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(10000); // Reduced from 30s to 10s for faster failure detection
      page.on('pageerror', e => errors.push(e.message));
      const visible = loc => loc.locator('visible=true').first();
      const names = Array.from({length:flow.count},(_,i)=>`Player${String.fromCharCode(65+i)}`);
      let stage = 'create';
      try {
        await page.goto(BASE, {waitUntil:'networkidle'});
        await visible(page.getByText(/^new contest$/i)).click();
        await page.getByPlaceholder('Your name').fill(names[0]);
        await page.getByPlaceholder('Player 2 name').fill(names[1]);
        for (let i=2;i<names.length;i++) {
          await visible(page.getByText(/add player/i)).click();
          await page.getByPlaceholder(`Player ${i+1} name`).fill(names[i]);
        }
        if (flow.teams) {
          await page.getByTestId('team-mode').click();
          for (const [i,name] of names.entries()) await page.getByTestId(`player-team-${name}-${i<flow.count/2?'A':'B'}`).click();
        }
        await visible(page.getByText(/^next/i)).click();
        for (const game of flow.games) await visible(page.getByText(game,{exact:true})).click();
        await visible(page.getByText(/^next/i)).click();
        await visible(page.getByText(/start contest/i)).click();
        await page.waitForURL(/\/contest\/[^/]+$/);
        const contestUrl = page.url(), id = new URL(contestUrl).pathname.split('/')[2];
        const readContest = () => page.evaluate(id => JSON.parse(localStorage.getItem('snapscore-contests')).state.contests.find(c=>c.id===id),id);
        let contest = await readContest();
        assert.deepEqual(contest.games,['stroke_play',...flow.ids]);
        assert.equal(contest.groups.flatMap(g=>g.players).length,flow.count);
        // Both entry paths use par+i per hole. PlayerA wins, including team A.
        const scores = names.map((_,i)=>contest.course.holes.map((h,j)=>j<flow.holes?h.par+i:0));
        stage = flow.entry;
        if (flow.entry === 'paste') {
          const text = [ ['Hole',...Array.from({length:18},(_,i)=>i+1)].join(','), ['Par',...contest.course.holes.map(h=>h.par)].join(','), ...names.map((n,i)=>[n,...scores[i]].join(',')) ].join('\n');
          await page.goto(`${BASE}/scan?contestId=${id}`,{waitUntil:'networkidle'});
          await page.getByTestId('scorecard-text-input').fill(text);
          await page.getByTestId('parse-scorecard-button').click();
          await page.waitForURL(/\/scan\/review/);
          const parsed = JSON.parse(new URL(page.url()).searchParams.get('scanData'));
          assert.deepEqual(parsed.map(p=>p.scores),scores);
          await visible(page.getByText(/confirm/i)).click();
          await page.waitForURL(u=>u.pathname===`/contest/${id}`);
        } else {
          await visible(page.getByText(/^scorecard$/i)).click();
          // A completed click is not a committed React render. In particular,
          // the next hole reuses these controls and animates its score text.
          // Wait for the hole, then verify each edit in both the rendered player
          // summary and persisted contest before issuing another action.
          const waitForScore = (name, hole, score) => page.waitForFunction(
            ({id, name, hole, score, total}) => {
              const control = document.querySelector(`[data-testid="score-par-${name}"]`);
              const row = control?.parentElement?.parentElement;
              const stored = JSON.parse(localStorage.getItem('snapscore-contests') || 'null');
              const player = stored?.state.contests.find(c => c.id === id)
                ?.groups.flatMap(g => g.players).find(p => p.name === name);
              return control?.innerText.split(/\s+/)[0] === String(score)
                && row?.innerText.includes(`Thru ${hole} — ${total} (`)
                && player?.scores[hole - 1] === score;
            },
            {id, name, hole, score, total:scores[names.indexOf(name)].slice(0,hole-1).reduce((a,b)=>a+b,0)+score}
          ).catch(async error => {
            const rendered = await page.getByTestId(`score-par-${name}`)
              .evaluate(el=>el.parentElement?.parentElement?.innerText).catch(()=>null);
            const persisted = (await readContest())?.groups.flatMap(g=>g.players).find(p=>p.name===name)?.scores[hole-1];
            throw new Error(`${name} hole ${hole}: expected ${score}, persisted ${persisted}, rendered ${JSON.stringify(rendered)}`, {cause:error});
          });
          if (flow.id === 'field-skins-18-manual') {
            // Regression: a later player's SlideInUp score can cross an earlier
            // player's control between pointerdown and pointerup. Hold that
            // overlap deterministically, then send a physical tap at PlayerA.
            const input = page.getByTestId(`score-par-${names[0]}`);
            await input.scrollIntoViewIfNeeded();
            await page.evaluate(async () => {
              await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));
            });
            const point = await input.evaluate((el, otherName) => {
              const box = el.getBoundingClientRect();
              const x = box.x + box.width / 2, y = box.y + box.height / 2;
              const other = document.querySelector(`[data-testid="score-par-${otherName}"]`).firstElementChild;
              const otherBox = other.getBoundingClientRect();
              const transform = `translate(${x-otherBox.x-otherBox.width/2}px, ${y-otherBox.y-otherBox.height/2}px)`;
              const animation = other.animate([{transform}, {transform}], {duration:1000,fill:'both'});
              animation.pause();
              animation.currentTime = 0;
              return {x,y};
            }, names[6]);
            try {
              await page.mouse.click(point.x, point.y, {delay:30});
              await waitForScore(names[0],1,contest.course.holes[0].par);
              assert.deepEqual(
                (await readContest()).groups.flatMap(g=>g.players).map(p=>p.scores[0]),
                [contest.course.holes[0].par,...names.slice(1).map(()=>0)],
                'An overlapping animated number must not receive another player\'s tap'
              );
            } finally {
              await page.getByTestId(`score-par-${names[6]}`).evaluate(el=>{
                el.firstElementChild.getAnimations().forEach(a=>a.cancel());
              });
            }
          }
          for (let h=0;h<flow.holes;h++) {
            await page.getByText(`HOLE ${String(h+1).padStart(2,'0')}`,{exact:true}).waitFor({state:'visible'});
            for (const [i,name] of names.entries()) {
              const input = page.getByTestId(`score-par-${name}`);
              await input.scrollIntoViewIfNeeded();
              // Playwright checks the Pressable's box, but its score text has
              // a separate entering animation after every hole change.
              await input.evaluate(async el => {
                const animations = el.getAnimations({subtree:true});
                for (let parent=el.parentElement;parent;parent=parent.parentElement) {
                  animations.push(...parent.getAnimations());
                }
                await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
              });
              await input.click();
              await waitForScore(name,h+1,contest.course.holes[h].par);
              for (let extra=0;extra<i;extra++) {
                await page.getByTestId(`score-plus-${name}`).click();
                await waitForScore(name,h+1,contest.course.holes[h].par+extra+1);
              }
            }
            if (h+1<flow.holes) await page.getByTestId('score-next-hole').click();
          }
        }
        stage = 'leaderboard';
        await page.goto(contestUrl,{waitUntil:'networkidle'});
        // Click Leaderboard tab to render leaderboard content (default tab is Scorecard)
        await visible(page.getByText(/^leaderboard$/i)).click();
        await page.getByTestId(`leaderboard-total-${names[0]}`).waitFor({state:'visible'});
        contest = await readContest();
        assert.deepEqual(contest.groups.flatMap(g=>g.players).map(p=>p.scores),scores);
        for (const [i,name] of names.entries()) {
          assert.equal(await page.getByTestId(`leaderboard-total-${name}`).innerText(),String(scores[i].reduce((a,b)=>a+b,0)));
          assert.match(await page.getByTestId(`leaderboard-player-${name}`).innerText(),new RegExp(`thru ${flow.holes}\\b`));
        }
        await page.screenshot({path:path.join(OUT,`${flow.id}-leaderboard.png`)});
        stage = 'settlement';
        const players = contest.groups.flatMap(g=>g.players);
        const expected = calculateSettlement(players,contest.course,contest.games,contest.betUnit,contest.auxiliaryData,contest.gameConfig,contest.groups);
        const cents = n => { assert.ok(Number.isFinite(n)); return Math.round(n*100); };
        assert.equal(Object.values(expected.netByPlayer).reduce((a,b)=>a+cents(b),0),0);
        await visible(page.getByText(/^settlement$/i)).click();
        if (flow.holes < contest.course.holes.length) {
          // Nine played on an eighteen-hole card is an unfinished round, never
          // a shortened contest with silently pro-rated final cash.
          assert.equal(expected.pending,true);
          assert.deepEqual(expected.transactions,[]);
          await page.getByText(/Settlement pending\./).waitFor({state:'visible'});
          assert.equal(await page.getByTestId('settlement-session-total').count(),0);
          assert.deepEqual(errors,[]);
          await page.screenshot({path:path.join(OUT,`${flow.id}-settlement-pending.png`)});
          results.push({id:flow.id,attempt:attempt+1,ok:true,pending:true,seconds:(Date.now()-start)/1000});
          console.log(`PASS ${flow.id} (unfinished card correctly pending)`);
          break;
        }
        assert.equal(expected.pending,undefined);
        assert.ok(Object.values(expected.netByPlayer).some(n=>n>0),'Nontrivial payout required');
        let displayedBalance=0, winners=0;
        for (const [name,net] of Object.entries(expected.netByPlayer)) {
          const row = page.getByTestId(`settlement-player-${name}`);
          await row.scrollIntoViewIfNeeded();
          const text = await row.innerText();
          const money = text.match(/([+-]?)\$(\d+\.\d{2})/);
          const displayed = /Even/.test(text) ? 0 : (money?.[1]==='-'?-1:1)*cents(Number(money?.[2]));
          assert.equal(displayed,cents(net),`${name} displayed settlement`);
          displayedBalance+=displayed; if(displayed>0) winners+=displayed;
          const ledger = expected.transactions.reduce((sum,t)=>sum+(t.to===name?cents(t.amount):0)-(t.from===name?cents(t.amount):0),0);
          assert.equal(ledger,cents(net),`${name} ledger`);
        }
        assert.equal(displayedBalance,0);
        assert.equal(cents(Number((await page.getByTestId('settlement-session-total').innerText()).replace('$',''))),winners);
        await page.getByTestId('settlement-scroll').evaluate(el=>{el.scrollTop=0;});
        await page.screenshot({path:path.join(OUT,`${flow.id}-settlement.png`)});
        assert.deepEqual(errors,[]);
        results.push({id:flow.id,attempt:attempt+1,ok:true,seconds:(Date.now()-start)/1000});
        console.log(`PASS ${flow.id}`);
        break;
      } catch (error) {
        await page.screenshot({path:path.join(OUT,`${flow.id}-attempt-${attempt+1}-failure.png`)}).catch(()=>{});
        results.push({id:flow.id,attempt:attempt+1,retrying:attempt<retries,ok:false,stage,error:error.message,pageErrors:errors,seconds:(Date.now()-start)/1000});
        console.log(`FAIL ${flow.id} (${stage}): ${error.message}`);
      } finally { await context.close(); }
    }
  }
} catch (error) {
  results.push({id:'runner',ok:false,error:error.message});
  console.error(error.message);
} finally {
  await browser?.close();
  const finalResults = results.filter(r=>!r.retrying);
  const report={planned:flows.length,run:finalResults.filter(r=>r.id!=='runner').length,passed:finalResults.filter(r=>r.ok).length,failed:finalResults.filter(r=>!r.ok).length,seconds:(Date.now()-started)/1000,nineHoleMeaning:'9 played on 18-hole course; true nine-hole creation unsupported',results};
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(report,null,2));
  console.log(`${report.passed}/${report.run} flows passed; ${report.failed} failures; ${report.seconds}s`);
  process.exitCode=report.failed?1:0;
}
