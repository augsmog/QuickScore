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
      let left=r.left,top=r.top,right=r.right,bottom=r.bottom,unsupported=false,scrollBoxX=null,scrollBoxY=null;
      for(let a=el;a;a=a.parentElement){
        const s=getComputedStyle(a),b=a.getBoundingClientRect();
        if(s.clip!=='auto'||s.transform!=='none'&&!/^matrix\([^,]+, 0, 0, [^,]+, [^,]+, [^,]+\)$/.test(s.transform))unsupported=true;
        if(s.clipPath!=='none'){
          // inset() is a plain rectangle: fold it into the same box-intersection
          // this function already does for overflow/scroll ancestors, instead of
          // refusing to measure it. Other basic-shape functions (circle, polygon,
          // ellipse, path...) have no rectangular equivalent, so they stay unsupported.
          // `round <radius>` makes the inset corners non-rectangular; that has no
          // rectangular equivalent either, so it must stay unsupported rather than
          // silently folding only the first four (ignored-rounding) offsets.
          const inset=s.clipPath.match(/^inset\(([^)]*)\)$/);
          if(inset&&!/round/i.test(inset[1])){
            const raw=inset[1].split(/\s+/),expanded=raw.length===1?[raw[0],raw[0],raw[0],raw[0]]:raw.length===2?[raw[0],raw[1],raw[0],raw[1]]:raw.length===3?[raw[0],raw[1],raw[2],raw[1]]:raw;
            const px=(v,size)=>parseFloat(v)*(v.endsWith('%')?size/100:1),[ct,cr,cb,cl]=[px(expanded[0],b.height),px(expanded[1],b.width),px(expanded[2],b.height),px(expanded[3],b.width)];
            left=Math.max(left,b.left+cl);right=Math.min(right,b.right-cr);top=Math.max(top,b.top+ct);bottom=Math.min(bottom,b.bottom-cb);
          } else unsupported=true;
        }
        // Only sizing may ignore a genuinely scrollable ancestor's fragment.
        // Paint, inclusion, overlap and safe-area checks keep the visible rect.
        const paint=s.contain.split(/\s+/).some(v=>['paint','strict','content'].includes(v));
        const scrollX=forTargetSize&&a!==el&&/auto|scroll/.test(s.overflowX)&&a.scrollWidth>a.clientWidth;
        const scrollY=forTargetSize&&a!==el&&/auto|scroll/.test(s.overflowY)&&a.scrollHeight>a.clientHeight;
        // Once a nearer ancestor has already proven the element reachable by scrolling,
        // a farther-out static frame must not re-impose its own fragment UNLESS it is
        // itself smaller than that scrollable ancestor's own box (a genuine additional
        // clip, not just a body/html page-scroll lock whose box coincides with or
        // exceeds it).
        const restrictsX=!scrollBoxX||b.left>scrollBoxX.left||b.right<scrollBoxX.right;
        const restrictsY=!scrollBoxY||b.top>scrollBoxY.top||b.bottom<scrollBoxY.bottom;
        if(restrictsX&&(paint||/hidden|clip|auto|scroll/.test(s.overflowX)&&!scrollX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}
        if(restrictsY&&(paint||/hidden|clip|auto|scroll/.test(s.overflowY)&&!scrollY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}
        if(scrollX&&!scrollBoxX)scrollBoxX=b;
        if(scrollY&&!scrollBoxY)scrollBoxY=b;
      }
      // The viewport edge is itself just the outermost scroll boundary: once a nearer
      // ancestor has already proven the element reachable by scrolling, the window's
      // current scroll-position snapshot isn't a real clip either, unless the viewport
      // is itself narrower than that scrollable ancestor's own box.
      if(!scrollBoxX||0>scrollBoxX.left||innerWidth<scrollBoxX.right){left=Math.max(0,left);right=Math.min(innerWidth,right);}
      if(!scrollBoxY||0>scrollBoxY.top||innerHeight<scrollBoxY.bottom){top=Math.max(0,top);bottom=Math.min(innerHeight,bottom);}
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
      // A control that spans the full viewport edge-to-edge is a modal/sheet backdrop
      // (tap-anywhere-to-dismiss scrim), not a placed UI target: it is expected to
      // ignore safe-area insets and to sit beneath the screen it is dimming, so it is
      // not a real target-size/safe-area/overlap candidate against that background.
      const spansViewport=visible.left<=0.5&&visible.top<=0.5&&visible.right>=innerWidth-0.5&&visible.bottom>=innerHeight-0.5;
      targets.push({id,name:identify(el),...visible,raw,size:visibleRect(el,raw,true),spansViewport});
    }
    // A dismiss-scrim only exists alongside the sheet/dialog content it dims; a
    // viewport-spanning control with nothing else on screen is an ordinary (and
    // audit-worthy) full-screen control, not a backdrop.
    for(const t of targets)t.backdrop=t.spansViewport&&targets.length>1;
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
    if(!item.backdrop&&(item.top<context.profile.top||item.bottom>context.profile.height-context.profile.bottom))fail('safe-area',item);
  }
  for(const target of layout.targets)if(!target.backdrop&&(target.size.width<44||target.size.height<44))fail('target-size',target);
  // No parentId exemptions: independent nested interactive controls are still
  // ambiguous targets; own label text is associated by DOM ancestry below. A full-viewport
  // backdrop is excluded entirely: it is expected to sit beneath (and dim) everything else
  // on screen, so it is never a meaningful overlap partner.
  const overlapTargets=layout.targets.filter(t=>!t.backdrop);
  for(const overlap of findInteractiveTargetOverlaps(overlapTargets))fail('control-overlap',overlap);
  for(const text of layout.texts)for(const target of overlapTargets){
    if(text.owners.includes(target.id))continue;
    const width=Math.min(text.right,target.right)-Math.max(text.left,target.left),height=Math.min(text.bottom,target.bottom)-Math.max(text.top,target.top);
    if(width>2&&height>2)fail('text-over-control',{text,target,width,height});
  }
  return {...layout,failures};
}
