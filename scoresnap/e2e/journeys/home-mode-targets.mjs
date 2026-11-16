import assert from 'node:assert/strict';

export const homeModeNames=['Stroke Play','Match Play','Stableford','Modified Stableford (SnapScore)'];

export async function homeModeTargets(page) {
  const targets=[];
  for(const name of homeModeNames) {
    const chip=page.getByText(name,{exact:true}).locator('..');
    targets.push(await chip.evaluate((el,name)=>{
      const r=el.getBoundingClientRect();
      let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right);
      let top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
      for(let a=el.parentElement;a;a=a.parentElement) {
        const s=getComputedStyle(a),q=a.getBoundingClientRect();
        if(/hidden|clip|auto|scroll/.test(s.overflowX)) {left=Math.max(left,q.left);right=Math.min(right,q.right);}
        if(/hidden|clip|auto|scroll/.test(s.overflowY)) {top=Math.max(top,q.top);bottom=Math.min(bottom,q.bottom);}
      }
      const width=Math.max(0,right-left),height=Math.max(0,bottom-top);
      // Inset corners stay inside the rounded pill; use the visible, clipped rect.
      const inset=Math.min(10,width/4,height/4);
      const points=[[left+width/2,top+height/2],[left+inset,top+inset],
        [right-inset,top+inset],[left+inset,bottom-inset],[right-inset,bottom-inset]];
      const hit=width>0&&height>0&&points.every(([x,y])=>{
        const h=document.elementFromPoint(x,y);return h===el||el.contains(h);
      });
      return {name,left,right,top,bottom,width,height,rawWidth:r.width,rawHeight:r.height,hit};
    },name));
  }
  return targets;
}

export function assertHomeModeTargets(targets,label='home') {
  for(const r of targets) {
    assert(r.rawWidth>=44&&r.rawHeight>=44,`${label}: ${r.name} raw ${r.rawWidth}x${r.rawHeight}`);
    if(r.width<=0||r.height<=0)continue;
    assert(r.width>=44&&r.height>=44,`${label}: ${r.name} visible ${r.width}x${r.height}`);
    assert(r.hit,`${label}: ${r.name} occluded`);
  }
  for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++) {
    const a=targets[i],b=targets[j];
    const width=Math.min(a.right,b.right)-Math.max(a.left,b.left);
    const height=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    assert(!(width>2&&height>2),`${label}: mode controls overlap ${width}x${height}`);
  }
}
