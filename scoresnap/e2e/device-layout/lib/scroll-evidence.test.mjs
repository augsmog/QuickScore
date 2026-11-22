import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeMaestroHierarchy as normalize} from './normalize-maestro.mjs';
import {indexTree,ruleTapTargets,ruleClipping,finiteRect} from './geometry-rules.mjs';
const raw=(box,children=[],extra={})=>({attributes:{bounds:`[${box[0]},${box[1]}][${box[2]},${box[3]}]`,...extra},children});
function evaluate(platform,box,meta={}){
 const nodes=normalize(raw([0,0,200,200],[raw(box,[],{'resource-id':'button',clickable:true})],{scrollable:true}),{resourceMeta:{button:{meta}}});
 const tree=indexTree(nodes);
 return {nodes,tap:ruleTapTargets(tree,{platform}),clip:ruleClipping(tree,{platform})};
}
for(const [platform,min] of [['ios',44],['android',48]]) {
 for(const [edge,box] of Object.entries({left:[0,60,20,120],right:[180,60,200,120],top:[60,0,120,20],bottom:[60,180,120,200]})) {
  test(`${platform}: flush ${edge} undersize cannot be waived by clip flags`,()=>{
   const r=evaluate(platform,box,{clipTop:true,clipBottom:true,clipLeft:true,clipRight:true,clippedOut:true});
   assert.ok(r.tap.some(f=>f.rule===5));assert.equal(r.clip.length,0);
  });
 }
 for(const box of [[-30,60,30,120],[170,60,230,120],[60,-30,120,30],[60,170,120,230],[210,210,270,270]]){
  test(`${platform}: raw adequate but clipped/concealed ${box}`,()=>{
   const r=evaluate(platform,box);assert.ok(r.tap.length);assert.ok(r.clip.length);
  });
 }
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
  assert.ok(nodes.some(n=>!finiteRect(n.bbox)),'raw structural wrappers remain invalid, not invented measurements');
  for(const n of nodes.filter(n=>finiteRect(n.bbox))) {
   const findings=ruleTapTargets(indexTree([{...n,role:'control'}]),{platform:density===1?'ios':'android'});
   const min=density===1?44:48;
   if(n.bbox.right-n.bbox.left<min-.5||n.bbox.bottom-n.bbox.top<min-.5) assert.ok(findings.length);
  }
 });
}
