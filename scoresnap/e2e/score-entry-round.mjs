/** Strict acceptance contract for automated native score-entry observations.
 * Input is measured by the E2E system; this module never fabricates observations.
 */
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const IDS=['score-minus-Ava','score-par-Ava','score-plus-Ava','score-minus-Ben','score-par-Ben','score-plus-Ben','score-prev-hole','score-next-hole'];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function luminance(hex){
 if(typeof hex!=='string'||!/^#[\da-f]{6}$/i.test(hex))return NaN;
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
export function validateRoundMetrics(r){
 const errors=[];const check=(ok,why)=>{if(!ok)errors.push(why);};
 check(r?.schema==='snapscore-score-entry/1','schema');
 check(r?.synthetic!==true,'synthetic observations are not acceptance evidence');
 check(typeof r?.sourceSha==='string'&&/^[\da-f]{40}$/i.test(r.sourceSha),'sourceSha');
 check(typeof r?.runId==='string'&&r.runId.length>0,'runId');
 check(typeof r?.device==='string'&&r.device.length>0,'device');
 check(['small','large'].includes(r?.profile),'profile');
 const v=r?.viewport;
 check(finite(v?.width)&&finite(v?.height)&&v.width>0&&v.height>0,'viewport');
 check(r?.profile==='small'?v?.width<=375:v?.width>=430,'profile viewport size');
 check(Array.isArray(r?.holes)&&r.holes.length===18,'18 hole observations required');
 let taps=0,corrections=0,minTarget=Infinity,minContrast=Infinity;
 for(const [i,h] of (Array.isArray(r?.holes)?r.holes:[]).entries()){
  const tag=`hole ${i+1}`;
  check(h?.hole===i+1,`${tag}: sequence`);
  for(const field of ['taps','corrections'])check(Number.isInteger(h?.[field])&&h[field]>=0,`${tag}: ${field}`);
  check(h?.taps>=2+h?.corrections+(i<17?1:0),`${tag}: observed tap count`);
  taps+=h?.taps||0;corrections+=h?.corrections||0;
  for(const field of ['screenshot','hierarchy'])check(typeof h?.[field]==='string'&&h[field].length>0,`${tag}: ${field}`);
  const targets=Array.isArray(h?.targets)?h.targets:[];
  check(targets.length===IDS.length&&new Set(targets.map(t=>t?.id)).size===IDS.length&&IDS.every(id=>targets.some(t=>t?.id===id)),`${tag}: target coverage`);
  for(const t of targets){
   check(['x','y','width','height'].every(k=>finite(t?.[k]))&&t.x>=0&&t.y>=0&&t.width>=56&&t.height>=56&&t.x+t.width<=v?.width&&t.y+t.height<=v?.height,`${tag}: target geometry ${t?.id}`);
   minTarget=Math.min(minTarget,t?.width,t?.height);
  }
  check(h?.navigation?.previousVisible===true&&h?.navigation?.nextVisible===true,`${tag}: reachable navigation`);
  check(h?.navigation?.nextOutcome===(i<17?i+2:18),`${tag}: Next outcome`);
  const c=h?.contrast,a=luminance(c?.foreground),b=luminance(c?.background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  check(c?.method==='screenshot-sampled'&&typeof c?.artifact==='string'&&c.artifact.length>0&&finite(ratio)&&ratio>=4.5,`${tag}: measured contrast`);
  minContrast=Math.min(minContrast,ratio);
 }
 check(r?.finalized===true&&typeof r?.finalizeArtifact==='string'&&r.finalizeArtifact.length>0,'observed finalization');
 return {schema:'snapscore-score-entry-report/1',status:errors.length?'failed':'passed',sourceSha:r?.sourceSha,profile:r?.profile,taps,corrections,minTargetPt:finite(minTarget)?minTarget:null,minContrast:finite(minContrast)?minContrast:null,errors};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=validateRoundMetrics(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='passed'?0:1;}
 catch(e){console.error(`Invalid observation file: ${e.message}`);process.exitCode=1;}
}
