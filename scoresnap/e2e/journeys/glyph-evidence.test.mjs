import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {decodePng,pixelDelta,textureStats,glyphPaintStats} from './glyph-evidence.mjs';

// Synthetic pixel/PNG unit tests, not rendered-browser evidence.
const pixels=(values,width=values.length/3)=>({width,height:1,channels:3,data:Buffer.from(values)});
function png({width=1,height=1,type=2,filter=0,rows=Buffer.from([1,2,3])}={}) {
  const chunk=(name,data)=>{const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(name,4);data.copy(out,8);return out;};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=type;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.concat([Buffer.from([filter]),rows]))),chunk('IEND',Buffer.alloc(0))]);
}
test('identical high-contrast texture is not glyph evidence',()=>{
  const striped=pixels([0,0,0,255,255,255,0,0,0,255,255,255]);
  assert.equal(textureStats(striped).clusters,2);
  assert.equal(pixelDelta(striped,striped).significant,0);
});
test('difference counts significant RGB changes, not tiny noise',()=>{
  const a=pixels([0,0,0,0,0,0,0,0,0]),b=pixels([1,0,0,24,0,0,255,255,255]);
  assert.deepEqual(pixelDelta(a,b),{changed:3,significant:2,total:3});
  assert.deepEqual(pixelDelta(a,b,{x:0,y:0,width:1,height:1}),{changed:1,significant:0,total:1});
});
test('dimension mismatch cannot manufacture differential evidence',()=>assert.throws(()=>pixelDelta(pixels([0,0,0]),pixels([0,0,0,0,0,0])),/dimensions changed/));
test('RGB and RGBA screenshot decoding',()=>{
  assert.deepEqual(decodePng(png()).data,Buffer.from([1,2,3]));
  assert.deepEqual(decodePng(png({type:6,rows:Buffer.from([1,2,3,255])})).data,Buffer.from([1,2,3,255]));
});
test('PNG row filters decode consistently',()=>{
  for(const filter of [0,1,2,3,4])assert.deepEqual(decodePng(png({filter})).data,Buffer.from([1,2,3]));
  assert.deepEqual(decodePng(png({width:2,filter:1,rows:Buffer.from([1,2,3,3,3,3])})).data,Buffer.from([1,2,3,4,5,6]));
});
test('corrupt or unsupported screenshots fail closed',()=>{
  assert.throws(()=>decodePng(Buffer.alloc(8)),/invalid screenshot PNG/);
  assert.throws(()=>decodePng(png().subarray(0,35)),/invalid screenshot PNG rows|unexpected end/i);
  assert.throws(()=>decodePng(png({filter:5})),/filter/);
  assert.throws(()=>decodePng(png({type:0})),/unsupported/);
  assert.throws(()=>decodePng(png({rows:Buffer.from([1])})),/rows/);
});

const ink=(height)=>({width:8,height:20,channels:3,data:Buffer.from(Array.from({length:8*20*3},(_,i)=>{const y=Math.floor(i/(8*3));return y>=8&&y<8+height?255:0;}))});
test('two-pixel glyph slivers fail even when every character changes significantly',()=>{
  const a=ink(2),b={...a,data:Buffer.alloc(a.data.length)};
  assert.ok(pixelDelta(a,b).significant>=4);
  assert.deepEqual(glyphPaintStats(a,b,{x:0,y:0,width:8,height:20}),{significant:16,inkHeight:2,requiredInkHeight:5,passed:false});
});
test('meaningful glyph height passes the bounded spatial coverage floor',()=>{
  const a=ink(5),b={...a,data:Buffer.alloc(a.data.length)};
  assert.deepEqual(glyphPaintStats(a,b,{x:0,y:0,width:8,height:20}),{significant:40,inkHeight:5,requiredInkHeight:5,passed:true});
});
