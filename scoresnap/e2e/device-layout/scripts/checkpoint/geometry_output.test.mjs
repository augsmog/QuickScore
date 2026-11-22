import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {deflateSync} from 'node:zlib';
import {convertCapture,produce,aggregate} from './geometry_output.mjs';
const config=JSON.parse(readFileSync(new URL('../../config/device-layout.config.json',import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(scale=1){
 const crc=b=>{let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const t=Buffer.from(type),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(data.length);c.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([n,t,data,c]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1080);ihdr.writeUInt32BE(2400,4);ihdr[8]=8;ihdr[9]=2;
 const image=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.alloc(2400*(1+1080*3)))),chunk('IEND',Buffer.alloc(0))]);
 const job={GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_JOB:'synthetic_control'};
 const binding={source_sha:'a'.repeat(40),source_tree:'b'.repeat(40),apk_sha256:'c'.repeat(64),pixel_size:[1080,2400]};
 const input={binding,source:{checkoutSha:binding.source_sha,checkoutTree:binding.source_tree},job};
 const o={osScale:scale,activityIdentitySha256:'d'.repeat(64),densityDpi:480,pixelSize:[1080,2400],safeArea:null,runtimeRNScale:null};
 const projection={rawHierarchySha256:'e'.repeat(64),roots:[{attributes:{'resource-id':'native-1',bounds:'[0,0][1080,2400]',scrollable:'true'},children:[{attributes:{'resource-id':'native-2',bounds:'[30,60][330,210]',clickable:'true'},hasText:true,children:[]}]}]};
 const r={...binding,job,bootIdentitySha256:'f'.repeat(64),scene:'setup-initial',osBefore:o,osAfter:structuredClone(o),screenshot_sha256:hash(image),hierarchy_sha256:projection.rawHierarchySha256,geometry_sha256:hash(JSON.stringify(projection))};return {r,projection,image,input};
}
test('both scales normalize exact measured bounds and preserve unknown measurements',()=>{for(const scale of [1,1.3]){const f=fixture(scale),cp=convertCapture(f.r,f.projection,f.image,f.input,scale===1?'android-compact':'android-compact-large-text',config);assert.deepEqual(cp.nodes[1].bbox,{left:10,top:20,right:110,bottom:70});assert.equal(cp.checkpoint,'empty wizard');assert.equal(cp.context.safeArea,undefined);assert.equal(cp.provenance.initializedRNScale,'UNOBSERVED');}});
test('stale source/tree/APK, wrong scale, changed hierarchy/image/job and invented inset reject',()=>{
 for(const mutate of [f=>f.r.source_sha='9'.repeat(40),f=>f.r.source_tree='9'.repeat(40),f=>f.r.apk_sha256='9'.repeat(64),f=>f.r.osAfter.osScale=1.3,f=>f.projection.rawHierarchySha256='0'.repeat(64),f=>f.image[0]=0,f=>f.r.job={},f=>{f.r.osBefore.safeArea={top:0,bottom:0,left:0,right:0};f.r.osAfter=structuredClone(f.r.osBefore);}]){const f=fixture();mutate(f);assert.throws(()=>convertCapture(f.r,f.projection,f.image,f.input,'android-compact',config));}
});
test('real downstream CLI writes both lane files and rejects partial captures with exact missing manifest',()=>{
 const out=mkdtempSync(join(tmpdir(),'geometry-control-'));try{
  const f=fixture();const p=join(out,'synthetic');mkdirSync(p);writeFileSync(join(p,'receipt.json'),JSON.stringify(f.r));writeFileSync(join(p,'geometry.json'),JSON.stringify(f.projection));writeFileSync(join(p,'capture.png'),f.image);
  const result=produce(out,f.input);assert.equal(result.nativeAcceptance,false);assert.equal(result.lanes.length,2);
  assert.equal(result.lanes[0].captured,1);assert.equal(result.lanes[1].captured,0);
  for(const lane of result.lanes){assert.equal(lane.exitCode,1);assert.equal(lane.status,'INCOMPLETE');const actual=JSON.parse(readFileSync(join(out,'geometry',lane.profile,'geometry.json')));assert.equal(actual.ok,false);}
  assert.match(JSON.stringify(result),/keyboard/);assert.match(JSON.stringify(result.lanes[0].validation),/safeArea/);
 }finally{rmSync(out,{recursive:true,force:true});}
});
test('projection hash drift is not admitted to any checkpoint',()=>{const out=mkdtempSync(join(tmpdir(),'geometry-control-'));try{const f=fixture(),p=join(out,'synthetic');mkdirSync(p);writeFileSync(join(p,'receipt.json'),JSON.stringify(f.r));writeFileSync(join(p,'geometry.json'),'{}');writeFileSync(join(p,'capture.png'),f.image);const result=produce(out,f.input);assert.equal(result.lanes[0].captured,0);assert.deepEqual(result.lanes[0].rejected,['projection-drift']);}finally{rmSync(out,{recursive:true,force:true});}});

test('actual parser output supplies safe area, keeps IME separate and does not complete required flows',()=>{
 const here=new URL('.',import.meta.url).pathname;
 const parsed=spawnSync('python3',['-B','-c',"import json;from test_android_insets import fixtures;from android_insets import observe;print(json.dumps(observe(*fixtures(True),[1080,2400],480)))"],{cwd:here,encoding:'utf8'});
 assert.equal(parsed.status,0);const inset=JSON.parse(parsed.stdout),f=fixture();
 f.r.osBefore.activityIdentitySha256=inset.activityIdentitySha256;f.r.osBefore.insets=inset;f.r.osBefore.safeArea=inset.safeArea;f.r.osAfter=structuredClone(f.r.osBefore);
 const cp=convertCapture(f.r,f.projection,f.image,f.input,'android-compact',config);
 assert.deepEqual(cp.context.safeArea,{left:0,top:24,right:0,bottom:24});assert.equal(cp.provenance.keyboard.visible,true);assert.equal(cp.context.safeArea.bottom,24);
 for(const mutate of [x=>x.safeArea.top=0,x=>x.sources.ime.frame=[10,1500,1000,2400],x=>x.keyboard.visible=false,x=>x.activityIdentitySha256='0'.repeat(64)]){
  const g=structuredClone(f);mutate(g.r.osBefore.insets);g.r.osAfter=structuredClone(g.r.osBefore);
  assert.throws(()=>convertCapture(g.r,g.projection,f.image,g.input,'android-compact',config));
 }
 const out=mkdtempSync(join(tmpdir(),'inset-control-'));try{const p=join(out,'synthetic');mkdirSync(p);writeFileSync(join(p,'receipt.json'),JSON.stringify(f.r));writeFileSync(join(p,'geometry.json'),JSON.stringify(f.projection));writeFileSync(join(p,'capture.png'),f.image);const result=produce(out,f.input);assert.equal(result.lanes[0].captured,1);assert.equal(result.lanes[0].exitCode,1);assert.doesNotMatch(JSON.stringify(result.lanes[0].validation),/missing measured context.safeArea/);assert.match(JSON.stringify(result.lanes[0].validation),/missing checkpoint/);}finally{rmSync(out,{recursive:true,force:true});}
});

test('keyboard checkpoint mapping requires measured visible IME and a matching focused normalized node',()=>{
 const p=spawnSync('python3',['-B','-c',"import json;from test_android_insets import fixtures;from android_insets import observe;print(json.dumps(observe(*fixtures(True),[1080,2400],480)))"],{cwd:new URL('.',import.meta.url).pathname,encoding:'utf8'});assert.equal(p.status,0);
 const f=fixture(),inset=JSON.parse(p.stdout);f.r.scene='name-keyboard';f.r.osBefore.insets=inset;f.r.osBefore.safeArea=inset.safeArea;f.r.osBefore.activityIdentitySha256=inset.activityIdentitySha256;f.r.osAfter=structuredClone(f.r.osBefore);f.projection.roots[0].children[0].attributes.focused='true';
 f.r.checkpointEvidence={kind:'wizard-name-keyboard/v1',playerIndex:1,focusedNameCount:1,syntheticValueVerified:true,sameFieldAnchorVerified:true,fieldFramePx:[30,60,330,210],keyboardFramePx:[0,1500,1080,2400]};
 assert.equal(convertCapture(f.r,f.projection,f.image,f.input,'android-compact',config).checkpoint,'name entry (keyboard up)');
 for(const change of [g=>delete g.r.checkpointEvidence,g=>g.r.checkpointEvidence.focusedNameCount=2,g=>g.r.checkpointEvidence.fieldFramePx=[30,60,330,1600],g=>g.projection.roots[0].children[0].attributes.focused='false',g=>{g.r.osBefore.insets.keyboard.visible=false;g.r.osAfter=structuredClone(g.r.osBefore);}]){const g=structuredClone(f);change(g);assert.throws(()=>convertCapture(g.r,g.projection,f.image,g.input,'android-compact',config));}
});

function groupFixture(){
 let seq=0;const cp=(screen,extra={})=>({screen,nodes:[],screenshot:screen+'.png',screenshotSha256:'a'.repeat(64),flow:'supplemental',checkpoint:screen,provenance:{captureMonotonicNs:++seq,bootIdentitySha256:'b'.repeat(64),hierarchySha256:'c'.repeat(64),...extra}});
 const im=(extra)=>({pngSha256:'a'.repeat(64),hierarchySha256:'c'.repeat(64),...extra});
 return [2,3,4].map(n=>cp('rounds-'+n,{imageObservation:im({method:'exact-source-border-and-fill',selectedCount:n})})).concat([false,true].map(v=>{const c=cp(v?'teams-on':'teams-off',{checkpointEvidence:{kind:'team-state/v1',checked:v}});c.nodes=[{checked:v,meta:{sourceResourceId:'team-mode'}}];return c;}),Array.from({length:8},(_,i)=>cp('player-state-'+i,{imageObservation:im({method:'exact-chip-fill',playerIndex:i,selectedTeam:i%2?'B':'A',hcpValue:0})})),cp('stress-eight-rounds',{imageObservation:im({method:'exact-source-border-and-fill',selectedCount:4})}),cp('stress-eight-teams',{checkpointEvidence:{kind:'stress-top/v1',readyPlayers:8,teams:true}}));
}
test('round/team/eight-player aggregates require every observed state and ordered same-boot captures',()=>{
 const cs=groupFixture();aggregate(cs);for(const name of ['rounds 2/3/4 (scrolled)','team off/on','player card A/B chips + HCP','combined stress (multi-day+teams+8 players)'])assert.ok(cs.some(c=>c.checkpoint===name));
 for(const mutate of [cs=>cs[1].provenance.imageObservation.selectedCount=2,cs=>cs[2].provenance.captureMonotonicNs=1,cs=>cs[4].nodes[0].checked=false,cs=>cs[7].provenance.imageObservation.hcpValue=5,cs=>cs[10].provenance.bootIdentitySha256='x',cs=>cs.at(-1).provenance.checkpointEvidence.readyPlayers=4,cs=>cs[0].provenance.imageObservation.pngSha256='stale']){const x=groupFixture();mutate(x);assert.throws(()=>aggregate(x));}
 const partial=groupFixture().filter(c=>c.screen!=='player-state-7');aggregate(partial);assert.ok(!partial.some(c=>c.checkpoint==='combined stress (multi-day+teams+8 players)'));
});
