/** Offline browser scoring tests use the same persisted subscription cache as a paid device.
 * No production test switch or purchase bypass is shipped. Free join/guest tests do not use this fixture.
 * Real StoreKit purchases/eligibility are verified separately in sandbox.
 */
export async function seedPaidTier(pageOrContext, tier) {
  if (!['pro','td'].includes(tier)) throw Error('Expected paid fixture tier');
  await pageOrContext.addInitScript(tier => {
    localStorage.setItem('snapscore-scans', JSON.stringify({version:1,state:{tier,isPro:true,isTD:tier==='td',scanMonth:'',scansUsed:0}}));
  }, tier);
}
