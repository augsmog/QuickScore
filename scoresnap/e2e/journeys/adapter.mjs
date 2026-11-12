import {paywallSetup,paywallReady,paywallCases} from './paywall-recovery.mjs';
import {acceptanceSetup,acceptanceReady,acceptanceCases} from './acceptance-cases.mjs';
// SnapScore web-offline adapter. Fixtures stop before the measured goal.
import assert from 'node:assert/strict';
import {seedPaidTier} from '../shared/paid-tier-fixture.mjs';
export const fixtureVersion='two-player-empty-v1';
export const disclosures=['round-status-chip','overflow-menu','more-menu','home-see-all-modes'];
export const roundId='journey-empty-round';
export async function setup(context,page,journey,base) {
  // Test-only IDs on existing Pressables that have no source testID. No semantics
  // are added: the independent role/name check must still fail (AUG-306).
  await context.addInitScript(() => {
    const ids={'Leaderboard':'journey-leaderboard','Settlement':'journey-settlement','Copy / share local invite':'journey-invite','Finalize Round':'journey-finalize'};
    const tag=()=>document.querySelectorAll('[tabindex="0"]').forEach(el=>{
      const id=ids[el.textContent.trim()];
      if(id && !el.hasAttribute('data-testid')) el.setAttribute('data-testid',id);
    });
    new MutationObserver(tag).observe(document,{subtree:true,childList:true});
  });
  if(await paywallSetup(context,page,journey,base))return;
  if(await acceptanceSetup(context,page,journey,base))return;
  if(journey.fixture==='two-player-empty-v1') {
    await seedPaidTier(context,'td');
    await context.addInitScript(({id})=>{
      // Once per context, never overwrite saved scores when reloading.
      if(localStorage.getItem('journey-fixture-seeded')) return;
      const contest={id,name:'Journey round',status:'active',betUnit:1,hasTeams:false,games:['stroke_play'],createdAt:'2026-10-31T00:00:00Z',joinCode:'JRNY26',course:{name:'Journey course',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:350}))},groups:[{id:'g1',name:'Group 1',players:['Augie','Sam'].map((name,i)=>({id:`p${i+1}`,name,handicap:0,scores:Array(18).fill(0)}))}]};
      localStorage.setItem('snapscore-contests',JSON.stringify({version:0,state:{contests:[contest],activeContestId:id}}));
      localStorage.setItem('journey-fixture-seeded','1');
    },{id:roundId});
  }
  // Expo's app shell can still be finishing load-only resources on the short
  // SE profile; app readiness is asserted explicitly below after DOM parsing.
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await ready(page,'home');
  if(journey.start==='round') await page.goto(base+`/contest/${roundId}`,{waitUntil:'domcontentloaded'});
  await ready(page,journey.start==='round'?'round-scorecard':'home');
  if(journey.start==='round') assert.deepEqual(await scores(page),[Array(18).fill(0),Array(18).fill(0)],'fixture must not pre-complete scores');
}
export async function ready(page,id) {
  if(await paywallReady(page,id))return;
  if(id==='setup-modes'||id==='setup-settings'){await page.getByTestId(id==='setup-modes'?'contest-step-gamemodes':'contest-step-round-settings').waitFor({state:'visible'});return;}
  if(await acceptanceReady(page,id))return;
  const targets={home:page.getByText('Build contests. Settle up.',{exact:false}).locator('visible=true'),create:page.getByPlaceholder('Your name'),'join-code':page.getByPlaceholder('Join code'),'round-scorecard':page.getByTestId('score-par-Augie'),'round-leaderboard':page.getByTestId('leaderboard-player-Augie'),'round-settlement':page.getByTestId('settlement-scroll')};
  await targets[id].waitFor({state:'visible'});
  await page.evaluate(async()=>{await document.fonts.ready; await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
}
export async function scores(page) {
  return page.evaluate(()=>JSON.parse(localStorage.getItem('snapscore-contests')).state.contests[0].groups[0].players.map(p=>p.scores));
}
export async function contests(page) {
  return page.evaluate(()=>JSON.parse(localStorage.getItem('snapscore-contests')||'null')?.state?.contests||[]);
}
async function waitForStableViewportRect(locator) {
  await locator.waitFor({state:'visible'});
  await locator.evaluate(el=>new Promise((resolve,reject)=>{
    let previous=null,stable=0,frames=0;
    const tick=()=>{
      const r=el.getBoundingClientRect(),current=[r.x,r.y,r.width,r.height];
      const inView=r.width>0&&r.height>0&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;
      stable=inView&&previous&&current.every((v,i)=>Math.abs(v-previous[i])<0.5)?stable+1:0;
      previous=current;
      if(stable>=3)resolve();
      else if(++frames>=120)reject(Error('control did not settle inside viewport'));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}
export const cases={
  ...paywallCases,
  ...acceptanceCases,
  'J-home-create-cancel':async({page,act,check,step,enter})=>{
    await check('entry',async()=>assert.equal((await contests(page)).length,0));
    await act.activate(page.getByTestId('home-new-contest'),{feature:'create'});
    await check('activation',()=>page.waitForURL(/\/contest\/new$/));
    await enter('create'); await check('destination',()=>ready(page,'create')); await step('create');
    await act.type(page.getByPlaceholder('Your name'),'Unsubmitted'); await step('edit');
    await act.activate(page.getByTestId('new-contest-back')); await enter('home');
    await check('outcome',async()=>assert.equal((await contests(page)).length,0)); await step('cancel-home');
  },
  'J-home-join-code-error':async({page,act,check,step,enter})=>{
    await check('entry',()=>ready(page,'home'));
    await act.activate(page.getByTestId('home-join-code'),{feature:'join'});
    await check('activation',()=>page.waitForURL(/\/join\/enter$/));
    await enter('join-code'); await check('destination',()=>ready(page,'join-code')); await step('join');
    await act.type(page.getByPlaceholder('Join code'),'ZZZZZZ');
    await act.type(page.getByPlaceholder('Display name'),'Guest'); await step('invalid-code');
    await act.activate(page.getByText('Find contest',{exact:true}).locator('..'));
    await check('invalid-code-error',()=>page.getByText(/Contest not found on this device/).waitFor({state:'visible'})); await step('error');
    await act.activate(page.getByTestId('join-dismiss')); await enter('home');
    await check('outcome',async()=>assert.equal((await contests(page)).length,0)); await step('dismiss-home');
  },
  'J-round-score-settle-reload':async({page,act,check,step,enter,reload})=>{
    await check('entry',()=>ready(page,'round-scorecard'));
    for(const name of ['Augie','Sam']) {await act.activate(page.getByTestId(`score-par-${name}`),{feature:`score-${name}`,navigation:false});await step(`score-${name}`);}
    const expected=[4,...Array(17).fill(0)];
    await check('activation',async()=>assert.deepEqual(await scores(page),[expected,expected]));
    await act.activate(page.getByTestId('journey-settlement'),{feature:'settle'}); await enter('round-settlement');
    await check('destination',()=>ready(page,'round-settlement')); await step('settle');
    await act.activate(page.getByTestId('journey-leaderboard'),{feature:'leaderboard'}); await enter('round-leaderboard');
    await check('leaderboard-totals',async()=>{for(const n of ['Augie','Sam']) assert.equal((await page.getByTestId(`leaderboard-total-${n}`).innerText()).trim(),'4');}); await step('leaderboard');
    await reload(); await enter('round-scorecard');
    await check('outcome',async()=>assert.deepEqual(await scores(page),[expected,expected])); await step('reload-saved');
  },
  'J-invite-from-round':async({page,act,check,step})=>{
    await check('entry',()=>ready(page,'round-scorecard'));
    await check('code-visible',async()=>assert.equal((await page.getByTestId('organizer-join-code').innerText()).trim(),'Join code: JRNY26'));
    await act.activate(page.getByTestId('journey-invite'),{feature:'invite'});
    await check('activation',()=>page.getByText('Local invite link copied · same browser only',{exact:true}).waitFor({state:'visible'}));
    await check('destination',async()=>assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/\/join\/JRNY26$/));
    await check('outcome',async()=>assert.equal((await contests(page))[0].joinCode,'JRNY26')); await step('invite-copied');
  },
  'J-game-rules':async({page,act,check,step})=>{
    await check('entry',()=>ready(page,'home'));
    await act.activate(page.getByTestId('home-see-all-modes'),{feature:'game-library'});
    await check('library',()=>page.getByText('50+ game modes',{exact:true}).waitFor({state:'visible'}));
    await step('game-library');
    await waitForStableViewportRect(page.getByText('50+ game modes',{exact:true}));
    await act.scroll(page.getByTestId('game-mode-row-skins').locator('xpath=../..'),240);
    await step('game-modes-scroll');
    await act.activate(page.getByTestId('game-mode-row-skins'),{feature:'skins-rules'});
    await check('rule',async()=>{
      const sheet=page.getByTestId('game-info-sheet');
      await sheet.waitFor({state:'visible'});
      assert.equal(await sheet.getByText('Skins',{exact:true}).count(),1);
      assert.ok((await sheet.innerText()).trim().length>0);
    });
    await waitForStableViewportRect(page.getByTestId('game-info-close'));
    await step('skins-rules');
    await act.activate(page.getByTestId('game-info-close'));
    await check('outcome',()=>page.getByTestId('game-info-sheet').waitFor({state:'hidden'}));
    await step('home-restored');
  },
  'J-finalize-settle':async({page,act,check,step,enter})=>{
    await check('entry',()=>ready(page,'round-scorecard'));
    await act.activate(page.getByTestId('journey-finalize'));
    await check('activation',async()=>assert.equal((await contests(page))[0].status,'active')); await step('finalize-requested');
    const dialog=page.getByRole('dialog');
    await check('confirmation shown',async()=>{
      await dialog.waitFor({state:'visible'});
      assert.equal(await dialog.getByRole('heading',{name:'Incomplete Scorecard'}).isVisible(),true);
      assert.equal(await dialog.getByRole('button',{name:'Keep Scoring'}).isVisible(),true);
      assert.equal(await dialog.getByRole('button',{name:'Finalize Anyway'}).isVisible(),true);
    });
    await step('confirmation-visible');
    await act.activate(dialog.getByRole('button',{name:'Keep Scoring'}));
    await check('outcome',async()=>assert.equal((await contests(page))[0].status,'active'));
    await check('confirmation dismissed',()=>dialog.waitFor({state:'hidden'}));
    await step('cancelled'); await enter('round-scorecard');
  },
};
