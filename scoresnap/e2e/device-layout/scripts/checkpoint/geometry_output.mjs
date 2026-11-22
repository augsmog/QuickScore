// Actual Android capture -> unchanged device-layout/v1 validator. No synthetic
// geometry, no clipboard, no scene aliases for checkpoints not actually exercised.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {normalizeMaestroHierarchy} from '../../lib/normalize-maestro.mjs';
import {expectedFlows,configSha256,validateBundle} from '../../run-geometry.mjs';
const HERE=dirname(fileURLToPath(import.meta.url)), GATE=resolve(HERE,'../..');
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const requireThat=(ok,reason)=>{if(!ok)throw Error(reason);};
// Only these scene guards prove these declared checkpoints. Pricing fragments,
// four-player setup, offline Home, etc. never impersonate the missing full flows.
const SCENES=new Set(['retained-eight-rounds','retained-eight-teams',...Array.from({length:8},(_,i)=>'retained-player-'+i),'teams-off','teams-on','stress-eight-rounds','stress-eight-teams','start-viability',...Array.from({length:8},(_,i)=>'player-state-'+i),'name-keyboard','home','setup-initial','setup','rounds','rounds-2','rounds-3','rounds-4','players-end','games','round-settings','paywall-top','paywall-free','paywall-annual','paywall-disabled']);
const MAP={'name-keyboard':['new-contest','name entry (keyboard up)'],'setup-initial':['new-contest','empty wizard'],rounds:['new-contest','multi-day on'],'players-end':['new-contest','last player above footer']};
export function convertCapture(receipt,projection,image,input,profile,config){
 requireThat(SCENES.has(receipt.scene),'unknown-scene');
 const b=input.binding,p=config.profiles.find(x=>x.id===profile);
 requireThat(p?.platform==='android','profile');
 for(const k of ['source_sha','source_tree','apk_sha256'])requireThat(receipt[k]===b[k],'stale-'+k);
 requireThat(input.source.checkoutSha===b.source_sha && input.source.checkoutTree===b.source_tree,'checkout-binding');
 requireThat(/^[0-9a-f]{40}$/.test(b.source_sha)&&/^[0-9a-f]{40}$/.test(b.source_tree)&&/^[0-9a-f]{64}$/.test(b.apk_sha256),'identity');
 requireThat(/^\d+$/.test(input.job.GITHUB_RUN_ID||'')&&/^\d+$/.test(input.job.GITHUB_RUN_ATTEMPT||'')&&/^[\w-]+$/.test(input.job.GITHUB_JOB||''),'job-binding');
 requireThat(sha(image)===receipt.screenshot_sha256,'screenshot-drift');
 requireThat(image.length>=24&&image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&image.readUInt32BE(16)===b.pixel_size[0]&&image.readUInt32BE(20)===b.pixel_size[1],'screenshot-dimensions');
 requireThat(JSON.stringify(receipt.job)===JSON.stringify(input.job)&&/^[0-9a-f]{64}$/.test(receipt.bootIdentitySha256||''),'capture-job-boot');
 requireThat(projection.rawHierarchySha256===receipt.hierarchy_sha256,'hierarchy-drift');
 const o=receipt.osBefore;
 requireThat(o && JSON.stringify(o)===JSON.stringify(receipt.osAfter),'observation-drift');
 requireThat(o.osScale===p.fontScale&&/^[0-9a-f]{64}$/.test(o.activityIdentitySha256||''),'scale-activity');
 requireThat(o.densityDpi===p.dpi && JSON.stringify(o.pixelSize)===JSON.stringify(b.pixel_size)&&JSON.stringify(receipt.pixel_size)===JSON.stringify(b.pixel_size),'viewport-density');
 requireThat(Array.isArray(projection.roots)&&projection.roots.length>0,'missing-tree');
 const density=o.densityDpi/160;
 const nodes=[];
 function normalize(root){
  // Reconstitute text ROLE only, not user text. Empty text remains explicitly
  // unmeasured for truncation; it cannot prove rule 3 or visual review.
  const meta={};
  function visit(n){
   requireThat(n&&n.attributes&&Array.isArray(n.children),'tree-shape');
   const a=n.attributes,id=a['resource-id'];
   requireThat(/^native-\d+$/.test(id),'node-id');
   meta[id]={meta:{sourceResourceId:n.sourceResourceId||'',textMeasurement:'UNAVAILABLE'}};
   if(n.hasText && a.clickable!=='true')meta[id].role='text';
   n.children.forEach(visit);
  }
  visit(root);
  nodes.push(...normalizeMaestroHierarchy(root,{density,resourceMeta:meta}));
 }
 projection.roots.forEach(normalize);
 requireThat(new Set(nodes.map(n=>n.id)).size===nodes.length,'duplicate-node');
 const [flow,checkpoint]=MAP[receipt.scene]||['supplemental',receipt.scene];
 const context={viewport:{width:o.pixelSize[0]/density,height:o.pixelSize[1]/density},fontScale:o.osScale};
 const inset=o.insets;
 if(inset!==undefined){
  requireThat(inset.provider==='aosp-api35-wms-client-insets/v1'&&inset.displayId===0&&/^[0-9a-f]{64}$/.test(inset.windowIdentitySha256||'')&&inset.activityIdentitySha256===o.activityIdentitySha256,'inset-identity');
  requireThat(JSON.stringify(inset.pixelSize)===JSON.stringify(o.pixelSize)&&inset.densityDpi===o.densityDpi&&inset.policy==='visible-edge-system-bars;zero-cutout;fullscreen-stable;ime-separate','inset-context');
  const derived={left:0,top:0,right:0,bottom:0},[w,h]=o.pixelSize;
  requireThat(Object.keys(inset.sources||{}).sort().join(',')==='ime,navigationBars,statusBars','inset-sources');
  for(const kind of ['statusBars','navigationBars','ime']){
   const s=inset.sources[kind];requireThat(typeof s.visible==='boolean'&&Array.isArray(s.frame)&&s.frame.length===4&&s.frame.every(Number.isInteger),'inset-frame');
   const [l,t,r,b]=s.frame;requireThat(0<=l&&l<=r&&r<=w&&0<=t&&t<=b&&b<=h,'inset-frame');
   if(!s.visible)continue;
   if(kind==='ime'){requireThat(l===0&&r===w&&0<t&&t<b&&b===h,'floating-ime');continue;}
   const edges=[];
   if(l===0&&r===w&&t===0&&0<b&&b<h)edges.push(['top',b]);
   if(l===0&&r===w&&b===h&&0<t&&t<h)edges.push(['bottom',h-t]);
   if(t===0&&b===h&&l===0&&0<r&&r<w)edges.push(['left',r]);
   if(t===0&&b===h&&r===w&&0<l&&l<w)edges.push(['right',w-l]);
   requireThat(edges.length===1,'nonedge-inset');const [edge,n]=edges[0];requireThat(['UNKNOWN',edge.toUpperCase()].includes(s.side),'inset-side');derived[edge]=Math.max(derived[edge],n/density);
  }
  requireThat(['left','top','right','bottom'].every(k=>inset.safeArea[k]===derived[k]&&o.safeArea[k]===derived[k]),'inset-derivation');
  const ime=inset.sources.ime;requireThat(inset.keyboard?.visible===ime.visible&&JSON.stringify(inset.keyboard.framePx)===JSON.stringify(ime.visible?ime.frame:null),'keyboard-binding');
  context.safeArea=derived;
 }else requireThat(o.safeArea===null||o.safeArea===undefined,'unsupported-inset-provider');
 if(receipt.scene==='name-keyboard'){
  const e=receipt.checkpointEvidence,k=inset?.keyboard;
  requireThat(e?.kind==='wizard-name-keyboard/v1'&&e.playerIndex===1&&e.focusedNameCount===1&&e.syntheticValueVerified===true&&e.sameFieldAnchorVerified===true&&k?.visible===true,'keyboard-checkpoint-proof');
  requireThat(JSON.stringify(e.keyboardFramePx)===JSON.stringify(k.framePx)&&Array.isArray(e.fieldFramePx)&&e.fieldFramePx.length===4&&e.fieldFramePx.every(Number.isInteger),'keyboard-frame-proof');
  const [l,t,r,b]=e.fieldFramePx;requireThat(0<=l&&l<r&&r<=o.pixelSize[0]&&0<=t&&t<b&&b<=k.framePx[1],'keyboard-field-occluded');
  const focused=nodes.filter(n=>n.focused);requireThat(focused.length===1&&JSON.stringify(focused[0].bbox)===JSON.stringify({left:l/density,top:t/density,right:r/density,bottom:b/density}),'keyboard-focused-node');
 }
 const footer=nodes.filter(n=>n.meta.sourceResourceId==='contest-footer');
 if(footer.length===1)context.footer=footer[0].bbox;
 return {flow,checkpoint,screen:receipt.scene,deviceId:profile,state:receipt.scene,platform:'android',context,nodes,screenshotSha256:receipt.screenshot_sha256,
  provenance:{...input.source,job:input.job,captureMonotonicNs:receipt.captureMonotonicNs,bootIdentitySha256:receipt.bootIdentitySha256,checkpointEvidence:receipt.checkpointEvidence,imageObservation:receipt.rounds_observation,hierarchySha256:receipt.hierarchy_sha256,geometrySha256:receipt.geometry_sha256,osObservation:o,initializedRNScale:'UNOBSERVED',keyboard:inset?.keyboard||'UNOBSERVED',textMetrics:'UNOBSERVED'}};
}
export function aggregate(checkpoints){
 const group=(names,flow,checkpoint,verify)=>{
  const members=names.map(name=>checkpoints.filter(c=>c.screen===name));
  if(members.some(x=>x.length!==1))return;
  const cs=members.map(x=>x[0]),base=cs[0].provenance;
  requireThat(cs.every((c,i)=>Number.isSafeInteger(c.provenance.captureMonotonicNs)&&c.provenance.captureMonotonicNs>0&&(!i||c.provenance.captureMonotonicNs>cs[i-1].provenance.captureMonotonicNs)&&c.provenance.bootIdentitySha256===base.bootIdentitySha256),'aggregate-order-identity');
  requireThat(verify(cs),'aggregate-state');
  const last=cs.at(-1);last.flow=flow;last.checkpoint=checkpoint;
  last.provenance.aggregateMembers=cs.map(c=>({screen:c.screen,screenshot:c.screenshot,screenshotSha256:c.screenshotSha256,hierarchySha256:c.provenance.hierarchySha256,captureMonotonicNs:c.provenance.captureMonotonicNs}));
 };
 const image=(c)=>{const p=c.provenance.imageObservation;return p&&p.pngSha256===c.screenshotSha256&&p.hierarchySha256===c.provenance.hierarchySha256?p:null;};
 group(['rounds-2','rounds-3','rounds-4'],'new-contest','rounds 2/3/4 (scrolled)',cs=>cs.every((c,i)=>image(c)?.selectedCount===i+2&&image(c).method==='exact-source-border-and-fill'));
 group(['teams-off','teams-on'],'new-contest','team off/on',cs=>cs.every((c,i)=>c.provenance.checkpointEvidence?.kind==='team-state/v1'&&c.provenance.checkpointEvidence.checked===!!i&&c.nodes.filter(n=>n.meta?.sourceResourceId==='team-mode').length===1&&c.nodes.find(n=>n.meta?.sourceResourceId==='team-mode').checked===!!i));
 const first=checkpoints.find(c=>c.screen==='player-state-1');
 if(first){requireThat(image(first)?.playerIndex===1&&image(first).selectedTeam==='B'&&image(first).hcpValue===0&&image(first).method==='exact-chip-fill','chip-state');first.flow='new-contest';first.checkpoint='player card A/B chips + HCP';}
 group([...Array.from({length:8},(_,i)=>'player-state-'+i),'stress-eight-rounds','stress-eight-teams'],'new-contest','combined stress (multi-day+teams+8 players)',cs=>cs.slice(0,8).every((c,i)=>image(c)?.playerIndex===i&&image(c).selectedTeam===(i%2?'B':'A')&&image(c).hcpValue===0&&image(c).method==='exact-chip-fill')&&image(cs[8])?.selectedCount===4&&image(cs[8]).method==='exact-source-border-and-fill'&&cs[9].provenance.checkpointEvidence?.kind==='stress-top/v1'&&cs[9].provenance.checkpointEvidence.readyPlayers===8&&cs[9].provenance.checkpointEvidence.teams===true);
}
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):e.name==='receipt.json'?[join(dir,e.name)]:[]);}
export function produce(out,input){
 const configText=readFileSync(join(GATE,'config/device-layout.config.json'),'utf8'),config=JSON.parse(configText),results=[];
 const captures=files(out); // collect BEFORE writing output directories
 for(const profile of ['android-compact','android-compact-large-text']){
  const lane=join(out,'geometry',profile);mkdirSync(lane,{recursive:true});
  const bundle={schema:'device-layout/v1',sourceSha:input.binding.source_sha,buildHash:input.binding.apk_sha256,profile,platform:'android',configSha256:configSha256(configText),checkpoints:[]};
  const rejected=[];let index=0;
  for(const file of captures){
   let r;try{r=read(file);}catch{rejected.push('receipt-unreadable');continue;}
   if(r.osBefore?.osScale!==config.profiles.find(p=>p.id===profile).fontScale)continue;
   try{
    const dir=dirname(file),bytes=readFileSync(join(dir,'geometry.json'));
    requireThat(sha(bytes)===r.geometry_sha256,'projection-drift');
    const image=readFileSync(join(dir,'capture.png'));
    const cp=convertCapture(r,JSON.parse(bytes),image,input,profile,config);
    requireThat(!bundle.checkpoints.some(x=>x.flow===cp.flow&&x.checkpoint===cp.checkpoint),'duplicate-checkpoint');
    cp.screenshot=`capture-${index++}.png`;copyFileSync(join(dir,'capture.png'),join(lane,cp.screenshot));bundle.checkpoints.push(cp);
   }catch(e){rejected.push(['projection-drift','screenshot-drift','hierarchy-drift','observation-drift','scale-activity','viewport-density','duplicate-checkpoint','unsupported-inset-provider'].includes(e.message)?e.message:'capture-binding-invalid');}
  }
  try{aggregate(bundle.checkpoints);}catch{rejected.push('aggregate-state-or-order-invalid');}
  writeFileSync(join(lane,'bundle.json'),JSON.stringify(bundle,null,2)+'\n');
  const expect={sourceSha:bundle.sourceSha,buildHash:bundle.buildHash,profile,configSha256:bundle.configSha256,config,flows:expectedFlows(config)};
  const validation=validateBundle(bundle,expect);
  const actual=spawnSync(process.execPath,[join(GATE,'run-geometry.mjs'),join(lane,'bundle.json'),'--expect-sha',bundle.sourceSha,'--expect-build',bundle.buildHash,'--profile',profile,'--out',join(lane,'geometry.json')],{encoding:'utf8',timeout:30000,maxBuffer:1e6});
  results.push({profile,captured:bundle.checkpoints.length,rejected,validation,exitCode:actual.status,status:actual.status===0&&!rejected.length?'GEOMETRY_PASS':'INCOMPLETE',missingMeasurements:[...(bundle.checkpoints.some(c=>!c.context.safeArea)?['safeArea']:[]),'keyboard-checkpoint','initializedRNScale','textMetrics'],requiredManifest:expectedFlows(config)});
 }
 const result={schema:'android-geometry-production/v1',source:input.source,job:input.job,lanes:results,nativeAcceptance:false};
 writeFileSync(join(out,'geometry-result.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=produce(resolve(process.argv[2]),read(process.argv[3]));process.exitCode=result.lanes.every(x=>x.status==='GEOMETRY_PASS')?0:1;}
 catch{process.exitCode=1;}
}
