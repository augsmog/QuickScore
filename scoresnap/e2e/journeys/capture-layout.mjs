import {findInteractiveTargetOverlaps} from '../interactive-target-geometry.mjs';

// Browser factory shared by activation geometry and screenshot-boundary audits.
export function createPaintHelpers() {
    const renderedChain=node=>{
      let opacity=1;
      for(let a=node;a;a=a.parentElement) {
        const s=getComputedStyle(a);
        if(s.display==='none'||s.visibility!=='visible')return false;
        opacity*=Number(s.opacity);
      }
      return opacity>0.1;
    };
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
  return {renderedChain,textContrasts,rgba};
}

export async function auditCapture(page,context) {
  await page.evaluate(()=>document.fonts.ready.then(()=>undefined));
  const helpers=await page.evaluateHandle(createPaintHelpers);
  let layout;
  try {layout=await page.evaluate(({helpers})=>{
    const selector='button,a[href],input,select,textarea,summary,[role="button"],[role="link"],[role="radio"],[role="checkbox"],[role="switch"],[role="tab"],[role="menuitem"],[tabindex]:not([tabindex="-1"])';
    const elements=[...document.querySelectorAll(selector)];
    const rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
    const identify=el=>el.getAttribute('aria-label')||el.getAttribute('data-testid')||el.textContent?.trim().slice(0,80)||el.tagName;
    const visibleRect=(el,r,forTargetSize=false)=>{
      let left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom),unsupported=false;
      for(let a=el;a;a=a.parentElement){
        const s=getComputedStyle(a),b=a.getBoundingClientRect();
        if(s.clipPath!=='none'||s.clip!=='auto'||s.transform!=='none'&&!/^matrix\([^,]+, 0, 0, [^,]+, [^,]+, [^,]+\)$/.test(s.transform))unsupported=true;
        // Only sizing may ignore a genuinely scrollable ancestor's fragment.
        // Paint, inclusion, overlap and safe-area checks keep the visible rect.
        const paint=s.contain.split(/\s+/).some(v=>['paint','strict','content'].includes(v));
        const scrollX=forTargetSize&&a!==el&&/auto|scroll/.test(s.overflowX)&&a.scrollWidth>a.clientWidth;
        const scrollY=forTargetSize&&a!==el&&/auto|scroll/.test(s.overflowY)&&a.scrollHeight>a.clientHeight;
        if(paint||/hidden|clip|auto|scroll/.test(s.overflowX)&&!scrollX){left=Math.max(left,b.left);right=Math.min(right,b.right);}
        if(paint||/hidden|clip|auto|scroll/.test(s.overflowY)&&!scrollY){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}
      }
      return {left,top,right,bottom,width:right-left,height:bottom-top,unsupported};
    };
    // A transparent cover or pointer-events:none changes hit testing without
    // hiding paint. Exclude only proven opaque coverage; uncertainty is audited.
    const paintVisible=(el,r)=>[.1,.5,.9].some(x=>[.1,.5,.9].some(y=>{
      for(const cover of document.elementsFromPoint(r.left+r.width*x,r.top+r.height*y)){
        if(cover===el||el.contains(cover))return true;
        if(cover.contains(el))continue;
        let opacity=1;for(let a=cover;a;a=a.parentElement)opacity*=Number(getComputedStyle(a).opacity);
        if(helpers.rgba(getComputedStyle(cover).backgroundColor)[3]*opacity>=.99)return false;
      }
      return true;
    }));
    const targets=[];
    for(const [id,el] of elements.entries()){
      if(!helpers.renderedChain(el))continue;
      const raw=rect(el.getBoundingClientRect()),visible=visibleRect(el,raw);
      if(visible.width<=0||visible.height<=0||!paintVisible(el,visible))continue;
      targets.push({id,name:identify(el),...visible,raw,size:visibleRect(el,raw,true)});
    }
    const texts=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode,el=node.parentElement;
      if(!node.textContent.trim()||!helpers.renderedChain(el)||!helpers.textContrasts(el))continue;
      const range=document.createRange();range.selectNodeContents(node);
      for(const r of range.getClientRects()){
        const visible=visibleRect(el,r);
        if(visible.width<=0||visible.height<=0||!paintVisible(el,visible))continue;
        texts.push({name:node.textContent.trim().slice(0,80),...visible,owners:targets.filter(t=>elements[t.id].contains(el)).map(t=>t.id)});
      }
    }
    return {targets,texts};
  },{helpers});}finally{await helpers.dispose();}
  const failures=[];
  const fail=(assertion,geometry)=>failures.push({profile:context.profileName,journey:context.journey,capture:context.capture,assertion,geometry,screenshot:context.screenshot});
  for(const item of [...layout.targets,...layout.texts]){
    if(item.unsupported)fail('unsupported-geometry',item);
    if(item.top<context.profile.top||item.bottom>context.profile.height-context.profile.bottom)fail('safe-area',item);
  }
  for(const target of layout.targets)if(target.size.width<44||target.size.height<44)fail('target-size',target);
  // No parentId exemptions: independent nested interactive controls are still
  // ambiguous targets; own label text is associated by DOM ancestry below.
  for(const overlap of findInteractiveTargetOverlaps(layout.targets))fail('control-overlap',overlap);
  for(const text of layout.texts)for(const target of layout.targets){
    if(text.owners.includes(target.id))continue;
    const width=Math.min(text.right,target.right)-Math.max(text.left,target.left),height=Math.min(text.bottom,target.bottom)-Math.max(text.top,target.top);
    if(width>2&&height>2)fail('text-over-control',{text,target,width,height});
  }
  return {...layout,failures};
}
