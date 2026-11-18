import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {validateRoundMetrics} from './score-entry-round.mjs';
const require=createRequire(import.meta.url);
const yaml=require('js-yaml');
const root=new URL('../../',import.meta.url);
function receipt(profile='small') {
  return {schema:'snapscore-score-entry/1',sourceSha:'a'.repeat(40),runId:'automated-123',
    profile,device:profile==='small'?'iPhone SE (3rd generation)':'iPhone 16 Pro Max',
    viewport:{width:profile==='small'?375:440,height:profile==='small'?667:956},
    holes:Array.from({length:18},(_,i)=>({hole:i+1,taps:3,corrections:0,
      screenshot:`hole-${i+1}.png`,hierarchy:`hole-${i+1}.json`,
      targets:['score-minus-Ava','score-par-Ava','score-plus-Ava','score-minus-Ben','score-par-Ben','score-plus-Ben','score-prev-hole','score-next-hole'].map(id=>({id,x:8,y:30,width:56,height:56})),
      navigation:{previousVisible:true,nextVisible:true,nextOutcome:i===17?18:i+2},
      contrast:{foreground:'#ffffff',background:'#000000',method:'screenshot-sampled',artifact:`hole-${i+1}-contrast.json`}})),
    finalized:true,finalizeArtifact:'finalized.png'};
}
test('both simulator profiles validate and preserve observed totals',()=>{
 for(const p of ['small','large']) {const r=validateRoundMetrics(receipt(p));assert.equal(r.status,'passed');assert.equal(r.taps,54);assert.equal(r.corrections,0);}
});
test('missing, synthetic, incomplete, mismatched and low-quality observations fail closed',()=>{
 const changes=[r=>r.holes.pop(),r=>r.holes[1].hole=1,r=>r.sourceSha='',r=>r.finalized=false,
 r=>r.holes[0].targets.pop(),r=>r.holes[0].targets[0].height=44,
 r=>r.holes[0].targets[0].x=999,r=>r.holes[0].contrast.foreground='#666666',
 r=>r.holes[0].contrast.method='source-token',r=>r.holes[0].navigation.nextOutcome=18,
 r=>r.holes[0].corrections=-1,r=>r.holes[0].taps=NaN,r=>r.holes[0].screenshot='',
 r=>r.holes[0].targets[0].width='56',r=>r.profile='desktop',r=>r.synthetic=true,
 r=>r.viewport.width=440,r=>r.holes[0].navigation.previousVisible=false];
 for(const change of changes){const r=receipt();change(r);assert.equal(validateRoundMetrics(r).status,'failed',String(change));}
 assert.equal(validateRoundMetrics(null).status,'failed');
});
test('full round flow asserts every hole, captures evidence and finalizes without optional navigation',()=>{
 const config=JSON.parse(fs.readFileSync(new URL('.maestro/e2e.config.json',root)));
 const f=config.flows.find(f=>f.id==='aug-325-score-entry');
 assert.ok(f.tickets.includes('AUG-387'));
 assert.deepEqual(f.metricProfiles,['small','large']);
 const [,steps]=yaml.loadAll(fs.readFileSync(new URL(f.file,root),'utf8'));
 for(let n=1;n<=18;n++){
  assert.ok(steps.some(s=>s.assertVisible===`.*HOLE ${String(n).padStart(2,'0')}.*`));
  assert.ok(steps.some(s=>s.takeScreenshot===`aug-325-${String(n).padStart(2,'0')}-hole-scored`));
 }
 const next=steps.filter(s=>s.tapOn?.id==='score-next-hole');assert.equal(next.length,17);
 assert.ok(next.every(s=>s.tapOn.optional===undefined));
 assert.equal(steps.filter(s=>s.tapOn?.id==='score-par-Ava').length,18);
 assert.equal(steps.filter(s=>s.tapOn?.id==='score-par-Ben').length,18);
 assert.ok(steps.some(s=>s.tapOn==='Finalize Round'));
});
