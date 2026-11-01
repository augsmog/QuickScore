import {inflateSync} from 'node:zlib';

// Chromium screenshot PNGs: non-interlaced 8-bit RGB/RGBA. Reject unsupported
// inputs rather than treating a decode failure or mismatched crops as evidence.
export function decodePng(png) {
  if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('invalid screenshot PNG');
  let width=0,height=0,depth=0,type=0,interlace=0;const chunks=[];
  for(let i=8;i+12<=png.length;) {
    const size=png.readUInt32BE(i),name=png.toString('ascii',i+4,i+8);
    if(i+size+12>png.length)throw Error('truncated screenshot PNG');
    const data=png.subarray(i+8,i+8+size);i+=size+12;
    if(name==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];type=data[9];interlace=data[12];}
    else if(name==='IDAT')chunks.push(data);
    else if(name==='IEND')break;
  }
  const channels=type===2?3:type===6?4:0;
  if(!width||!height||depth!==8||!channels||interlace!==0)throw Error('unsupported screenshot PNG');
  const stride=width*channels,raw=inflateSync(Buffer.concat(chunks)),decoded=Buffer.alloc(stride*height);
  if(raw.length!==(stride+1)*height)throw Error('invalid screenshot PNG rows');
  let src=0;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++) {
    const filter=raw[src++],row=y*stride;
    if(filter>4)throw Error('invalid screenshot PNG filter');
    for(let x=0;x<stride;x++) {
      const value=raw[src++],left=x>=channels?decoded[row+x-channels]:0,up=y?decoded[row-stride+x]:0,upperLeft=y&&x>=channels?decoded[row-stride+x-channels]:0;
      const predictor=filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,upperLeft):0;
      decoded[row+x]=(value+predictor)&255;
    }
  }
  return {width,height,channels,data:decoded};
}
export function textureStats(pixels) {
  const {data,channels}=pixels,hist=new Uint32Array(8);let sum=0,sum2=0,n=0,min=255,max=0;
  for(let i=0;i<data.length;i+=channels){const l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];hist[Math.min(7,Math.floor(l/32))]++;sum+=l;sum2+=l*l;n++;min=Math.min(min,l);max=Math.max(max,l);}
  return {stddev:Math.sqrt(Math.max(0,sum2/n-(sum/n)**2)),min,max,clusters:hist.filter(Boolean).length};
}
function scanDelta(a,b,region={x:0,y:0,width:a.width,height:a.height}) {
  if(a.width!==b.width||a.height!==b.height)throw Error('screenshot dimensions changed');
  let changed=0,significant=0,total=0,minY=Infinity,maxY=-Infinity;
  for(let y=Math.max(0,Math.floor(region.y));y<Math.min(a.height,Math.ceil(region.y+region.height));y++) {
    for(let x=Math.max(0,Math.floor(region.x));x<Math.min(a.width,Math.ceil(region.x+region.width));x++) {
      const i=(y*a.width+x)*a.channels,j=(y*b.width+x)*b.channels;
      const delta=Math.max(...[0,1,2].map(c=>Math.abs(a.data[i+c]-b.data[j+c])));
      changed+=delta>0;significant+=delta>=24;total++;
      if(delta>=24){minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    }
  }
  return {changed,significant,total,inkHeight:significant?maxY-minY+1:0};
}
export function pixelDelta(a,b,region) {
  const {changed,significant,total}=scanDelta(a,b,region);
  return {changed,significant,total};
}
export function glyphPaintStats(a,b,region) {
  const {significant,inkHeight}=scanDelta(a,b,region);
  // A two-pixel slit through every letter is not a visible label. This bounded
  // conservative guard complements provenance; it is not OCR. Current core
  // labels contain letters and a slash, not short standalone punctuation.
  const requiredInkHeight=Math.max(2,Math.ceil(region.height*.25));
  return {significant,inkHeight,requiredInkHeight,passed:significant>=2&&inkHeight>=requiredInkHeight};
}

// This proves that the matched text itself contributes pixels, not merely that
// its rectangle has texture. A text-only display:contents wrapper preserves
// the original node, ancestor color/currentColor, backgrounds and pseudo boxes.
// Compare the normal/wrapped/restored pixels and all Range rects exactly: style
// selectors, movement, late fonts and animated paint must fail closed, not count
// as glyphs. No OCR/readability claim is made from this differential alone.
export async function proveGlyphPaint(locator,{path,start,end,clip,onCapture}) {
  const page=locator.page();
  const node=await locator.evaluateHandle((el,path)=>path.reduce((n,i)=>n.childNodes[i],el),path);
  let probe;
  const layout=()=>locator.evaluate((el,{node:n,start,end})=>{
    if(!n?.isConnected||n.nodeType!==Node.TEXT_NODE)throw Error('matched text node changed');
    const rects=(from,to)=>{const r=document.createRange();r.setStart(n,from);r.setEnd(n,to);return [...r.getClientRects()].map(({x,y,width,height})=>({x,y,width,height}));};
    const characters=[];
    for(const {segment,index} of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(n.textContent.slice(start,end))) {
      if(!/\s/u.test(segment))characters.push(rects(start+index,start+index+segment.length));
    }
    const {x,y,width,height}=el.getBoundingClientRect();
    return {text:n.textContent,target:{x,y,width,height},rects:rects(start,end),characters};
  },{node,start,end});
  const capture=async stage=>{
    const png=await page.screenshot({clip,animations:'disabled',caret:'hide',scale:'css'});
    if(onCapture)await onCapture(stage,png);
    return decodePng(png);
  };
  const fail=reason=>({passed:false,reason});
  try {
    const originalLayout=await layout(),normal=await capture('normal');
    probe=await node.evaluateHandle(n=>{
      const wrapper=document.createElement('span');
      wrapper.style.setProperty('all','unset','important');
      wrapper.style.setProperty('display','contents','important');
      n.replaceWith(wrapper);wrapper.append(n);
      return {wrapper,node:n};
    });
    const pseudoFree=await probe.evaluate(({wrapper})=>['::before','::after'].every(p=>['none','normal'].includes(getComputedStyle(wrapper,p).content)));
    const sameLayout=async()=>JSON.stringify(await layout())===JSON.stringify(originalLayout);
    if(!pseudoFree||!await sameLayout())return fail('probe changed text layout');
    const visible=await capture('wrapped-visible');
    if(pixelDelta(normal,visible).changed)return fail('probe changed visible paint');
    await probe.evaluate(({wrapper})=>{
      wrapper.style.setProperty('-webkit-text-fill-color','transparent','important');
      wrapper.style.setProperty('-webkit-text-stroke-color','transparent','important');
      wrapper.style.setProperty('text-shadow','none','important');
    });
    const hidden=await capture('glyphs-suppressed');
    if(!await sameLayout())return fail('suppression changed text layout');
    await probe.evaluate(({wrapper,node})=>wrapper.replaceWith(node));
    const restored=await capture('restored');
    if(!await sameLayout()||pixelDelta(normal,restored).changed)return fail('text paint was unstable or not restored');
    const texture=textureStats(normal),delta=pixelDelta(normal,hidden);
    if(texture.clusters<2||texture.max-texture.min<24||texture.stddev<6)return fail('insufficient label contrast');
    if(delta.significant<Math.max(4,Math.ceil(delta.total*.01)))return fail('no significant glyph paint');
    // One exposed letter must not stand in for an otherwise covered label.
    // Per-character rectangles are only a spatial paint proof, not recognition.
    const characters=originalLayout.characters.map(rects=>rects.map(r=>glyphPaintStats(normal,hidden,{x:r.x-clip.x,y:r.y-clip.y,width:r.width,height:r.height})));
    if(!characters.length||characters.some(rects=>!rects.length||rects.some(r=>!r.passed)))return {...fail('a label character has insufficient glyph coverage'),characters};
    return {passed:true,reason:'glyph paint changed',delta,characters};
  } finally {
    if(probe) {
      try {await probe.evaluate(({wrapper,node})=>{if(wrapper.isConnected)wrapper.replaceWith(node);});}
      finally {await probe.dispose();}
    }
    await node.dispose();
  }
}
