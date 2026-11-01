import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {proveGlyphPaint} from './glyph-evidence.mjs';

// Actual rendered Chromium fixtures; deliberately separate from pixel unit tests.
let browser;
before(async()=>{browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});});
after(async()=>{await browser?.close();});
const stripes='repeating-linear-gradient(90deg, #000 0 2px, #fff 2px 4px)';
async function fixture(t,{css='',text='New Contest',dpr=1}={}) {
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:dpr});
  t.after(()=>context.close());
  await context.route('**/*',route=>route.abort());
  const page=await context.newPage();
  await page.setContent(`<style>body{margin:20px}button{border:0;width:350px;height:64px;background:#175c3a;color:#fff;font:700 18px Arial}#label{position:relative;display:inline-block}${css}</style><button id="control" aria-label="${text}"><span id="label">${text}</span></button>`);
  await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
  const locator=page.locator('#control');
  const spec=await locator.evaluate(el=>{
    const n=el.querySelector('#label').firstChild,range=document.createRange();range.selectNodeContents(n);
    const {x,y,width,height}=range.getBoundingClientRect(),path=[];
    for(let a=n;a!==el;a=a.parentNode)path.unshift([...a.parentNode.childNodes].indexOf(a));
    return {path,start:0,end:n.textContent.length,clip:{x,y,width,height}};
  });
  await locator.focus();
  const before=await locator.evaluate(el=>({html:el.outerHTML,active:document.activeElement.id,x:scrollX,y:scrollY,name:el.getAttribute('aria-label')}));
  const assertRestored=async()=>assert.deepEqual(await locator.evaluate(el=>({html:el.outerHTML,active:document.activeElement.id,x:scrollX,y:scrollY,name:el.getAttribute('aria-label')})),before);
  return {page,locator,spec,assertRestored};
}
for(const [name,options] of [
  ['plain',{}],
  ['patterned background',{css:`#control{background:${stripes}}#label{color:#f00}`}],
  ['inherited font and shadow',{css:'#control{font:italic 700 19px Georgia;letter-spacing:.25px;text-shadow:1px 1px #000}'}],
  ['multiline',{css:'#label{max-width:80px;white-space:normal}'}],
  ['DPR 2',{dpr:2}],
  ['combining accent',{text:'New Cafe\u0301'}],
  ...['PAR','SETTLEMENT','LEADERBOARD','Copy / share local invite','Join with code'].map(text=>[text,{text}]),
])test(`visible glyphs pass: ${name}`,async t=>{
  const f=await fixture(t,options),proof=await proveGlyphPaint(f.locator,f.spec);
  assert.equal(proof.passed,true,JSON.stringify(proof));await f.assertRestored();
});
for(const [name,css] of [
  ['flat pseudo cover','#label::after{content:"";position:absolute;inset:0;background:#175c3a;pointer-events:none}'],
  ['striped pseudo cover',`#label::after{content:"";position:absolute;inset:0;background:${stripes};pointer-events:none}`],
  ['currentColor pseudo cover','#label::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,currentColor 0 2px,#000 2px 4px);pointer-events:none}'],
  ['partial patterned cover',`#label::after{content:"";position:absolute;inset:0 0 0 20%;background:${stripes};pointer-events:none}`],
  ['two-pixel patterned sliver',`#label::after{content:"";position:absolute;inset:0;background:${stripes};pointer-events:none;clip-path:polygon(0 0,100% 0,100% 9px,0 9px,0 11px,100% 11px,100% 100%,0 100%)}`],
  ['transparent glyphs on texture',`#label{background:${stripes};-webkit-text-fill-color:transparent}`],
  ['CSS selectors perturb probe','#label:has(>span){transform:translateX(2px)}'],
])test(`non-glyph texture fails: ${name}`,async t=>{
  const f=await fixture(t,{css}),proof=await proveGlyphPaint(f.locator,f.spec);
  assert.equal(proof.passed,false,JSON.stringify(proof));await f.assertRestored();
});
test('striped sibling cover leaves exact name intact but fails glyph proof',async t=>{
  const f=await fixture(t);
  await f.page.locator('#label').evaluate((el,stripes)=>{const cover=document.createElement('span');cover.setAttribute('aria-hidden','true');Object.assign(cover.style,{position:'absolute',inset:'0',background:stripes,pointerEvents:'none'});el.append(cover);},stripes);
  assert.equal(await f.page.getByRole('button',{name:'New Contest',exact:true}).count(),1);
  assert.equal((await proveGlyphPaint(f.locator,f.spec)).passed,false);
});
test('a fresh screenshot failure rejects and restores original node, styles, focus and scroll',async t=>{
  const f=await fixture(t),take=f.page.screenshot.bind(f.page);let calls=0;
  const originalNode=await f.page.locator('#label').evaluateHandle(el=>el.firstChild);
  f.page.screenshot=async options=>{if(++calls===3)throw Error('injected capture failure');return take(options);};
  await assert.rejects(proveGlyphPaint(f.locator,f.spec),/injected capture failure/);
  await f.assertRestored();
  assert.equal(await f.page.locator('#label').evaluate((el,node)=>el.firstChild===node,originalNode),true);
  await originalNode.dispose();
});
