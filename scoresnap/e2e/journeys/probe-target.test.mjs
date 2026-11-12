import {test} from 'node:test';import assert from 'node:assert/strict';import {deflateSync} from 'node:zlib';import {proveGlyphPaint} from './glyph-evidence.mjs';
function png(ink=true){const w=8,h=20,chunk=(name,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(name,4);data.copy(b,8);return b;},header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;const rows=[];for(let y=0;y<h;y++){rows.push(Buffer.from([0]));rows.push(Buffer.alloc(w*3,ink&&y>=6&&y<14?0:255));}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);}
async function exercise({supplied=false,missingPaint=false,changed=false}={}){
 let lookups=0,captures=0,disposed=false,altered=false;const layout=()=>({text:altered?'missing':'A',target:{x:0,y:0,width:8,height:20},rects:[{x:0,y:0,width:8,height:20}],characters:[[{x:0,y:0,width:8,height:20}]]});
 const probe={evaluate:async fn=>fn.toString().includes("['::before'")?true:undefined,dispose:async()=>{}};
 const node={evaluateHandle:async()=>probe,dispose:async()=>{}};
 const target={evaluateHandle:async()=>node,evaluate:async()=>layout(),dispose:async()=>{disposed=true;}};
 const locator={page:()=>({screenshot:async()=>{captures++;return png(!missingPaint&&captures!==3);}}),elementHandle:async()=>{lookups++;return target;},evaluate:()=>assert.fail('Live text locator re-resolved during probe'),evaluateHandle:()=>assert.fail('Live text locator re-resolved during probe')};
 const proof=await proveGlyphPaint(locator,{path:[0],start:0,end:1,clip:{x:0,y:0,width:8,height:20},...(supplied?{targetHandle:target}:{}),onCapture:stage=>{if(changed&&stage==='normal')altered=true;}});
 return {proof,lookups,disposed};
}
test('actual probe resolves its target once and never re-resolves a text locator',async()=>{const r=await exercise();assert(r.proof.passed);assert.equal(r.lookups,1);assert(r.disposed);});
test('supplied pinned target stays caller-owned',async()=>{const r=await exercise({supplied:true});assert(r.proof.passed);assert.equal(r.lookups,0);assert.equal(r.disposed,false);});
test('pinning does not allow missing paint or changed text to pass',async()=>{assert.equal((await exercise({missingPaint:true})).proof.passed,false);const r=await exercise({changed:true});assert.equal(r.proof.passed,false);assert.equal(r.proof.reason,'probe changed text layout');assert(r.disposed);});
