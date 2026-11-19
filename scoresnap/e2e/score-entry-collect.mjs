/** Native E2E collector. Pure parsers are tested on the box; run() is macOS-only automation. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateRoundMetrics} from './score-entry-round.mjs';
const require=createRequire(import.meta.url),yaml=require('js-yaml'),{PNG}=require('pngjs');
const IDS=['score-minus-Ava','score-par-Ava','score-plus-Ava','score-minus-Ben','score-par-Ben','score-plus-Ben','score-prev-hole','score-next-hole'];
export function splitPhases(steps){
 const phases=[];let start=0;
 for(let i=0;i<steps.length;i++)if(/^aug-325-\d\d-hole-scored$/.test(steps[i]?.takeScreenshot??'')){phases.push(steps.slice(start,i+1));start=i+1;}
 if(phases.length!==18||start===steps.length)throw Error('expected18 scored captures plus finalization');
 phases.push(steps.slice(start));return phases;
}
export function observedActions(commands){
 if(!Array.isArray(commands))throw Error('missing commands');
 const result={scoreTaps:0,corrections:0,nextTaps:0};
 for(const c of commands){
  if(c?.metadata?.status!=='COMPLETED')continue;
  const id=(c.metadata.evaluatedCommand??c.command)?.tapOnElement?.selector?.idRegex;
  if(/^score-(par|minus|plus)-(Ava|Ben)$/.test(id??''))result.scoreTaps++;
  if(/^score-(minus|plus)-(Ava|Ben)$/.test(id??''))result.corrections++;
  if(id==='score-next-hole')result.nextTaps++;
 }
 return result;
}
function walk(tree){return [tree,...(tree?.children??[]).flatMap(walk)];}
function bounds(value){
 const m=/^\[(-?[\d.]+),(-?[\d.]+)\]\[(-?[\d.]+),(-?[\d.]+)\]$/.exec(value??'');
 if(!m)throw Error('invalid hierarchy bounds');const [x,y,right,bottom]=m.slice(1).map(Number);return {x,y,width:right-x,height:bottom-y};
}
export function readTargets(tree){
 const nodes=walk(tree);
 return IDS.map(id=>{const matches=nodes.filter(n=>n?.attributes?.['resource-id']===id);if(matches.length!==1)throw Error(`missing/ambiguous target ${id}`);return {id,...bounds(matches[0].attributes.bounds)};});
}
function luma(hex){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
export function sampleContrast(bytes,frame,viewport){
 const png=PNG.sync.read(bytes),sx=png.width/viewport.width,sy=png.height/viewport.height;
 if(!Number.isFinite(sx)||sx<=0||Math.abs(sx-sy)>.02)throw Error('screenshot/viewport scale mismatch');
 // Exclude rounded border: sample the navigation label/icon's interior, not another control.
 const x0=Math.ceil((frame.x+8)*sx),x1=Math.floor((frame.x+frame.width-8)*sx);
 const y0=Math.ceil((frame.y+8)*sy),y1=Math.floor((frame.y+frame.height-8)*sy);
 if(x0<0||y0<0||x1>png.width||y1>png.height||x1<=x0||y1<=y0)throw Error('contrast region outside screenshot');
 const colors=new Map();
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*png.width+x)*4;if(png.data[i+3]!==255)throw Error('transparent screenshot');const hex='#'+[0,1,2].map(j=>png.data[i+j].toString(16).padStart(2,'0')).join('');colors.set(hex,(colors.get(hex)??0)+1);}
 const ranked=[...colors].sort((a,b)=>b[1]-a[1]),background=ranked[0]?.[0];
 // Most frequent contrasting interior color, rather than brightest isolated pixel.
 const foreground=ranked.find(([hex,count])=>count>=3&&Math.abs(luma(hex)-luma(background))>=.05)?.[0];
 if(!foreground)throw Error('no measured foreground in navigation region');
 return {foreground,background,ratio:(Math.max(luma(foreground),luma(background))+.05)/(Math.min(luma(foreground),luma(background))+.05),method:'screenshot-sampled',region:{x:x0,y:y0,width:x1-x0,height:y1-y0},pixelCounts:Object.fromEntries(ranked.slice(0,8))};
}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
function currentHole(tree){
 const holes=new Set(walk(tree).flatMap(n=>Object.values(n?.attributes??{}).filter(v=>typeof v==='string').flatMap(v=>[...v.matchAll(/\bHOLE\s+0?(\d{1,2})\b/g)].map(m=>Number(m[1])))));
 if(holes.size!==1)throw Error('missing/ambiguous current hole');return [...holes][0];
}
export function run({root,out,device,profile,sourceSha,runId},execute=execFileSync){
 if(!['small','large'].includes(profile)||!device||!runId||!/^[\da-f]{40}$/i.test(sourceSha??''))throw Error('profile/device/runId/sourceSha required');
 out=path.resolve(out);root=path.resolve(root);fs.mkdirSync(out,{recursive:true});
 const [header,steps]=yaml.loadAll(fs.readFileSync(path.join(root,'.maestro/flows/offline/aug-325-score-entry.yaml'),'utf8'));
 const phases=splitPhases(steps),holes=[];let viewport,finalized=false;const actions=[];
 for(let i=0;i<phases.length;i++){
  const dir=path.join(out,`phase-${String(i+1).padStart(2,'0')}`);fs.mkdirSync(dir);
  // Absolute subflow paths preserve their own relative nested runFlow resolution.
  const commands=phases[i].map(s=>typeof s.runFlow==='string'?{...s,runFlow:path.resolve(root,'.maestro/flows/offline',s.runFlow)}:s);
  const flow=path.join(dir,'flow.yaml');fs.writeFileSync(flow,yaml.dump(header)+'---\n'+yaml.dump(commands));
  execute('maestro',['--device',device,'test','--format','junit','--output',path.join(dir,'junit.xml'),'--test-output-dir',dir,'--debug-output',path.join(dir,'debug'),flow],{stdio:'pipe'});
  const logs=files(dir).filter(f=>path.basename(f)==='commands.json');
  if(logs.length!==1)throw Error(`expected one command trace for phase ${i+1}`);
  actions.push(observedActions(JSON.parse(fs.readFileSync(logs[0],'utf8'))));
  const hierarchyPath=path.join(dir,'hierarchy.json');fs.writeFileSync(hierarchyPath,execute('maestro',['--device',device,'hierarchy'],{encoding:'utf8'}));
  const hierarchy=JSON.parse(fs.readFileSync(hierarchyPath,'utf8'));
  const screenshot=path.join(out,`aug-325-${String(i+1).padStart(2,'0')}-measured.png`);execute('xcrun',['simctl','io',device,'screenshot',screenshot],{stdio:'pipe'});
  if(i===18){finalized=walk(hierarchy).some(n=>Object.values(n?.attributes??{}).some(v=>typeof v==='string'&&v.includes('Round Finalized')));continue;}
  const app=bounds(hierarchy.children?.[0]?.attributes?.bounds);if(app.x!==0||app.y!==0)throw Error('unexpected app viewport');
  if(viewport&&(viewport.width!==app.width||viewport.height!==app.height))throw Error('viewport changed mid-round');viewport={width:app.width,height:app.height};
  if(currentHole(hierarchy)!==i+1)throw Error(`wrong observed hole for phase ${i+1}`);
  const targets=readTargets(hierarchy),bytes=fs.readFileSync(screenshot);
  const samples=targets.filter(t=>['score-prev-hole','score-next-hole'].includes(t.id)).map(t=>({id:t.id,...sampleContrast(bytes,t,viewport)}));
  const contrastArtifact=path.join(dir,'contrast.json');fs.writeFileSync(contrastArtifact,JSON.stringify({screenshotSha256:createHash('sha256').update(bytes).digest('hex'),samples},null,2));
  const worst=[...samples].sort((a,b)=>a.ratio-b.ratio)[0];
  holes.push({hole:i+1,taps:actions[i].scoreTaps,corrections:actions[i].corrections,screenshot:path.relative(out,screenshot),hierarchy:path.relative(out,hierarchyPath),targets,navigation:{previousVisible:true,nextVisible:true,nextOutcome:null},contrast:{...worst,artifact:path.relative(out,contrastArtifact)}});
 }
 // Each phase begins with the previous hole's successful Next event; the last stage presses the18 boundary.
 for(let i=0;i<18;i++){if(actions[i+1].nextTaps!==1)throw Error(`missing/duplicate observed Next for hole ${i+1}`);holes[i].taps+=actions[i+1].nextTaps;holes[i].navigation.nextOutcome=i<17?holes[i+1].hole:18;}
 const r={schema:'snapscore-score-entry/1',sourceSha,runId,profile,device,viewport,holes,finalized,finalizeArtifact:'aug-325-19-measured.png'};
 fs.writeFileSync(path.join(out,'observations.json'),JSON.stringify(r,null,2));
 const report=validateRoundMetrics(r);fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const [root,out,device,profile,sourceSha,runId]=process.argv.slice(2);const result=run({root,out,device,profile,sourceSha,runId});console.log(JSON.stringify(result));process.exitCode=result.status==='passed'?0:1;}
 catch(e){console.error(`Score-entry collection failed: ${e.message}`);process.exitCode=1;}
}
