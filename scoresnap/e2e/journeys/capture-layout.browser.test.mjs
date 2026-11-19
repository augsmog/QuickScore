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
    // AUG-1178: clip-path:inset() is a plain rectangle and must fold into the same
    // box-intersection as overflow/scroll ancestors, not refuse to measure (which
    // previously made any inset()-clipped element anywhere on the page -- including
    // one fully clipped to zero area -- fail the whole capture as unsupported-geometry).
    ['inset-clip-partial','<button style="position:absolute;left:100px;top:100px;width:44px;height:44px;clip-path:inset(0 0 24px 0)">Go</button>','target-size'],
    ['inset-clip-full','<button style="position:absolute;left:100px;top:100px;width:44px;height:44px;clip-path:inset(50%)">Go</button>',null],
    ['safe-edge',button(100,59)+button(200,774),null],
    ['two-pixel-overlap',button(100,100)+button(142,100),null],
    ['offscreen',button(100,900),null],
    ['hidden',`<div style="opacity:0">${button(100,4)}</div>`,null],
    ['transparent-text','<span style="position:absolute;top:0;color:transparent">Hidden</span>',null],
    ['opacity-product',`<div style="opacity:.2"><div style="opacity:.2">${button(100,4)}</div></div>`,null],
    ['covered-control',button(100,4)+'<div style="position:fixed;inset:0;background:white"></div>',null],
    // AUG-1211: a full-viewport interactive scrim (modal/sheet backdrop), identified by
    // this app's own testID convention (every real FullScreenSheet names its scrim/
    // backdrop view that way -- see src/ui/GamePromptSheet.tsx, app/scan/review.tsx),
    // must not be flagged for safe-area, and background content it dims must not be
    // flagged as overlapping it -- the backdrop is excluded from the overlap/safe-area
    // audit.
    ['scrim-backdrop','<button data-testid="modal-scrim" style="position:absolute;left:0;top:0;width:393px;height:852px;background:rgba(0,0,0,.5)"></button><span style="position:absolute;left:20px;top:400px">Background label</span>'+button(150,600),null],
    // A near-full-viewport overlay (2px short of covering edge-to-edge) is not a
    // backdrop and must still be audited normally for overlap, even with the scrim
    // testID present.
    ['near-full-not-backdrop','<button data-testid="modal-scrim" style="position:absolute;left:0;top:0;width:391px;height:850px"></button>'+button(100,100),'control-overlap'],
    // A lone viewport-spanning control with nothing else on screen has no sheet/dialog
    // content to dim -- it is an ordinary full-screen control, not a dismiss-scrim, and
    // must still be audited for safe-area.
    ['lone-full-viewport-control',button(0,0,393,852),'safe-area'],
    // AUG-1155 checker finding: merely spanning the viewport while another control
    // exists elsewhere on screen does not make a control a backdrop -- an ordinary
    // full-screen control (no scrim/backdrop testID) must still be audited for
    // safe-area even though a second, unrelated control is also visible.
    ['full-viewport-no-scrim-identity-not-backdrop','<button style="position:absolute;left:0;top:0;width:393px;height:852px"></button>'+button(150,600),'safe-area'],
    // clip-path:inset() with a `round` radius is not a plain rectangle; it must stay
    // unsupported rather than silently folding only the first four offsets.
    ['inset-clip-rounded','<button style="position:absolute;left:100px;top:100px;width:44px;height:44px;clip-path:inset(1px 2px 3px 4px round 50%)">Go</button>','unsupported-geometry'],
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

test('scroll fragments retain full target size without broadening visible geometry',async t=>{
  const browser=await chromium.launch();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:393,height:852}});
  // Recorded full/fragment dimensions from every AUG-1178 journey cluster.
  const rows=[[353,80,15],[390,80,3],[335,68,33],[108,44,13],[163.5,50,25],[108,44,19],[51,44,39],[162,44,30],[44,44,6],[60,44,42]];
  const audit=async(html)=>{
    await page.setContent(`<style>body{margin:0}button,input{box-sizing:border-box;padding:0;border:0}</style>${html}`);
    return auditCapture(page,{profileName:'iphone-15-pro',profile:getSafeAreaProfile('iphone-15-pro'),journey:'scroll-fixture',capture:'scroll',screenshot:'scroll.png'});
  };
  const markup=(w,h,fragment,overflow='auto',extra='')=>`<div style="position:absolute;left:0;top:100px;width:393px;height:${fragment}px;overflow-y:${overflow};${extra}"><button aria-label="row" style="display:block;width:${w}px;height:${h}px"></button></div>`;
  for(const [w,h,fragment] of rows)await t.test(`${w}x${h} visible ${fragment}`,async()=>{
    const result=await audit(markup(w,h,fragment));
    assert.equal(result.targets[0].height,fragment,'paint geometry stays clipped');
    assert.deepEqual(result.failures,[]);
  });
  for(const overflow of ['auto','scroll'])await t.test(`horizontal ${overflow}`,async()=>{
    const result=await audit(`<div style="position:absolute;left:100px;top:100px;width:6px;height:60px;overflow-x:${overflow}"><button style="width:44px;height:44px"></button></div>`);
    assert.equal(result.targets[0].width,6);
    assert.deepEqual(result.failures,[]);
  });
  // AUG-1212: a static outer frame whose own box happens to coincide with the
  // viewport (the common body/html page-lock pattern around an inner real
  // scrollview) must not re-impose that boundary once the inner scrollable
  // ancestor has already proven the row reachable by scrolling -- regardless
  // of whether that outer frame is literally the viewport edge or an explicit
  // overflow:hidden ancestor whose box happens to match it.
  await t.test('viewport-matching outer static frame does not re-clip past an inner scrollable ancestor',async()=>{
    const result=await audit(`<div style="position:absolute;left:0;top:0;width:393px;height:852px;overflow:hidden"><div style="position:absolute;left:0;top:700px;width:393px;height:152px;overflow-y:auto"><button aria-label="row" style="display:block;width:353px;height:80px;margin-top:100px"></button></div></div>`);
    assert.equal(result.targets[0].size.height,80,'sizing ignores the redundant outer frame once the inner scroll ancestor already exempted this axis');
    // The row's bottom genuinely sits in the device's bottom inset band at this
    // scroll position, so safe-area (deliberately not scroll-exempt) still fires --
    // only the target-size false positive from the redundant outer clamp is fixed.
    assert.equal(result.failures.length,1);
    assert.equal(result.failures[0].assertion,'safe-area');
  });
  for(const [name,html,expected] of [
    ['hidden',markup(44,44,6,'hidden'),'target-size'],
    ['clip',markup(44,44,6,'clip'),'target-size'],
    ...['paint','strict','content'].map(contain=>[contain,markup(44,44,6,'auto',`contain:${contain}`),'target-size']),
    ['small-raw',markup(44,30,6),'target-size'],
    ['non-scrollable-auto',`<div style="position:absolute;left:100px;top:100px;width:44px;height:44px;overflow:auto"><button style="position:absolute;top:-38px;width:44px;height:44px"></button></div>`,'target-size'],
    ['nested-hidden',`<div style="position:absolute;left:100px;top:100px;height:6px;width:60px;overflow:auto"><div style="height:30px;overflow:hidden"><button style="width:44px;height:44px"></button></div><div style="height:100px"></div></div>`,'target-size'],
    // A farther-out static frame that is genuinely smaller than the nearer scrollable
    // ancestor's own box (unlike AUG-1212's viewport/body-sized case) still permanently
    // clips the row to that smaller window no matter how it is scrolled, and must keep
    // re-applying its own fragment.
    ['smaller-outer-frame-past-scroll-ancestor',`<div style="position:absolute;left:100px;top:100px;width:60px;height:6px;overflow:hidden"><div style="width:60px;height:44px;overflow-y:auto"><button style="display:block;width:44px;height:44px"></button><div style="height:100px"></div></div></div>`,'target-size'],
    ...[4,800].map(y=>[`safe-band-${y}`,`<div style="position:absolute;left:100px;top:${y}px;height:44px;width:60px;overflow:auto"><button style="display:block;width:44px;height:44px"></button><div style="height:100px"></div></div>`,'safe-area']),
  ])await t.test(name,async()=>{
    const result=await audit(html);
    assert(result.failures.some(f=>f.assertion===expected),JSON.stringify(result));
  });
});
