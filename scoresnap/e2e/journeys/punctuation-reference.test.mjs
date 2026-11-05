import {test} from 'node:test';import assert from 'node:assert/strict';
import {glyphPaintStats,glyphReferenceStats} from './glyph-evidence.mjs';
const width=16,height=28,region={x:0,y:0,width,height};
const blank=()=>({width,height,channels:3,data:Buffer.alloc(width*height*3,255)});
const shape=(points,color=[0,0,0])=>{const p=blank();for(const [x,y] of points)for(let c=0;c<3;c++)p.data[(y*width+x)*3+c]=color[c];return p;};
const box=(x,y,w,h)=>Array.from({length:w*h},(_,i)=>[x+i%w,y+Math.floor(i/w)]);
const masks={'.':box(6,22,3,3),',':[...box(6,21,3,3),[7,24],[6,25]],'−':box(3,14,10,2),'-':box(4,14,7,2),':':[...box(6,10,3,3),...box(6,20,3,3)],'$':[...box(7,5,2,20),...box(4,7,7,2),...box(4,13,7,2),...box(4,21,7,2)],'@':[...box(3,6,10,2),...box(3,22,10,2),...box(3,6,2,18),...box(11,6,2,18)],letter:box(4,6,7,18)};
test('preserve independent 3x3 decimal false-negative probe; reference accepts actual dot',()=>{const p=shape(masks['.']);assert.equal(glyphPaintStats(p,blank(),region).passed,false);assert.deepEqual(glyphReferenceStats(p,blank(),p,blank(),region),{expectedInk:9,matchedInk:9,passed:true});});
for(const [symbol,points] of Object.entries(masks))test(`reference requires ${symbol} including every strong punctuation pixel`,()=>{
 const reference=shape(points),normal=shape(points,[23,92,58]);assert(glyphReferenceStats(normal,blank(),reference,blank(),region).passed);
 assert.equal(glyphReferenceStats(blank(),blank(),reference,blank(),region).passed,false,'erased');
 assert.equal(glyphReferenceStats(normal,normal,reference,blank(),region).passed,false,'covered pixels are not text contributions');
 const unique=[...new Map(points.map(p=>[String(p),p])).values()];const clipped=shape(unique.slice(1),[23,92,58]);assert.equal(glyphReferenceStats(clipped,blank(),reference,blank(),region).passed,false,'even one missing strong glyph pixel fails');
});
for(const value of ['$5.00','render@snapscore.test','−$1,234.00','1:23 PM'])test(`complete expected glyph inventory: ${value}`,()=>{for(const symbol of value){if(/\s/u.test(symbol))continue;const points=masks[symbol]||masks.letter,reference=shape(points);assert(glyphReferenceStats(shape(points,[23,92,58]),blank(),reference,blank(),region).passed);}});
test('reference itself must contain ink; original core sliver rule unchanged',()=>{assert.equal(glyphReferenceStats(blank(),blank(),blank(),blank(),region).passed,false);assert.equal(glyphPaintStats(shape(box(1,14,12,2)),blank(),region).passed,false);});
