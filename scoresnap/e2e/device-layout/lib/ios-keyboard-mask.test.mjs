import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indexTree, ruleClipping, ruleTapTargets} from './geometry-rules.mjs';
// Redacted rectangles from run 46008363328, source 1947438, 16 Pro name entry.
// Archive digest sha256:309f351844034e441f1b4db2d37bc8d6356d53d31fe9697738f8a9c070fd0312.
const box=(left,top,right,bottom)=>({left,top,right,bottom});
const clip=box(0,204,402,541);
const frame={id:'contest-scroll',role:'container',bbox:clip,meta:{scrollClip:true}};
const ctx={platform:'ios',viewport:{width:402,height:874},
  safeArea:{top:59,bottom:291,left:0,right:0},measuredKeyboardInset:291,
  footer:box(0,762,402,874)};
const known=[
  ['player-handicap-Ava',box(59,549,119,593)],
  ['n53',box(79,627,369,671)],
  ['player-handicap-',box(59,679,119,723)],
  ['add-group',box(338,808,382,852)],
];
const control=(id,bbox)=>({id,role:'control',text:id,bbox,hitRegion:{...bbox},
  meta:{scrollViewport:{...clip},clippedOut:true,tappable:true}});
const above=(fs)=>fs.some(f=>/scroll ancestors/.test(f.reason));
const keyboard=(fs)=>fs.some(f=>/bottom>583/.test(f.reason));
test('G3: four retained frames are masked before the keyboard and still fail scroll reachability',()=>{
  for(const [id,bbox] of known){
    const t=indexTree([frame,control(id,bbox)]);
    const findings=ruleClipping(t,ctx);
    assert.equal(keyboard(findings),false,id);
    assert.ok(above(findings),id);
    assert.ok(ruleTapTargets(t,ctx).some(x=>x.rule===5),id);
  }
});
for(const [label,mutate] of Object.entries({
  'actual painted keyboard incursion':(n,f)=>{f.bbox.bottom=595;n.meta.scrollViewport.bottom=595;n.bbox=box(338,560,382,604);n.hitRegion=n.bbox;},
  'no keyboard measurement':(n,f,c)=>{c.measuredKeyboardInset=0;},
  'mismatched viewport':n=>{n.meta.scrollViewport.bottom=540;},
  'unverified viewport':(n,f)=>{f.meta.scrollClip=false;},
  'horizontal collision':n=>{n.bbox.left=-1;},
  'other platform':(n,f,c)=>{c.platform='android';},
  'protruding hit frame':n=>{n.hitRegion.top=500;},
  'invalid keyboard inset':(n,f,c)=>{c.measuredKeyboardInset=Infinity;},
})) test('G3 still fails with '+label,()=>{
  const [n,f,c]=structuredClone([control(...known.at(-1)),frame,ctx]);
  mutate(n,f,c);
  const result=ruleClipping(indexTree([f,n]),c);
  assert.ok(above(result));
  assert.ok(keyboard(result));
});
