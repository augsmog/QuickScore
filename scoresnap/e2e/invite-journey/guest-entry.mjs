// Fresh unauthenticated browser context only. No state injection or direct Join URL.
const ORIGIN='http://127.0.0.1:8089';
export function scene(url) {
  try {
    const u=new URL(url);
    if(u.origin!==ORIGIN)return 'other';
    return ({'/onboarding':'onboarding','/auth/sign-in':'sign-in','/join/enter':'join','/':'home'})[u.pathname]??'other';
  } catch {return 'other';}
}
export async function enterFreshGuestJoin(page) {
  let phase='entry-route';
  try {
    // Ignore transient pre-initialization Home. A fresh context has no authenticated
    // identity, so Home is not an authorized fallback for this anonymous test.
    await page.waitForURL(u=>['onboarding','sign-in'].includes(scene(u.href)),{timeout:30000});
    if(scene(page.url())==='onboarding') {
      phase='onboarding-skip';
      await page.getByText('Skip',{exact:true}).click();
      await page.waitForURL(u=>scene(u.href)==='sign-in',{timeout:30000});
    }
    phase='sign-in-scene';
    if(scene(page.url())!=='sign-in')throw Error('unexpected route');
    await page.getByPlaceholder('Email address',{exact:true}).waitFor({state:'visible'});
    phase='sign-in-join';
    await page.getByText('Join with code',{exact:true}).click();
    phase='join-scene';
    await page.waitForURL(u=>scene(u.href)==='join',{timeout:30000});
    await page.getByLabel('Join code',{exact:true}).waitFor({state:'visible'});
    await page.getByPlaceholder('Display name',{exact:true}).waitFor({state:'visible'});
    await page.getByText('Find contest',{exact:true}).waitFor({state:'visible'});
    if(scene(page.url())!=='join')throw Error('route changed');
    return {status:'JOIN_ENTRY_OBSERVED',phase,scene:'join',native:false};
  } catch {
    const error=new Error('GUEST_ENTRY_FAILED:'+phase);
    error.receipt={status:'GUEST_ENTRY_FAILED',phase,scene:scene(page.url()),native:false};
    throw error;
  }
}
