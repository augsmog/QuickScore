import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.BASE_URL||'http://127.0.0.1:8090';
const expectPaywall=process.argv.includes('--expect-paywall');
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const origin=new URL(base).origin;
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
await context.addInitScript(origin=>{if(location.origin!==origin)return;
  localStorage.setItem('snapscore-onboarding',JSON.stringify({version:0,state:{hasCompletedOnboarding:true,hasSeenDemo:true}}));
  const user={id:'pro-off-free-account',name:'Casey',email:'casey@snapscore.test',provider:'email'};
  localStorage.setItem('snapscore-auth',JSON.stringify({version:0,state:{session:{user},user,isAnonymous:false,isInitialized:true}}));
  localStorage.setItem('snapscore-scans',JSON.stringify({version:1,state:{tier:'free',isPro:false,isTD:false,scanMonth:'',scansUsed:0}}));
},origin);
const page=await context.newPage();page.setDefaultTimeout(10000);
const assertNoUpsell=async()=>{
  const body=await page.locator('body').innerText();
  assert.doesNotMatch(body,/Upgrade|SnapScore Pro|Paywall|free scan|scan cap|Try Pro/i);
  assert.doesNotMatch(page.url(),/paywall/);
};
try {
  await page.goto(base+'/');
  await page.getByTestId('home-new-contest').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('snapscore-scans')).state.tier),'free');
  await assertNoUpsell();
  await page.getByTestId('home-new-contest').click();
  await page.getByPlaceholder('Your name').fill('Casey');
  await page.getByPlaceholder('Player 2 name').fill('Jordan');
  await page.getByPlaceholder('My Course').fill('Flag Off Course');
  await page.getByText('Continue',{exact:true}).last().click();
  await page.getByTestId('contest-step-gamemodes').waitFor({state:'visible'});
  await page.getByTestId('game-mode-skins').click();
  await page.getByTestId('skins-mode-gross').waitFor({state:'visible'});
  await page.getByText('Continue',{exact:true}).last().click();
  await page.getByTestId('contest-step-round-settings').waitFor({state:'visible'});
  await page.getByText('Start',{exact:true}).click();
  await page.waitForURL(/\/contest\/[^/]+$/);
  for(let hole=1;hole<=18;hole++) {
    await page.getByTestId('score-par-Casey').click();
    await page.getByTestId('score-plus-Jordan').click();
    if(hole<18)await page.getByTestId('score-next-hole').click();
  }
  await page.getByText('Finalize Round',{exact:true}).filter({visible:true}).last().click();
  const finalize=page.getByRole('button',{name:'Finalize',exact:true});
  if(await finalize.count())await finalize.last().click();
  await page.getByText('Settlement',{exact:true}).click();
  if(expectPaywall) {
    const teaser=page.getByTestId('settle-free');
    await teaser.waitFor({state:'visible'});
    assert.match(await teaser.innerText(),/Settle up is part of SnapScore Pro\./,'flag-on build must gate settlement at its first paywall feature');
    assert.doesNotMatch(page.url(),/paywall/,'the first gate is the inline settlement teaser');
    console.log('PASS negative proof: flag-on free account reaches the first former-Pro gate at Settlement');
  } else {
    await page.getByTestId('settlement-scroll').waitFor({state:'visible'});
    const settlement=await page.locator('body').innerText();
    assert.match(settlement, /\$\d+\.\d{2}/,'Settlement must render amounts');
    await assertNoUpsell();
    await page.goBack();
    await page.getByTestId('home-new-contest').waitFor({state:'visible'});
    await assertNoUpsell();
    await page.getByRole('tab',{name:'Profile',exact:true}).click();
    await page.getByText('Statistics',{exact:true}).waitFor({state:'visible'});
    await assertNoUpsell();
    assert.equal(await page.getByText('Pro',{exact:true}).count(),0,'No Pro plan badge on Profile');
    await page.getByText('Statistics',{exact:true}).click();
    await page.getByText('Statistics',{exact:true}).first().waitFor({state:'visible'});
    await assertNoUpsell();
    assert.equal(await page.getByText('Pro',{exact:true}).count(),0,'No Pro plan badge on Statistics');
    console.log('PASS flag-off journey: fresh free account created a Skins round, settled, and opened Statistics without paywall or upsell');
  }
} finally {await browser.close();}
