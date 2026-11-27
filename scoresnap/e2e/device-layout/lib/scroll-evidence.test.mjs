import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeMaestroHierarchy as normalize} from './normalize-maestro.mjs';
import {indexTree,ruleTapTargets,ruleClipping,finiteRect} from './geometry-rules.mjs';
const raw=(box,children=[],extra={})=>({attributes:{bounds:`[${box[0]},${box[1]}][${box[2]},${box[3]}]`,...extra},children});
function evaluate(platform,box,meta={},ctx={}){
 const nodes=normalize(raw([0,0,200,200],[raw(box,[],{'resource-id':'button',clickable:true})],{scrollable:true}),{resourceMeta:{button:{meta}}});
 const tree=indexTree(nodes);
 return {nodes,tap:ruleTapTargets(tree,{platform,...ctx}),clip:ruleClipping(tree,{platform,...ctx})};
}
for(const [platform,min] of [['ios',44],['android',48]]) {
 for(const [edge,box] of Object.entries({left:[0,60,20,120],right:[180,60,200,120],top:[60,0,120,20],bottom:[60,180,120,200]})) {
  test(`${platform}: flush ${edge} undersize cannot be waived by clip flags`,()=>{
   const r=evaluate(platform,box,{clipTop:true,clipBottom:true,clipLeft:true,clipRight:true,clippedOut:true});
   assert.ok(r.tap.some(f=>f.rule===5));assert.equal(r.clip.length,0);
  });
 }
 // Cut off sideways (or wholly out sideways): never "further down the list". Always a finding.
 for(const box of [[-30,60,30,120],[170,60,230,120],[210,210,270,270]]){
  test(`${platform}: raw adequate but clipped/concealed sideways ${box}`,()=>{
   const r=evaluate(platform,box);assert.ok(r.tap.length);assert.ok(r.clip.length);
  });
 }
 // AUG-1601. Scrolled off the TOP, or further DOWN the list, at an ordinary checkpoint: reachable by
 // scrolling, so not a finding. Run 46008363328 reported 70 of these on one wizard, on every
 // checkpoint, because any screen that scrolls always has some control outside its scroll area.
 for(const [name,box] of Object.entries({'cut at the top':[60,-30,120,30],'wholly above':[60,-90,120,-30],'cut at the bottom':[60,170,120,230],'wholly below':[60,230,120,290]})){
  test(`${platform}: ${name} at an ordinary checkpoint is not a finding`,()=>{
   const r=evaluate(platform,box);assert.equal(r.clip.length,0);assert.equal(r.tap.length,0);
  });
 }
 // ...but the three cases the rule exists for still fail.
 test(`${platform}: at a scroll-to-end checkpoint, cut at the bottom or still below is a finding`,()=>{
  for(const box of [[60,170,120,230],[60,230,120,290]]){
   const r=evaluate(platform,box,{},{scrollEnd:true});
   assert.ok(r.clip.some(f=>f.reason.includes('cannot be scrolled clear')),String(box));
  }
  assert.ok(evaluate(platform,[60,170,120,230],{},{scrollEnd:true}).tap.length,'a target cut at the end is not an operable target');
  // Scrolled off the top at the end is expected: that is what scrolling to the end does.
  assert.equal(evaluate(platform,[60,-30,120,30],{},{scrollEnd:true}).clip.length,0);
 });
 test(`${platform}: a REQUIRED control cut at the bottom while partly showing is a finding at any checkpoint`,()=>{
  assert.ok(evaluate(platform,[60,170,120,230],{required:true}).clip.length);
  // Wholly below, it is simply further down the list, required or not.
  assert.equal(evaluate(platform,[60,230,120,290],{required:true}).clip.length,0);
 });
 test(`${platform}: node meta cannot claim or deny scroll-to-end, and cannot move the scroll area`,()=>{
  assert.equal(evaluate(platform,[60,170,120,230],{scrollEnd:true}).clip.length,0,'meta.scrollEnd is not ctx.scrollEnd');
  assert.ok(evaluate(platform,[60,170,120,230],{scrollEnd:false,clippedOut:true,clipRect:{left:60,top:170,right:120,bottom:200}},{scrollEnd:true}).clip.length);
 });
 test(`${platform}: exact minimum and full painting passes; below limit fails both axes`,()=>{
  assert.equal(evaluate(platform,[0,0,min,min]).tap.length,0);
  assert.ok(evaluate(platform,[0,0,min-1,min]).tap.length);
  assert.ok(evaluate(platform,[0,0,min,min-1]).tap.length);
 });
 test(`${platform}: scroll-end claim does not waive clipped required geometry`,()=>{
  assert.ok(evaluate(platform,[60,170,120,230],{required:true,reachable:true}).clip.length);
 });
}
test('nested viewports intersect and cannot be replaced with caller metadata',()=>{
 const n=normalize(raw([0,0,100,100],[raw([-10,-10,200,200],[raw([90,90,150,150],[],{'resource-id':'button'})],{scrollable:true})],{scrollable:true}),{resourceMeta:{button:{meta:{scrollViewport:{left:0,top:0,right:999,bottom:999}}}}});
 assert.deepEqual(n.at(-1).meta.scrollViewport,{left:0,top:0,right:100,bottom:100});
 assert.ok(ruleClipping(indexTree(n),{}).length);
});
test('invalid density and invalid scroll bounds fail closed',()=>{
 for(const density of [0,-1,NaN,Infinity]) assert.throws(()=>normalize(raw([0,0,10,10]),{density}));
 assert.throws(()=>normalize(raw([0,0,0,0],[],{scrollable:true})));
});
for(const [name,density] of [['ios-16pro-name-entry',1],['android-compact-name-entry',3]]){
 test(`${name}: normalized historical real shape preserves measured frames; malformed wrappers are not native proof`,()=>{
  const capture=JSON.parse(readFileSync(new URL(`./fixtures/native-shape/${name}.json`,import.meta.url)));
  const nodes=normalize(capture,{density});
  assert.ok(nodes.some(n=>finiteRect(n.bbox)));
  assert.ok(nodes.every(n=>finiteRect(n.bbox)), 'unmeasured structural wrappers never become proof nodes');
  const measured=new Set();
  function visit(n) {
   const raw=String(n.attributes?.bounds||'');
   const m=raw.match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/);
   if(m) {
    const r=m.slice(1).map(x=>Number(x)/density);
    if(r[0]<r[2]&&r[1]<r[3]) measured.add(r.join(','));
   }
   for(const child of n.children||[]) visit(child);
  }
  visit(capture);
  for(const n of nodes) assert.ok(measured.has([n.bbox.left,n.bbox.top,n.bbox.right,n.bbox.bottom].join(',')),
    'each emitted rectangle must have raw measured provenance');
  for(const n of nodes.filter(n=>finiteRect(n.bbox))) {
   const findings=ruleTapTargets(indexTree([{...n,role:'control'}]),{platform:density===1?'ios':'android'});
   const min=density===1?44:48;
   if(n.bbox.right-n.bbox.left<min-.5||n.bbox.bottom-n.bbox.top<min-.5) assert.ok(findings.length);
  }
 });
}
