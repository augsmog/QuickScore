import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyAndroidWizardReveal as check } from './android-wizard-reveal.mjs';
const target = 'wizard-contest-name';
const vp = {top: 120, bottom: 650, left: 0, right: 360};
const geom = (top, bottom, left = 20, right = 340) => ({top,bottom,left,right});
function press(id, top, bottom, required = true) {
  const bbox = geom(top,bottom);
  return {id, bbox, hitRegion: {...bbox}, enabled: true, role: 'control',
    text: id, meta: {resourceId: id, scrollViewport: {...vp}, required}};
}
const raw = (color, width = 1080, height = 2400) => {
  const b = Buffer.alloc(33, color);
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(b);
  b.writeUInt32BE(width,16); b.writeUInt32BE(height,20);
  return b;
};
const sha = b => createHash('sha256').update(b).digest('hex');
function fixture(side = 'top') {
  const initial = raw(1), revealed = raw(2), shift = side === 'top' ? 40 : -36;
  const bundle = (png, nodes) => ({schema:'device-layout/v1',platform:'android',profile:'android-compact',
    sourceSha:'a'.repeat(40),buildHash:'b'.repeat(64),configSha256:'c'.repeat(64),fontScale:1,
    checkpoints:[{flow:'new-contest',checkpoint:'multi day on',screen:'new-contest',state:'default',
      deviceId:'android-compact',platform:'android',screenshot:'scene.png',screenshotSha256:sha(png),
      context:{viewport:{width:360,height:800},safeArea:{left:0,right:0,top:45,bottom:48},
        footer:geom(650,720,0,360),fontScale:1},nodes}]});
  const before = bundle(initial, [press(target,...(side==='top'?[120,142.3333]:[620,650]),false),
    press('wizard-course',245,297),press('tournament-toggle-slot',375,423)]);
  const nextTarget = side==='top' ? [130.3333,182.3333] : [584,636];
  const reveal = bundle(revealed, [press(target,...nextTarget,false),
    press('wizard-course',245+shift,297+shift),press('tournament-toggle-slot',375+shift,423+shift)]);
  return {before,reveal,checkpoint:'multi day on',targetId:target,witnessIds:['wizard-course','tournament-toggle-slot'],
    readBeforePng:()=>initial,readRevealPng:()=>revealed};
}
const cp = (f,k='reveal') => f[k].checkpoints[0];
test('A3 native 22.33dp sliver reveals the same optional 52dp target',()=>{
  const x=check(fixture()); assert.equal(x.required,false);
  assert.equal(x.targetId,target);
  assert.equal(Number(x.beforeHeightDp.toFixed(2)),22.33);
  assert.equal(x.revealedHeightDp,52); assert.equal(x.measuredScrollDp,40);
});
test('A2 bottom sliver requires independent negative scroll and genuine height',()=>{
  const x=check(fixture('bottom')); assert.equal(x.revealedHeightDp,52); assert.equal(x.measuredScrollDp,-36);
});
test('A2 4dp top edge can reveal a full 48dp exact native player control',()=>{
  const f=fixture();
  f.targetId='wizard-player-handicap-2';
  cp(f,'before').nodes[0]=press(f.targetId,120,124);
  cp(f).nodes[0]=press(f.targetId,116,164); // full-sized, but still clipped
  assert.throws(()=>check(f),/full measured/);
  cp(f).nodes[0]=press(f.targetId,126,174);
  for (const n of cp(f).nodes.slice(1)) {
    n.bbox.top+=10; n.bbox.bottom+=10; n.hitRegion.top+=10; n.hitRegion.bottom+=10;
  }
  const x=check(f); assert.equal(x.beforeHeightDp,4); assert.equal(x.revealedHeightDp,48);
});
for (const [name, mutate, expected] of [
  ['unknown historical ordinal',f=>f.targetId='n17',/stable ID/],
  ['blank-player duplicate',f=>cp(f).nodes.push({...cp(f).nodes[0]}),/ambiguous/],
  ['missing requested target',f=>cp(f).nodes.shift(),/ambiguous/],
  ['synthetic 48dp hit but small native frame',f=>{cp(f).nodes[0].bbox.bottom=177},/full measured/],
  ['actual 47.99dp target',f=>{cp(f).nodes[0].hitRegion.bottom=cp(f).nodes[0].hitRegion.top+47.99},/full measured/],
  ['behind sticky footer',f=>{cp(f).nodes[0].bbox=geom(614,666); cp(f).nodes[0].hitRegion=geom(614,666)},/full measured/],
  ['different source',f=>f.reveal.sourceSha='d'.repeat(40),/different candidate/],
  ['different build',f=>f.reveal.buildHash='d'.repeat(64),/different candidate/],
  ['changed candidate config',f=>f.reveal.configSha256='d'.repeat(64),/different candidate/],
  ['tampered PNG',f=>f.readRevealPng=()=>raw(8),/PNG hash/],
  ['same PNG recycled',f=>{f.readRevealPng=f.readBeforePng; cp(f).screenshotSha256=cp(f,'before').screenshotSha256},/same frame/],
  ['font scale drift',f=>cp(f).context.fontScale=1.3,/font scale changed/],
  ['keyboard or footer change',f=>cp(f).context.footer.top-=50,/font scale changed/],
  ['optional input promoted to required',f=>cp(f).nodes[0].meta.required=true,/target state/],
  ['changed tournament state',f=>cp(f).nodes[2].checked=true,/witness state/],
  ['same coordinates copied',f=>{for(const n of cp(f).nodes.slice(1)){n.bbox.top-=40;n.bbox.bottom-=40;n.hitRegion.top-=40;n.hitRegion.bottom-=40}},/displacement/],
  ['only one anchor',f=>f.witnessIds.pop(),/two distinct/],
  ['duplicate anchors',f=>f.witnessIds[0]=f.witnessIds[1],/two distinct/],
  ['target masquerades as a different full control',f=>{cp(f).nodes[0].bbox=geom(150,202);cp(f).nodes[0].hitRegion=geom(150,202)},/displacement/],
]) test('refuses '+name,()=>{ const f=fixture(); mutate(f); assert.throws(()=>check(f), expected); });
