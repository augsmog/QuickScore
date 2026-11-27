// G1: a clipped vertical scroll stop is not evidence of failure OR success by itself.
// A separate, SHA-bound capture can prove the *same* interaction fully usable. The
// checkpoint geometry object is never trusted to declare its own reachability.
import {readFileSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, sep} from 'node:path';
import {finiteRect, rectOf} from './geometry-rules.mjs';
import {verifyIOSWizard} from './ios-wizard-proof.mjs';

const STOPS = new Set(['four players','last player above footer','rewind remove ava','four players add group']);
const NAMED = /^(?:wizard-player-name-[1-4]|remove-player-Ava|player-(?:handicap|group)-Ava|player-team-Ava-(?:A|B)|add-player|add-group)$/;
const REQUIRED = {
  'four players': 'remove-player-Ava',
  'last player above footer': 'wizard-player-name-4',
  'rewind remove ava': 'remove-player-Ava',
  'four players add group': 'add-group',
};
const MIN = 44;
const edges = ['left','right','top','bottom'];
const equal = (r,s) => finiteRect(r) && finiteRect(s) && edges.every(k=>r[k]===s[k]);
const same = (a,b) => ['id','role','text','enabled','selected','checked'].every(k=>a[k]===b[k]);
function sole(cp,id) {
  const n=cp.nodes.filter(x=>x.id===id);
  return n.length===1?n[0]:null;
}
function nodesFor(cp) {
  return cp.nodes.filter(n=>n.role==='control' && NAMED.test(n.id)
    && n.meta?.resourceId===n.id && sole(cp,n.id)===n);
}
function scroll(cp,n) {
  const root=sole(cp,'contest-scroll');
  return root?.meta?.scrollClip===true && equal(n?.meta?.scrollViewport,root.bbox)?root.bbox:null;
}
function safety(cp) {
  const {safeArea:a,viewport:v,footer:f,measuredKeyboardInset:k}=cp.context;
  if (!a || !v || !finiteRect(f) || k!==0 ||
      ![a.left,a.right,a.top,a.bottom,v.width,v.height].every(Number.isFinite)) return null;
  const r={left:a.left,top:a.top,right:v.width-a.right,bottom:v.height-a.bottom};
  if (!finiteRect(r) || f.top<=r.top || f.top>r.bottom) return null;
  return r;
}
const sized = r=>finiteRect(r) && r.right-r.left>=MIN && r.bottom-r.top>=MIN;
const inside = (r,s)=>finiteRect(r)&&finiteRect(s)&&r.left>=s.left&&r.right<=s.right&&r.top>=s.top&&r.bottom<=s.bottom;
function verticalOnly(r,s) {
  return r.left>=s.left && r.right<=s.right && (r.top<s.top || r.bottom>s.bottom);
}
function screenshotIsBound(cp,dir) {
  const f=realpathSync(resolve(dir,cp.screenshot));
  return f.startsWith(dir+sep) && createHash('sha256').update(readFileSync(f)).digest('hex')===cp.screenshotSha256;
}

export function wizardScrollCoverage(bundle,expect={}) {
  const proved=new Map();
  // Legacy captures and nonwizard/profile runs retain every original finding.
  if (!expect.evidenceDir || !expect.sourceSha || !expect.profile || !expect.buildHash) return proved;
  const stops=bundle.checkpoints.filter(cp=>cp.flow==='new-contest'&&STOPS.has(cp.checkpoint));
  try {
    verifyIOSWizard(bundle,{sourceSha:expect.sourceSha,profileId:expect.profile,buildHash:expect.buildHash});
    const dir=realpathSync(expect.evidenceDir);
    const entry=bundle.checkpoints.find(cp=>cp.flow==='new-contest'&&cp.checkpoint==='name entry');
    if (![entry,...stops].every(cp=>screenshotIsBound(cp,dir))) return proved;
  } catch {
    return proved; // missing, tampered or incompatible evidence grants no exception
  }
  for(const cp of stops) {
    const safe=safety(cp);
    const anchor=sole(cp,'wizard-player-row-4');
    const viewport=scroll(cp,anchor);
    if (!safe || !viewport) continue;
    // Real footer occlusion and safe-area collisions are still evaluated below. Requiring the
    // ScrollView itself to fit before the footer limits this to genuine, contained scrolling.
    if (!inside(viewport,safe)||viewport.bottom>cp.context.footer.top) continue;
    for(const node of nodesFor(cp)) {
      const r=node.bbox,h=rectOf(node);
      if (!equal(scroll(cp,node),viewport)||!sized(r)||!sized(h) ||
          !verticalOnly(r,viewport)) continue;
      if (node.enabled!==true || node.meta?.required===true || node.meta?.requiredAtCheckpoint===true ||
          REQUIRED[cp.checkpoint]===node.id) continue;
      for(const reveal of stops) {
        if (reveal===cp || reveal.screenshotSha256===cp.screenshotSha256) continue;
        const b=sole(reveal,node.id), nextAnchor=sole(reveal,'wizard-player-row-4');
        if (!b || !nextAnchor || b.meta?.resourceId!==node.id || !same(node,b) ||
            !equal(safety(reveal),safe)||!equal(reveal.context.footer,cp.context.footer) ||
            !equal(scroll(reveal,b),viewport)||!equal(scroll(reveal,nextAnchor),viewport)) continue;
        const motion=nextAnchor.bbox.top-anchor.bbox.top;
        // Uniform translation by measured scrolling: a layout jump or swapped target cannot
        // serve as proof, even if its second screenshot is different.
        const translates=(x,y)=>x.left===y.left&&x.right===y.right&&
          Math.abs(y.top-x.top-motion)<=1&&Math.abs(y.bottom-x.bottom-motion)<=1;
        if (!motion || !translates(anchor.bbox,nextAnchor.bbox) ||
            !translates(r,b.bbox)||!translates(h,rectOf(b))) continue;
        if (!inside(b.bbox,viewport)||!inside(rectOf(b),viewport) ||
            !inside(b.bbox,safe)||!inside(rectOf(b),safe) ||
            Math.max(b.bbox.bottom,rectOf(b).bottom)>reveal.context.footer.top) continue;
        if (!proved.has(cp)) proved.set(cp,new Map());
        proved.get(cp).set(node,{id:node.id,checkpoint:reveal.checkpoint,verticalMotion:motion,
          revealedFrame:b.bbox,revealedHitRegion:rectOf(b),screenshotSha256:reveal.screenshotSha256});
        break;
      }
    }
  }
  return proved;
}
