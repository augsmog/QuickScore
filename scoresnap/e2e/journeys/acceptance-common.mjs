import {paintedText} from './painted-value.mjs';
import assert from 'node:assert/strict';
import {seedPaidTier} from '../shared/paid-tier-fixture.mjs';
export const account={id:'render-acceptance-account',name:'Test Golfer',email:'render@snapscore.test',provider:'email'};
export const fixtureVersion='render-acceptance-v1';
export function completedRounds() {
  // Same two-player/course shape as the existing journey fixture; scores complete
  // only the precondition. Settlement marks are NEVER seeded or rewritten.
  return ['a','b'].map(suffix=>({id:`acceptance-round-${suffix}`,name:`Acceptance round ${suffix.toUpperCase()}`,status:'completed',betUnit:5,hasTeams:false,games:['stroke_play','nassau'],createdAt:'2026-10-31T00:00:00Z',course:{name:'Journey course',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:350}))},groups:[{id:'g1',name:'Group 1',players:['Augie','Sam'].map((name,i)=>({id:`p${i+1}`,name,handicap:0,scores:Array(18).fill(4+i)}))}]}));
}
export async function seedAcceptance(context,fixture) {
  const tier=fixture.tier||'pro';
  if(tier!=='free')await seedPaidTier(context,tier,fixture.origin??null);
  await context.addInitScript(({fixture,account,rounds})=>{
    if(fixture.origin && location.origin!==fixture.origin)return;
    if(localStorage.getItem('render-acceptance-seeded'))return;
    const user={...account,name:fixture.unnamed?'Golfer':account.name};
    localStorage.setItem('snapscore-onboarding',JSON.stringify({version:0,state:{hasCompletedOnboarding:true,hasSeenDemo:true}}));
    localStorage.setItem('snapscore-auth',JSON.stringify({version:0,state:{session:{user},user,isAnonymous:false,isInitialized:true}}));
    localStorage.setItem('snapscore-settings',JSON.stringify({version:0,state:{scoreFormat:'to_par',showNetScores:true}}));
    localStorage.setItem('snapscore-contests',JSON.stringify({version:0,state:{contests:fixture.kind==='settlement'?rounds:[],activeContestId:null}}));
    localStorage.setItem('render-acceptance-seeded','1');
  },{fixture,account,rounds:completedRounds()});
}
export async function visible(locator) {locator=locator.filter({visible:true});await locator.waitFor({state:'visible'});assert(await locator.isVisible());}
export function revealScrollDelta(rect,top,bottom) {
 if(rect.top>=top+2&&rect.bottom<=bottom-2)return null;
 // A 4px clearance is enough for the geometry gate. Larger margins can jump
 // a near-edge control past the viewport on short, touch-sized profiles.
 return Math.max(-600,Math.min(600,rect.top<top?rect.top-top-4:rect.bottom-bottom+4));
}
export async function text(locator,expected) {await paintedText(locator,expected);}
export async function enabled(locator) {await visible(locator);await locator.page().waitForFunction(el=>!el.disabled&&el.getAttribute('aria-disabled')!=='true',await locator.elementHandle());}
export async function reveal(page,act,locator) {
  await locator.waitFor({state:'attached'});
  // Scroll through the existing action wrapper; never use locator autoscroll or
  // alter roles/names/styles. Only tag the existing scroll ancestor for lookup.
  for(let i=0;i<10;i++) {
    const state=await locator.evaluate(el=>{
      const r=el.getBoundingClientRect();let s=el.parentElement;
      while(s&&!(s.scrollHeight>s.clientHeight+1&&/(auto|scroll)/.test(getComputedStyle(s).overflowY)))s=s.parentElement;
      const c=s?s.getBoundingClientRect():{top:0,bottom:innerHeight};
      const top=Math.max(0,c.top),bottom=Math.min(innerHeight,c.bottom);
      if(r.top>=top+2&&r.bottom<=bottom-2)return {visible:true};
      if(!s)throw Error('No scrollable ancestor for offscreen control');
      document.querySelectorAll('[data-acceptance-scroll]').forEach(n=>n.removeAttribute('data-acceptance-scroll'));
      s.setAttribute('data-acceptance-scroll','active');
      return {visible:false,rect:{top:r.top,bottom:r.bottom},top,bottom};
    });
    if(state.visible)return;
    await act.scroll(page.locator('[data-acceptance-scroll="active"]'),revealScrollDelta(state.rect,state.top,state.bottom));
  }
  throw Error('Control not reachable within ten explicit viewport-bounded scrolls');
}
export async function press(page,act,locator) {await reveal(page,act,locator);await enabled(locator);await act.activate(locator);}
export async function persisted(page,key) {return page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null')?.state,key);}
export async function waitState(page,key,predicateSource) {
  await page.waitForFunction(({key,predicateSource})=>new Function('state',`return (${predicateSource})(state)`)(JSON.parse(localStorage.getItem(key)||'null')?.state),{key,predicateSource});
}
export async function waitChecked(locator,value) {await locator.page().waitForFunction(({el,value})=>el.checked===value,{el:await locator.elementHandle(),value});assert.equal(await locator.isChecked(),value);}
export async function stablePaint(page) {await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
