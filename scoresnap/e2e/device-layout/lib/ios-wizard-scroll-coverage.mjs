// G1: a clipped vertical scroll stop is not evidence of failure OR success by itself.
// A separate, SHA-bound capture can prove the *same* interaction fully usable. The
// checkpoint geometry object is never trusted to declare its own reachability.
import {readFileSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, sep} from 'node:path';
import {finiteRect, rectOf} from './geometry-rules.mjs';
import {verifyIOSWizard} from './ios-wizard-proof.mjs';

const STOPS = new Set(['four players','last player above footer','rewind remove ava','four players add group']);
const EARLY = ['empty wizard','name entry','multi day on','rounds 3','rounds 4 scrolled','team mode on'];
const REVEAL = ['first','bottom','restore'];
const NAMED = /^(?:wizard-(?:contest-name|course|add-team|remove-group|team-name-[A-Z]|remove-player-[1-4]|player-(?:name|handicap|group)-[1-4]|player-team-[1-4]-[A-Z])|remove-player-Ava|player-(?:handicap|group)-Ava|player-team-Ava-[A-Z]|add-player|add-group|rounds-[2-4]|(?:tournament-toggle|team-mode)(?:-slot)?)$/;
const REQUIRED = {
  'name entry': 'wizard-player-name-1',
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
  if (!a || !v || !finiteRect(f) || !Number.isFinite(k) || k<0 ||
      ![a.left,a.right,a.top,a.bottom,v.width,v.height].every(Number.isFinite)) return null;
  const r={left:a.left,top:a.top,right:v.width-a.right,bottom:v.height-a.bottom};
  if (!finiteRect(r) || f.top<=r.top || f.top>v.height) return null;
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

// Witnesses are named by the capture orchestrator and must be consecutive before the
// next primary mutates state. Duplicates and cross-device files are never evidence.
function earlyGroups(bundle,dir) {
  const wizard=bundle.checkpoints.filter(cp=>cp.flow==='new-contest');
  const unique=name=>wizard.filter(cp=>cp.checkpoint===name).length===1;
  return EARLY.map(root=>{
    const names=[root,...REVEAL.map(s=>root+' reveal '+s)];
    const index=wizard.findIndex(x=>x.checkpoint===root);
    const cps=wizard.slice(index,index+names.length);
    if (!names.every(unique)||cps.length!==names.length ||
        !cps.every((cp,i)=>cp.checkpoint===names[i]&&cp.deviceId===bundle.profile&&cp.screen==='new-contest'&&cp.platform==='ios'&&
          /^\d+-new-contest-/.test(cp.screenshot)&&cp.screenshot.endsWith('-'+cp.checkpoint.replaceAll(' ','-')+'.png')&&
          /^[a-f0-9]{64}$/.test(cp.screenshotSha256))) return null;
    if (dir&&!cps.every(cp=>screenshotIsBound(cp,dir))) return null;
    return cps;
  });
}
export function requireEarlyWizardRevealStops(bundle) {
  if (earlyGroups(bundle).some(x=>!x)) {
    throw new Error('iOS wizard capture: missing, repeated or out-of-order same-state reveal stops');
  }
}
function sceneSignature(cp) {
  // The pinned title carries non-personal wizard state even if Maestro doesn't emit offscreen
  // controls. Any stable control captured in both stops must also retain its text/action state.
  const marker=cp.nodes.filter(n=>/^wizard-scene-\d+-\d+-2-\d+$/.test(n.id) && n.meta?.resourceId===n.id);
  if(marker.length!==1)return null;
  const controls=cp.nodes.filter(n=>NAMED.test(n.id)&&n.meta?.resourceId===n.id);
  if(new Set(controls.map(n=>n.id)).size!==controls.length)return null;
  return {marker:marker[0].id,controls};
}
function sameScene(a,b) {
  return b && a.marker===b.marker &&
    a.controls.every(n=>!b.controls.some(x=>x.id===n.id&&!same(n,x)));
}

export function wizardScrollCoverage(bundle,expect={}) {
  const proved=new Map();
  // Legacy captures and nonwizard/profile runs retain every original finding.
  if (!expect.evidenceDir || !expect.sourceSha || !expect.profile || !expect.buildHash) return proved;
  const stops=bundle.checkpoints.filter(cp=>cp.flow==='new-contest'&&STOPS.has(cp.checkpoint));
  let groups=[];
  try {
    verifyIOSWizard(bundle,{sourceSha:expect.sourceSha,profileId:expect.profile,buildHash:expect.buildHash});
    const dir=realpathSync(expect.evidenceDir);
    const entry=bundle.checkpoints.find(cp=>cp.flow==='new-contest'&&cp.checkpoint==='name entry');
    if (![entry,...stops].every(cp=>screenshotIsBound(cp,dir))) return proved;
    groups=earlyGroups(bundle,dir).filter(Boolean);
  } catch {
    return proved; // missing, tampered or incompatible evidence grants no exception
  }
  for(const [siblings,early] of [[stops,false],...groups.map(group=>[group,true])]) for(const cp of siblings) {
    const state=early?sceneSignature(cp):null;
    if (early&&!state) continue;
    const anchorId=early?'contest-step-setup':'wizard-player-row-4';
    const safe=safety(cp);
    const anchor=sole(cp,anchorId);
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
      for(const reveal of siblings) {
        if (reveal===cp || reveal.screenshotSha256===cp.screenshotSha256) continue;
        if (early && (!sameScene(state,sceneSignature(reveal)) || reveal.context.measuredKeyboardInset!==cp.context.measuredKeyboardInset)) continue;
        const b=sole(reveal,node.id), nextAnchor=sole(reveal,anchorId);
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
