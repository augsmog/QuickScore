import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {proveGlyphPaint} from './glyph-evidence.mjs';
import {chromium} from 'playwright';
import {createMetrics,count,screen,evaluate,aggregate} from './metrics.mjs';
import {cases,setup,ready,disclosures,fixtureVersion} from './adapter.mjs';

const manifest=JSON.parse(fs.readFileSync(new URL('./journeys.json',import.meta.url)));
const base=process.env.BASE_URL||'http://127.0.0.1:8092';
const out=path.resolve(process.env.OUT_DIR||'e2e/journey-screens');
const filter=process.env.JOURNEYS?.split(',').filter(Boolean);
const mutation=process.argv.find(a=>a.startsWith('--mutate='))?.split('=')[1]||process.env.MUTATE;
const baselines=process.env.BASELINE_FILE?JSON.parse(fs.readFileSync(process.env.BASELINE_FILE)):{};
fs.mkdirSync(out,{recursive:true});
const runStart=performance.now();
const required=manifest.journeys.filter(j=>j.status!=='deferred'&&(!filter||filter.includes(j.id))).map(j=>j.id);
const report={sha:process.env.GIT_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),platform:manifest.platform,flags:manifest.flags,fixtureVersion,viewport:{width:390,height:844},startedAt:new Date().toISOString(),required,executed:[],results:[],coverageGaps:manifest.journeys.filter(j=>j.status==='deferred').map(j=>({id:j.id,reason:j.deferredReason})),mutation:mutation||null};
report.glyphEvidence=[];
const glyphDir=fs.mkdtempSync(path.join(out,'glyphs-'));
class Failure extends Error {constructor(signature,message=signature){super(message);this.signature=signature;}}
function demand(ok,signature,message) {if(!ok) throw new Failure(signature,message);}

// Geometry does not scroll, focus, or activate. Check full viewport/ancestor
// clipping and center plus inset-corner hit tests before every real activation.
async function geometry(locator,{text}={}) {
  const page=locator.page();
  if(text)await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
  demand(await locator.count()===1,'control-not-unique');
  demand(await locator.isVisible(),'control-hidden');
  demand(await locator.isEnabled()&&await locator.getAttribute('aria-disabled')!=='true','control-disabled');
  const state=await locator.evaluate((el,text)=>{
    const r=el.getBoundingClientRect(), inset=Math.min(10,r.width/4,r.height/4), points=[[r.x+r.width/2,r.y+r.height/2],[r.x+inset,r.y+inset],[r.right-inset,r.y+inset],[r.x+inset,r.bottom-inset],[r.right-inset,r.bottom-inset]];
    // Include every ancestor, including descendants between a label and its
    // actionable container. Individually nonzero opacities can still hide text.
    const renderedChain=node=>{
      let opacity=1;
      for(let a=node;a;a=a.parentElement) {
        const s=getComputedStyle(a);
        if(s.display==='none'||s.visibility!=='visible')return false;
        opacity*=Number(s.opacity);
      }
      return opacity>0.1;
    };
    const rendered=renderedChain(el);
    let inside=r.width>0&&r.height>0&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;
    for(let a=el.parentElement;a;a=a.parentElement) {
      const s=getComputedStyle(a),b=a.getBoundingClientRect();
      if(/hidden|clip|auto|scroll/.test(s.overflowX)) inside=inside&&r.x>=b.x&&r.right<=b.right;
      if(/hidden|clip|auto|scroll/.test(s.overflowY)) inside=inside&&r.y>=b.y&&r.bottom<=b.bottom;
    }
    const hits=points.every(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit===el||el.contains(hit);});
    // Resolve CSS colors in sRGB and composite ancestor background colors over
    // the browser's default white canvas. Preserve exact computed alpha for the
    // >0.1 threshold rather than quantizing it to an 8-bit canvas channel.
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const rgba=value=>{
      ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);
      const c=[...ctx.getImageData(0,0,1,1).data];
      const alpha=value.includes('/')?value.split('/')[1].replace(')','').trim():value.startsWith('rgba(')?value.slice(5,-1).split(',')[3].trim():null;
      c[3]=alpha===null?c[3]/255:parseFloat(alpha)/(alpha.endsWith('%')?100:1);
      return c;
    };
    const textContrasts=node=>{
      const style=getComputedStyle(node),fill=style.webkitTextFillColor;
      const foreground=rgba(fill&&fill!=='currentcolor'?fill:style.color);
      if(foreground[3]<=0.1)return false;
      const ancestors=[];for(let a=node;a;a=a.parentElement)ancestors.push(a);
      let background=[255,255,255];
      for(const a of ancestors.reverse()) {
        const c=rgba(getComputedStyle(a).backgroundColor);
        background=background.map((v,i)=>c[i]*c[3]+v*(1-c[3]));
      }
      const painted=background.map((v,i)=>foreground[i]*foreground[3]+v*(1-foreground[3]));
      return background.some((v,i)=>Math.abs(v-painted[i])>0.5);
    };
    // Require a contrasting text node with geometry inside the target as well
    // as visibility along the entire text-to-root chain.
    let visibleText=!text,textRect=null,textNode=null;
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    while(text && walker.nextNode()) {
      const n=walker.currentNode,at=n.textContent.toLowerCase().indexOf(text.toLowerCase());if(at<0)continue;
      const range=document.createRange();range.setStart(n,at);range.setEnd(n,at+text.length);
      const own=[...range.getClientRects()].map(q=>({x:q.x,y:q.y,width:q.width,height:q.height})).filter(q=>q.width>0&&q.height>0);
      const clips=[{x:0,y:0,width:innerWidth,height:innerHeight}];
      for(let a=n.parentElement;a;a=a.parentElement) {
        const s=getComputedStyle(a),b=a.getBoundingClientRect();let x=b.x,y=b.y,right=b.right,bottom=b.bottom,clipX=false,clipY=false;
        if(/hidden|clip|auto|scroll/.test(s.overflowX))clipX=true;
        if(/hidden|clip|auto|scroll/.test(s.overflowY))clipY=true;
        if(s.contain.split(/\s+/).includes('paint'))clipX=clipY=true;
        if(s.clip!=='auto') {const m=s.clip.match(/rect\(([^)]*)\)/);if(m){const v=m[1].split(/[ ,]+/).map(q=>q==='auto'?null:parseFloat(q));if(v[0]!=null){y=b.y+v[0];clipY=true;}if(v[1]!=null){right=Math.min(right,b.x+v[1]);clipX=true;}if(v[2]!=null){bottom=Math.min(bottom,b.y+v[2]);clipY=true;}if(v[3]!=null){x=b.x+v[3];clipX=true;}}}
        if(s.clipPath&&s.clipPath!=='none') {
          const inset=s.clipPath.match(/^inset\(([^)]*)\)$/);
          if(inset){const raw=inset[1].split(/\s+/),expanded=raw.length===1?[raw[0],raw[0],raw[0],raw[0]]:raw.length===2?[raw[0],raw[1],raw[0],raw[1]]:raw.length===3?[raw[0],raw[1],raw[2],raw[1]]:raw;
            const px=(v,size)=>parseFloat(v)*(v.endsWith('%')?size/100:1),[t,rr,bb,ll]=[px(expanded[0],b.height),px(expanded[1],b.width),px(expanded[2],b.height),px(expanded[3],b.width)];
            x=b.x+ll;right=b.right-rr;y=b.y+t;bottom=b.bottom-bb;clipX=clipY=true;}
        }
        if(clipX||clipY)clips.push({x:clipX?x:-1e7,y:clipY?y:-1e7,width:clipX?Math.max(0,right-x):2e7,height:clipY?Math.max(0,bottom-y):2e7});
      }
      const clipped=own.map(q=>{let out=q;for(const c of clips){if(!out)break;const x=Math.max(out.x,c.x),y=Math.max(out.y,c.y),right=Math.min(out.x+out.width,c.x+c.width),bottom=Math.min(out.y+out.height,c.y+c.height);out=right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;}return out;}).filter(Boolean);
      const area=own.reduce((sum,q)=>sum+q.width*q.height,0),visible=clipped.reduce((sum,q)=>sum+q.width*q.height,0);
      if(area>0&&visible>=area*.5&&clipped.some(q=>q.width>=4&&q.height>=4)&&renderedChain(n.parentElement)&&textContrasts(n.parentElement)) {
        visibleText=true;
        const x=Math.min(...clipped.map(q=>q.x)),y=Math.min(...clipped.map(q=>q.y)),right=Math.max(...clipped.map(q=>q.x+q.width)),bottom=Math.max(...clipped.map(q=>q.y+q.height));
        textRect={x,y,width:right-x,height:bottom-y};
        const path=[];for(let a=n;a!==el;a=a.parentNode)path.unshift([...a.parentNode.childNodes].indexOf(a));
        textNode={path,start:at,end:at+text.length};
        break;
      }
    }
    return {inside,hits,visibleText,rendered,textRect,textNode,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
  },text);
  demand(state.rendered,'control-hidden');
  demand(state.inside,'outside-viewport-or-clipped',JSON.stringify(state.rect));
  demand(state.hits,'control-occluded');demand(state.visibleText,'visible-text-missing');
  if(text) {
    const evidence={id:report.glyphEvidence.length+1,text,testId:await locator.getAttribute('data-testid'),clip:state.textRect,node:state.textNode,captures:{},proof:null};
    report.glyphEvidence.push(evidence);
    const proof=await proveGlyphPaint(locator,{...state.textNode,clip:state.textRect,onCapture:(stage,png)=>{
      const file=path.join(glyphDir,`${String(evidence.id).padStart(3,'0')}-${stage}.png`);
      fs.writeFileSync(file,png);evidence.captures[stage]=path.relative(out,file);
    }});
    evidence.proof=proof;
    demand(proof.passed,'visible-text-missing',`visible-text-missing: ${proof.reason}`);
  }
  return state.rect;
}
async function reachability(page,locator,feature) {
  // Resolve role/name separately from the fallback locator, and ensure it refers
  // to the same node. An unrelated matching control cannot mask a broken label.
  const named=page.getByRole(feature.role,{name:feature.accessibleName,exact:true});
  const matches=await named.count();
  // A newly named control with a different name is a contract change, not the
  // old missing-semantics defect. It must not silently retain the exception.
  if(matches===0 && await page.getByRole(feature.role).and(locator).count())
    throw new Failure('accessible-name-mismatch',`${feature.name}: review exact name and remove marker`);
  demand(matches===1,matches===0?'no-accessible-name':'accessible-name-not-unique',`${feature.name}: expected one ${feature.role} named "${feature.accessibleName}"`);
  demand(await named.evaluate((el,testId)=>el.getAttribute('data-testid')===testId,feature.testId),'wrong-accessible-target');
  await geometry(named,{text:feature.class==='core'?feature.visibleText:undefined});
  await geometry(locator);
}
async function runJourney(browser,j) {
  const context=await browser.newContext({viewport:report.viewport,serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    return ['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.origin===new URL(base).origin?route.continue():route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(4000);
  const m=createMetrics(),a={number:1,metrics:m,assertions:[],pageErrors:[],featureChecks:[],steps:[],error:null};
  page.on('pageerror',e=>a.pageErrors.push(e.message));
  const dir=path.join(out,j.id);fs.mkdirSync(dir,{recursive:true});
  let started,excludedMs=0,stepNumber=0,timer,navigation=0,scrolls=0,opened=[],lastRect;
  let measuring=false;
  await context.exposeBinding('__journeyFocus',()=>{if(measuring)count(m,'focus');});
  await context.addInitScript(()=>document.addEventListener('focusin',()=>window.__journeyFocus(),true));
  const step=async name=>{
    const before=performance.now();
    await page.screenshot({path:path.join(dir,`${String(++stepNumber).padStart(2,'0')}-${name}.png`)});
    const captureMs=performance.now()-before;excludedMs+=captureMs;
    a.steps.push({number:stepNumber,name,captureMs:Math.round(captureMs)});
  };
  const check=async(id,fn)=>{
    assert(j.assertions.includes(id),`undeclared assertion ${id}`);
    try{await fn();a.assertions.push(id);}catch(e){
      // Only this assertion's missing UI is eligible for its strict xfail.
      // Runtime and unrelated driver errors are never recast as the known defect.
      if(id==='finalize confirm dialog not rendered'&&e.name==='TimeoutError') throw new Failure(id);
      throw e;
    }
  };
  const enter=async id=>{await ready(page,id);screen(m,id);};
  const act={
    activate:async(locator,{feature,navigation:isNavigation=true,disclosure}={})=>{
      const f=feature?j.features.find(f=>f.name===feature):null;
      if(feature&&!f) throw Error(`undeclared feature ${feature}`);
      await locator.waitFor({state:'attached'});
      // Geometry is independently gated even for a semantic expected failure.
      lastRect=await geometry(locator,{text:f?.class==='core'?f.visibleText:undefined});
      if(f) {
        const depth=navigation+1;
        demand(depth<=f.maxActivations,'feature-activation-budget');
        demand(scrolls<=f.maxScrolls&&scrolls<=(f.class==='core'?0:1),'feature-scroll-budget');
        demand(f.start===j.start,'feature-start-mismatch');
        demand(f.class!=='core'||opened.length===0,'core-behind-disclosure');
        let signature=null;
        try{await reachability(page,locator,f);}catch(e){if(!(e instanceof Failure))throw e;signature=e.signature;}
        const r={feature:f.name,signature,status:signature?'failed':'passed',depth,scrolls,disclosures:[...opened],rect:lastRect};
        m.reachability.push(r);a.featureChecks.push(f.name);
        if(f.reachability?.status==='known_issue') {
          demand(signature!==null,'unexpected-reachability-pass',`${f.name}: remove marker ${f.reachability.linear}`);
          demand(signature===f.reachability.signature,'reachability-signature-mismatch',`${f.name}: ${signature}`);
          r.status='expected_failure';r.linear=f.reachability.linear;
        } else demand(!signature,signature||'reachability-error',`${f.name}: ${signature}`);
      }
      const testId=await locator.getAttribute('data-testid');
      if(disclosure||disclosures.includes(testId))opened.push(disclosure||testId);
      count(m,'activations',{feature:feature||null,disclosure:disclosure||null});
      if(isNavigation) navigation++;
      // Trial cannot scroll because geometry already proves the element fully in
      // view. Use coordinates for the actual activation: no Playwright autoscroll.
      const offsets=()=>page.evaluate(()=>[...document.querySelectorAll('*')].filter(el=>el.scrollTop||el.scrollLeft).map(el=>[el.scrollTop,el.scrollLeft]));
      const before=await offsets();
      await locator.click({trial:true});
      demand(JSON.stringify(await offsets())===JSON.stringify(before),'implicit-scroll');
      const rect=await geometry(locator,{text:f?.class==='core'?f.visibleText:undefined});
      await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);
    },
    type:async(locator,value)=>{
      await geometry(locator);
      count(m,'textEdit');await locator.fill(value);
    },
    scroll:async(locator,deltaY)=>{
      demand(Math.abs(deltaY)<=844,'scroll-over-one-viewport');
      const before=await locator.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
      await locator.hover();await page.mouse.wheel(0,deltaY);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const after=await locator.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
      count(m,'scroll',{before,after,deltaY});scrolls++;
    },
  };
  try {
    await setup(context,page,j,base);
    if(mutation && j.id==='J-home-create-cancel') {
      const target=page.getByTestId('home-new-contest');
      if(mutation==='hide')await target.evaluate(el=>el.style.visibility='hidden');
      else if(mutation==='rename')await target.evaluate(el=>el.setAttribute('aria-label','Mutated name'));
      else if(mutation==='disable')await target.evaluate(el=>el.setAttribute('aria-disabled','true'));
      else if(['hide-label','transparent-label','label-overflow-clipped','label-clip-path','text-fill-transparent'].includes(mutation))await target.evaluate((el,mutation)=>{
        const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let label;
        while(walker.nextNode())if(walker.currentNode.textContent.trim()==='New Contest'){label=walker.currentNode;break;}
        if(!label)throw Error('mutation label missing');
        const outer=document.createElement('span'),inner=document.createElement('span');
        if(mutation==='hide-label')outer.style.opacity='0';
        else if(mutation==='transparent-label')outer.style.color='transparent';
        else if(mutation==='label-overflow-clipped'){outer.style.display='inline-block';outer.style.height='0px';outer.style.overflow='hidden';}
        else if(mutation==='label-clip-path'){outer.style.display='inline-block';outer.style.clipPath='inset(50%)';}
        else {outer.style.webkitTextFillColor='transparent';outer.style.color='rgb(20,20,20)';}
        label.replaceWith(outer);outer.append(inner);inner.append(label);
      },mutation);
      else if(['opaque-overlay','striped-overlay','pseudo-after-stripes','currentcolor-overlay','partial-striped-overlay','sliver-striped-overlay','textured-transparent-label'].includes(mutation))await target.evaluate((el,mutation)=>{
        const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let label;
        while(walker.nextNode())if(walker.currentNode.textContent.trim()==='New Contest'){label=walker.currentNode;break;}
        if(!label)throw Error('mutation label missing');
        const parent=label.parentElement;
        parent.style.position='relative';parent.style.display='inline-block';
        const stripes='repeating-linear-gradient(90deg, rgb(0,0,0) 0 2px, rgb(255,255,255) 2px 4px)';
        if(mutation==='textured-transparent-label') {
          parent.style.backgroundImage=stripes;parent.style.webkitTextFillColor='transparent';
        } else if(mutation==='pseudo-after-stripes') {
          parent.setAttribute('data-journey-cover','');
          const css=document.createElement('style');
          css.textContent=`[data-journey-cover]::after{content:"";position:absolute;inset:0;background:${stripes};pointer-events:none;z-index:5}`;
          document.head.append(css);
        } else {
          const cover=document.createElement('span');cover.setAttribute('aria-hidden','true');
          Object.assign(cover.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'5'});
          cover.style.background=mutation==='opaque-overlay'?'rgb(23,92,58)':mutation==='currentcolor-overlay'?'repeating-linear-gradient(90deg, currentColor 0 2px, rgb(0,0,0) 2px 4px)':stripes;
          if(mutation==='partial-striped-overlay')cover.style.left='20%';
          if(mutation==='sliver-striped-overlay')cover.style.clipPath='polygon(0 0,100% 0,100% 9px,0 9px,0 11px,100% 11px,100% 100%,0 100%)';
          parent.append(cover);
        }
      },mutation);
      else throw Error(`unknown mutation ${mutation}`);
    }
    screen(m,j.start==='home'?'home':'round-scorecard');
    await step('entry');started=performance.now();measuring=true;const captureStart=excludedMs;
    // Absolute timeout includes capture; task duration below excludes capture.
    const operation=cases[j.id]({page,act,check,step,enter,reload:async()=>{count(m,'activations',{action:'reload'});await page.reload();}});
    try {await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{a.timedOut=true;reject(new Failure('absolute-timeout'));},j.budget.timeoutMs);})]);}
    finally {clearTimeout(timer);m.durationMs=Math.round(performance.now()-started-(excludedMs-captureStart));}
  } catch(e) {
    a.error=String(e);a.signature=e.signature||'unclassified';
    try{await step('failed');}catch(captureError){a.captureError=String(captureError);}
  } finally {measuring=false;clearTimeout(timer);await context.close();}
  const result={id:j.id,...evaluate(j,a,{baseline:baselines[j.id]??j.baseline}),metrics:m,attempts:[a]};
  return result;
}
let browser;
try {
  assert(new URL(base).protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname),'BASE_URL must be localhost');
  assert(required.length>0,'empty required inventory');
  if(filter)assert(filter.every(id=>manifest.journeys.some(j=>j.id===id&&j.status!=='deferred')),'unknown/deferred JOURNEYS filter');
  assert.deepEqual(Object.keys(cases).sort(),manifest.journeys.filter(j=>j.status!=='deferred').map(j=>j.id).sort(),'adapter/manifest required inventory mismatch');
  assert.equal(new Set(manifest.journeys.map(j=>j.id)).size,manifest.journeys.length,'duplicate manifest journey');
  browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
  for(const id of required) {
    const j=manifest.journeys.find(j=>j.id===id);
    const result=await runJourney(browser,j);report.executed.push(id);report.results.push(result);
    console.log(`${result.status.toUpperCase()} ${id}: activations=${result.metrics.activations}, screens=${result.metrics.screens.length}, taskMs=${result.metrics.durationMs}${result.errors.length?' '+result.errors.join('; '):''}`);
  }
} catch(e) {report.results.push({id:'startup',status:'failed',error:String(e)});}
finally {
  await browser?.close();
  for(const j of manifest.journeys) for(const f of j.features) if(f.reachability?.status==='known_issue')report.coverageGaps.push({id:j.id,feature:f.name,linear:f.reachability.linear,reason:'Semantic reachability expected failure; geometry, activation and outcomes remain gated'});
  report.gate=aggregate(required,report.results);report.elapsedMs=Math.round(performance.now()-runStart);
  fs.writeFileSync(path.join(out,'journeys-results.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(`Journey gate ${report.gate.status.toUpperCase()}: ${report.results.filter(r=>r.status==='passed'||r.status==='expected_failure').length}/${required.length}; elapsed ${report.elapsedMs} ms; coverage gaps ${report.coverageGaps.length}`);
if(report.gate.status!=='passed') {console.error(report.gate.errors.join('\n'));process.exitCode=1;}
