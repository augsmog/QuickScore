import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {splitPhases,observedActions,readTargets,sampleContrast} from './score-entry-collect.mjs';
const require=createRequire(import.meta.url);const {PNG}=require('pngjs');
test('phase splitter captures18 scored holes and one final stage without losing commands',()=>{
 const steps=[];for(let i=1;i<=18;i++){steps.push({tapOn:{id:'score-par-Ava'}},{takeScreenshot:`aug-325-${String(i).padStart(2,'0')}-hole-scored`});}steps.push({tapOn:'Finalize'});
 const phases=splitPhases(steps);assert.equal(phases.length,19);assert.deepEqual(phases.flat(),steps);
 assert.throws(()=>splitPhases(steps.slice(2)),/18/);
});
test('counts only actual completed score/navigation taps, preserving corrections',()=>{
 const command=(id,status='COMPLETED')=>({command:{tapOnElement:{selector:{idRegex:id}}},metadata:{status}});
 assert.deepEqual(observedActions([command('home-new-contest'),command('score-par-Ava'),command('score-plus-Ben'),command('score-next-hole'),command('score-par-Ben','FAILED')]),{scoreTaps:2,corrections:1,nextTaps:1});
 assert.throws(()=>observedActions(null),/commands/);
});
test('geometry comes from actual Maestro point bounds and rejects missing/duplicate ids',()=>{
 const ids=['score-minus-Ava','score-par-Ava','score-plus-Ava','score-minus-Ben','score-par-Ben','score-plus-Ben','score-prev-hole','score-next-hole'];
 const tree={children:ids.map(id=>({attributes:{'resource-id':id,bounds:'[10,20][66,76]'}}))};
 assert.equal(readTargets(tree)[0].width,56);tree.children.pop();assert.throws(()=>readTargets(tree),/target/);
 tree.children.push(tree.children[0]);assert.throws(()=>readTargets(tree),/target/);
});
test('contrast reads screenshot pixels and rejects flat/missing text instead of using source colors',()=>{
 const image=new PNG({width:100,height:100});image.data.fill(255);
 for(let y=20;y<40;y++)for(let x=20;x<40;x++){const at=(y*100+x)*4;image.data[at]=image.data[at+1]=image.data[at+2]=0;}
 const c=sampleContrast(PNG.sync.write(image),{x:0,y:0,width:100,height:100},{width:100,height:100});
 assert.equal(c.ratio,21);assert.equal(c.method,'screenshot-sampled');
 image.data.fill(255);assert.throws(()=>sampleContrast(PNG.sync.write(image),{x:0,y:0,width:100,height:100},{width:100,height:100}),/foreground/);
});

test('native driver integrates19 automated phases into measured receipts without using YAML tap counts',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const {run}=await import('./score-entry-collect.mjs');const yaml=require('js-yaml');
 const root=path.resolve(new URL('../../',import.meta.url).pathname),out=fs.mkdtempSync(path.join(os.tmpdir(),'score-entry-collect-'));
 let phase=0;
 const ids=['score-minus-Ava','score-par-Ava','score-plus-Ava','score-minus-Ben','score-par-Ben','score-plus-Ben','score-prev-hole','score-next-hole'];
 const targets=ids.map((id,i)=>({id,x:10+(i%3)*100,y:100+Math.floor(i/3)*100,width:56,height:56}));
 const image=new PNG({width:375,height:667});image.data.fill(255);
 for(const t of targets)for(let y=t.y+20;y<t.y+30;y++)for(let x=t.x+20;x<t.x+30;x++){const at=(y*375+x)*4;image.data[at]=image.data[at+1]=image.data[at+2]=0;}
 const execute=(bin,args)=>{
  if(bin==='maestro'&&args.includes('test')){
   phase++;const flow=args.at(-1),dir=path.dirname(flow),[,steps]=yaml.loadAll(fs.readFileSync(flow,'utf8'));
   const trace=steps.filter(s=>s.tapOn?.id).map(s=>({command:{tapOnElement:{selector:{idRegex:s.tapOn.id}}},metadata:{status:'COMPLETED'}}));
   fs.writeFileSync(path.join(dir,'commands.json'),JSON.stringify(trace));return Buffer.from('passed');
  }
  if(bin==='maestro'&&args.includes('hierarchy'))return JSON.stringify({children:[{attributes:{bounds:'[0,0][375,667]'},children:[{attributes:{text:phase===19?'Round Finalized — Scores Locked':`HOLE ${String(phase).padStart(2,'0')}`}},...targets.map(t=>({attributes:{'resource-id':t.id,bounds:`[${t.x},${t.y}][${t.x+t.width},${t.y+t.height}]`}}))]}]});
  if(bin==='xcrun'){fs.writeFileSync(args.at(-1),PNG.sync.write(image));return Buffer.from('screenshot');}
  throw Error('unexpected command');
 };
 try{
  const report=run({root,out,device:'test-udid',profile:'small',sourceSha:'a'.repeat(40),runId:'synthetic-unit-fixture'},execute);
  assert.equal(phase,19);assert.equal(report.status,'passed');assert.equal(report.taps,54);
  const r=JSON.parse(fs.readFileSync(path.join(out,'observations.json')));assert.equal(r.holes.length,18);assert.equal(r.holes[17].navigation.nextOutcome,18);
  assert.ok(fs.existsSync(path.join(out,r.holes[0].contrast.artifact)));
  phase=0;targets[0].height=44;
  const rejected=run({root,out:path.join(out,'reduced-target'),device:'test-udid',profile:'small',sourceSha:'a'.repeat(40),runId:'synthetic-unit-fixture'},execute);
  assert.equal(rejected.status,'failed');assert.ok(rejected.errors.some(e=>e.includes('target geometry')));
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
