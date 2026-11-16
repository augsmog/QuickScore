import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {auditCapture} from './capture-layout.mjs';
import {getSafeAreaProfile} from '../safe-area-profiles.mjs';
import fs from 'node:fs';

test('the shared journey screenshot boundary persists and enforces the audit',()=>{
  const runner=fs.readFileSync(new URL('./runner.mjs',import.meta.url),'utf8');
  const step=runner.slice(runner.indexOf('  const step=async name=>'),runner.indexOf('  const check=async'));
  assert(step.indexOf('auditCapture(')<step.indexOf('page.screenshot('));
  assert.match(step,/a\.steps\.push\([^\n]*layout/);
  assert.match(step,/demand\(layout.failures.length===0,'capture-layout'/);
  assert.match(runner,/context.addInitScript\(simulateSafeArea,profile\)/);
});

test('every capture audits safe bands, targets, overlaps and visible text',async t=>{
  const browser=await chromium.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:393,height:852}});
  const button=(x,y,w=44,h=44)=>`<button style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px">Go</button>`;
  const fixtures=[
    ['top-band',button(100,4),'safe-area'],
    ['bottom-band',button(100,800),'safe-area'],
    ['small-target',button(100,100,20,20),'target-size'],
    ['pointer-events-none',`<div style="pointer-events:none">${button(100,100,20,20)}</div>`,'target-size'],
    ['transparent-cover',button(100,100,20,20)+'<div style="position:fixed;inset:0"></div>','target-size'],
    ['covered-title-in-band','<h1 style="position:absolute;top:0;margin:0">Title</h1><div style="position:fixed;inset:0"></div>','safe-area'],
    ['clipped-target',button(-20,100),'target-size'],
    ['three-pixel-overlap',button(100,100)+button(141,100),'control-overlap'],
    ['text-over-control',button(100,100)+'<span style="position:absolute;left:100px;top:100px;pointer-events:none">Outside label</span>','text-over-control'],
    ['title-in-band','<h1 style="position:absolute;top:0;margin:0">Title</h1>','safe-area'],
    ['unsupported-clip',`<div style="clip-path:circle(50%)">${button(100,100)}</div>`,'unsupported-geometry'],
    ['safe-edge',button(100,59)+button(200,774),null],
    ['two-pixel-overlap',button(100,100)+button(142,100),null],
    ['offscreen',button(100,900),null],
    ['hidden',`<div style="opacity:0">${button(100,4)}</div>`,null],
    ['transparent-text','<span style="position:absolute;top:0;color:transparent">Hidden</span>',null],
    ['opacity-product',`<div style="opacity:.2"><div style="opacity:.2">${button(100,4)}</div></div>`,null],
    ['covered-control',button(100,4)+'<div style="position:fixed;inset:0;background:white"></div>',null],
  ];
  for(const [name,html,expected] of fixtures)await t.test(name,async()=>{
    await page.setContent(`<style>body{margin:0}button{padding:0;border:0;font:12px Arial}</style>${html}`);
    const result=await auditCapture(page,{profileName:'iphone-15-pro',profile:getSafeAreaProfile('iphone-15-pro'),journey:'fixture',capture:name,screenshot:`${name}.png`});
    if(expected){
      assert(result.failures.some(f=>f.assertion===expected),JSON.stringify(result));
      const failure=result.failures.find(f=>f.assertion===expected);
      for(const key of ['profile','journey','capture','assertion','geometry','screenshot'])assert(failure[key],key);
    }else assert.deepEqual(result.failures,[]);
  });
});
