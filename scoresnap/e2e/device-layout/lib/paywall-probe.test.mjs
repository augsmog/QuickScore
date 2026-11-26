import { strict as a } from 'node:assert';
import { test } from 'node:test';
import { evaluateRenderedPair } from '../run-paywall-probe.mjs';
const labels = ['Free','Tournament Director','$79.99/year'];
function fixture(){
 const sourceSha='a'.repeat(40),apkSha256='b'.repeat(64), x='c'.repeat(64), y='d'.repeat(64), z='e'.repeat(64);
 const results=[{s:x,cta:x,scale:1},{s:y,cta:z,scale:1.3}].map(({s,cta,scale})=>({
  sourceSha,apkSha256,fontScale:scale,screenshotSha256:s,geometryPassed:true,captureReady:true,
  measured:labels.map(label=>({label,screenshotSha256:label==='$79.99/year'?cta:s})),ctaScreenshots:[cta],
 }));
 const scales=results.map(p=>({fontScale:p.fontScale,screenshotSha256:p.screenshotSha256,
  method:'inspected-captured-pixels',rendered:{free:'Free',paidTier:'Tournament Director',yearlyPrice:'$79.99/year'},
  noClippedGlyphs:true,noEllipses:true,noOverlap:true,labelScreenshots:Object.fromEntries(p.measured.map(x=>[x.label,x.screenshotSha256])),
  ctaVisibleInReviewedFrame:'Currently unavailable',ctaScreenshotSha256:p.ctaScreenshots[0],
 }));
 return [...results,{schema:'snapscore-android-paywall-rendered-text/v1',sourceSha,apkSha256,
  independentReviewRef:'TEST-FIXTURE',scales}];
}
test('exact two-scale visual review passes only scoped contract',()=>{
 a.deepEqual(evaluateRenderedPair(...fixture()),{scopedVerdict:true,fullLayoutGate:false,releaseVerdict:false});
});
for(const [name,change] of [
 ['baseline truncation despite geometry pass',([,,r])=>r.scales[0].rendered.free='Fre'],
 ['yearly price ellipsis',([,,r])=>r.scales[0].rendered.yearlyPrice='$79.99/y...'],
 ['AX not pixels',([,,r])=>r.scales[0].method='accessibility-tree-only'],
 ['large text missing CTA capture',([,large])=>large.captureReady=false],
 ['CTA image not the measured scroll frame',([,,r])=>r.scales[1].ctaScreenshotSha256=r.scales[1].screenshotSha256],
 ['another build or visual identity',([,,r])=>r.apkSha256='0'.repeat(64)],
 ['labels on wrong source screenshot',([,,r])=>r.scales[1].labelScreenshots['$79.99/year']=r.scales[1].screenshotSha256],
 ['absent independent review',f=>f[2]=null],
])test(name,()=>{const f=fixture();change(f);a.throws(()=>evaluateRenderedPair(...f));});
