// Deterministic navigation controls, not a rendered app or backend substitute.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enterFreshGuestJoin,scene} from './guest-entry.mjs';
function page({initial='/',settled='/onboarding',fail,skipTarget='/auth/sign-in',joinTarget='/join/enter'}={}) {
  let path=initial;const calls=[];
  const locator=name=>({
    async click(){calls.push('click:'+name);if(fail===name)throw Error('private data');if(name==='Skip')path=skipTarget;else if(name==='Join with code')path=joinTarget;else throw Error('unexpected click');},
    async waitFor(){calls.push('visible:'+name);if(fail===name)throw Error('private data');}
  });
  return {calls,url:()=>`http://127.0.0.1:8089${path}`,
    async waitForURL(predicate){calls.push('route');if(path==='/'&&settled)path=settled;if(!predicate(new URL(`http://127.0.0.1:8089${path}`)))throw Error('route timeout');},
    getByText:locator,getByLabel:locator,getByPlaceholder:locator};
}
test('both anonymous modes use fresh onboarding then visible Sign In Join',async()=>{
  for(const mode of ['true','false']) {
    const p=page();const r=await enterFreshGuestJoin(p);assert.equal(r.status,'JOIN_ENTRY_OBSERVED');
    assert.deepEqual(p.calls.filter(c=>c.startsWith('click:')),['click:Skip','click:Join with code']);
    assert.equal(r.scene,'join');assert.equal(r.native,false);
  }
});
test('already completed onboarding uses observed Sign In without Skip',async()=>{
  const p=page({initial:'/auth/sign-in'});await enterFreshGuestJoin(p);
  assert.deepEqual(p.calls.filter(c=>c.startsWith('click:')),['click:Join with code']);
});
test('permanent/transient Home cannot become an unauthenticated fallback',async()=>{
  const p=page({settled:null});await assert.rejects(enterFreshGuestJoin(p),e=>e.receipt.phase==='entry-route');
  assert.equal(p.calls.filter(c=>c.startsWith('click:')).length,0);
});
test('wrong post-Skip and post-Join routes fail closed',async()=>{
  for(const options of [{skipTarget:'/'},{joinTarget:'/auth/sign-in'},{initial:'/join/enter'}])await assert.rejects(enterFreshGuestJoin(page(options)),/GUEST_ENTRY_FAILED/);
});
test('missing actual scene controls reject with bounded phases and no tool text',async()=>{
  for(const [fail,phase] of [['Skip','onboarding-skip'],['Email address','sign-in-scene'],['Join with code','sign-in-join'],['Join code','join-scene'],['Display name','join-scene'],['Find contest','join-scene']]) {
    await assert.rejects(enterFreshGuestJoin(page({fail})),e=>{assert.equal(e.receipt.phase,phase);assert(!JSON.stringify(e.receipt).includes('private'));return true;});
  }
});
test('diagnostics never expose URL data or foreign origin',()=>{
  assert.equal(scene('https://example.test/auth/sign-in?token=private'),'other');
  assert.equal(scene('http://127.0.0.1:8089/auth/sign-in?token=private'),'sign-in');
  assert.equal(scene('not a URL'),'other');
});
