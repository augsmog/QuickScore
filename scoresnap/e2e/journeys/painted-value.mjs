import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {proveGlyphPaint} from './glyph-evidence.mjs';
import {validateTextFragments,validateTextRunGeometry} from './text-fragments.mjs';
export async function paintedText(locator,expected) {
 locator=locator.filter({visible:true});await locator.waitFor({state:'visible'});
 assert.equal(await locator.count(),1,'Unique visible value required');
 const target=await locator.elementHandle();assert(target,'Value element missing');
 try {
  await locator.page().evaluate(()=>document.fonts.ready.then(()=>undefined));
  const before=await target.evaluate(el=>({html:el.outerHTML,rendered:el.innerText}));
  const runs=await target.evaluate(el=>{
   if(!el.isConnected)throw Error('Value element detached');
   const nodes=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);while(walker.nextNode())nodes.push(walker.currentNode);
   return nodes.map(n=>{
    const text=n.textContent,nodePath=[];for(let a=n;a!==el;a=a.parentNode)nodePath.unshift([...a.parentNode.childNodes].indexOf(a));
    if(!text.length)return {text,path:nodePath,rects:[]};
    const range=document.createRange();range.selectNodeContents(n);const rect=range.getBoundingClientRect();const rects=[...range.getClientRects()].map(({x,y,width,height})=>({x,y,width,height}));
    if(rect.width<=0||rect.height<=0||rect.x<0||rect.y<0||rect.right>innerWidth||rect.bottom>innerHeight)throw Error('Value fragment outside viewport');
    for(let a=n.parentElement;a;a=a.parentElement){const s=getComputedStyle(a);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)<=.1)throw Error('Value fragment not painted');}
    return {text,path:nodePath,rects,start:0,end:text.length,clip:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
   });
  });
  const indices=validateTextFragments(runs.map(r=>r.text),expected,before.rendered);validateTextRunGeometry(runs);
  const folder=path.resolve(process.env.OUT_DIR||'e2e/journey-screens','value-glyphs');fs.mkdirSync(folder,{recursive:true});
  // Different node:test workers may share OUT_DIR; never overwrite originals.
  const dir=fs.mkdtempSync(path.join(folder,'value-'));fs.writeFileSync(path.join(dir,'value.json'),JSON.stringify({expected,fragments:runs.map(r=>r.text)},null,2)+'\n');
  for(const index of indices){
   const proof=await proveGlyphPaint(locator,{...runs[index],targetHandle:target,referenceGlyphs:true,onCapture:(stage,png)=>fs.writeFileSync(path.join(dir,`${index}-${stage}.png`),png)});
   assert(proof.passed,`Unreadable value fragment ${index}: ${proof.reason}`);
  }
  const after=await target.evaluate(el=>({html:el.outerHTML,rendered:el.innerText,connected:el.isConnected}));
  assert(after.connected,'Value element detached');assert.equal(after.html,before.html,'Value DOM changed or probe not restored');assert.equal(after.rendered,before.rendered,'Value text changed');
 } finally {await target.dispose();}
}
