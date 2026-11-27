import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {wizardScrollCoverage as coverage} from './ios-wizard-scroll-coverage.mjs';
import {evaluateCheckpoint} from './geometry-rules.mjs';
import {runBundle} from '../run-geometry.mjs';
import {verifyIOSWizard} from './ios-wizard-proof.mjs';
const options={sourceSha:'a'.repeat(40),profile:'iphone-16-pro',buildHash:'b'.repeat(64)};
const rect=(left,top,right,bottom)=>({left,top,right,bottom});
const vp=rect(0,100,402,750), tail='last player above footer';
function fixture(t){
  const evidenceDir=mkdtempSync(join(tmpdir(),'wizard-g1-'));
  t.after(()=>rmSync(evidenceDir,{recursive:true,force:true}));
  const checkpoints=['name entry','four players',tail,'rewind remove ava','four players add group'].map((checkpoint,i)=>{
    const top=[140,140,-210,140,-280][i];
    const pixels=Buffer.from('test-only mock screenshot '+i), screenshot=i+'-new-contest-'+checkpoint.replaceAll(' ','-')+'.png';
    writeFileSync(join(evidenceDir,screenshot),pixels);
    const nodes=[];
    const n=(id,text,l,y,w,h,role='control',more={})=>{
      const bbox=rect(l,y,l+w,y+h);
      nodes.push({id,text,role,enabled:true,selected:false,checked:false,bbox,hitRegion:{...bbox},
        meta:{resourceId:id,scrollViewport:{...vp},...more}});
    };
    n('contest-scroll','',0,100,402,650,'container',{scrollClip:true});
    for(let k=0;k<(i?4:2);k++){
      const y=top+130*k;
      n('wizard-player-row-'+(k+1),'',10,y,382,120,'container');
      n('wizard-player-name-'+(k+1),k?'Player '+(k+1)+' name':'Ava',40,y+4,260,44);
      if(i) n('remove-player-'+(k?'':'Ava'),k?'Remove player':'Remove Ava',315,y+4,44,44);
    }
    n('add-group','Add group',330,top+595,44,44);
    n('add-player','Add player',20,top+576,44,44);
    // Pairing across reveal stops is exact; duplicate/untagged names never receive relief.
    return {checkpoint,flow:'new-contest',screen:'new-contest',platform:'ios',deviceId:options.profile,
      context:{viewport:{width:402,height:874},safeArea:{left:0,right:0,top:59,bottom:i===0?290:34},
        footer:rect(0,762,402,874),measuredKeyboardInset:i===0?290:0},
      nodes,screenshot,screenshotSha256:createHash('sha256').update(pixels).digest('hex')};
  });
  return [{...options,platform:'ios',checkpoints},{...options,evidenceDir}];
}
const cp=(b,j)=>b.checkpoints[j];
const node=(b,j,id)=>cp(b,j).nodes.find(x=>x.id===id);
const proof=(b,o,j,id)=>coverage(b,o).get(cp(b,j))?.has(node(b,j,id))||false;
function targets(b,o,j,id) {
  const p=cp(b,j), n=node(b,j,id);
  return evaluateCheckpoint(p.nodes,{...p.context,platform:'ios'},coverage(b,o).get(p)).findings.filter(f=>f.nodes.includes(n.id));
}
test('genuine scroll revealed exact same fully usable target; footer, safe area and tap rules still apply',t=>{
  const [b,o]=fixture(t);
  verifyIOSWizard(b,{sourceSha:o.sourceSha,profileId:o.profile,buildHash:o.buildHash});
  assert.ok(targets(b,{},1,'add-group').some(f=>/scroll ancestors/.test(f.reason)));
  assert.ok(proof(b,o,1,'add-group'),'verified scroll passes reachability');
  assert.ok(!targets(b,o,1,'add-group').some(f=>/scroll ancestors|undersized painted/.test(f.reason)));
  assert.ok(targets(b,o,1,'add-group').some(f=>/hard-clipped by the sticky footer/.test(f.reason)));
  assert.ok(proof(b,o,1,'add-player'));
  assert.equal(targets(b,o,1,'add-player').filter(f=>[2,5].includes(f.rule)).length,0);
  const result=runBundle(b,{waivers:[]},new Date(),o);
  assert.ok(!result.error);
  assert.ok(!result.results[1].kept.some(f=>f.nodes.includes('add-player')));
  assert.ok(result.results[1].verifiedScrollReveals.some(r=>r.id==='add-player' && r.verticalMotion<0 && r.checkpoint===tail));
  assert.ok(proof(b,o,2,'remove-player-Ava'),'verified rewind reveals exact Remove Ava');
  // G4 (Claude, AUG-1601): DotBot's patch asserted the opposite here, that Remove Ava, scrolled up
  // out of a scroll area that starts at y=100, still "extends outside the safe area (top<59)". It
  // is at y=-206 only in Maestro's unmasked report; nothing is drawn above y=100. With that
  // assertion the wizard fails at every checkpoint where a row has scrolled off the top, which is
  // every scrolled one (4 such findings in run 46008363328). lib/ios-top-inset-mask.test.mjs keeps
  // the real case failing: a control drawn above the inset. The gate owner reviews this line.
  assert.ok(!targets(b,o,2,'remove-player-Ava').some(f=>/top<59/.test(f.reason)));
});
test('real previously clipped owner target remains failing if it is never revealed',t=>{
  const [b,o]=fixture(t);
  for(const j of [1,2,3,4]) {
    const n=node(b,j,'add-player');n.bbox.top+=950;n.bbox.bottom+=950;n.hitRegion={...n.bbox};
  }
  assert.ok(!proof(b,o,2,'add-player'));
  assert.ok(targets(b,o,2,'add-player').some(f=>f.rule===2));
  assert.ok(targets(b,o,2,'add-player').some(f=>f.rule===5));
});
for (const [label,mutate] of Object.entries({
  'wrong build':(b,o)=>o.buildHash='c'.repeat(64),
  'forged bundle context without proof':(b,o)=>{cp(b,1).context.verifiedScrollReveals=['add-group'];delete o.evidenceDir;},
  'changed named control state':(b,o)=>{node(b,2,'add-group').selected=true;node(b,4,'add-group').selected=true;},
  'no evidence directory':(b,o)=>delete o.evidenceDir,
  'changed pixels':(b,o)=>writeFileSync(join(o.evidenceDir,cp(b,2).screenshot),'replaced'),
  'changed later roster':b=>node(b,2,'wizard-player-name-1').text='Eva',
  'wrong device':b=>cp(b,3).deviceId='iphone-se-3',
  'no measured scrolling':b=>node(b,2,'wizard-player-row-4').bbox={...node(b,1,'wizard-player-row-4').bbox},
  'horizontal collision':b=>{node(b,1,'add-group').bbox.left=-1;},
  'undersized raw hit':b=>{node(b,1,'add-group').hitRegion.bottom=node(b,1,'add-group').hitRegion.top+43;},
  'later layout jump for control':b=>{const n=node(b,4,'add-group');n.bbox.top+=12;n.bbox.bottom+=12;const m=node(b,2,'add-group');m.bbox.top+=12;m.bbox.bottom+=12;},
  'missing stable exact control identity':b=>{node(b,1,'add-group').meta.resourceId='';},
  'required at this checkpoint':b=>{node(b,1,'add-group').meta.required=true;},
  'duplicate control id':b=>cp(b,1).nodes.push(structuredClone(node(b,1,'add-group'))),
  'viewport overlaps footer':b=>{cp(b,1).context.footer.top=700;},
})) test('no G1 proof: '+label,t=>{const [b,o]=fixture(t);mutate(b,o);assert.ok(!proof(b,o,1,'add-group'));});

test('historical 16 Pro keyboard case keeps strict Add group at y808–852 with no reveal proof',()=>{
  // Rectangles retained from run 46008363328, checkpoint 02. This is not a candidate recapture.
  const bbox=rect(338,808,382,852);
  const n={id:'add-group',role:'control',text:'Add group',enabled:true,bbox,hitRegion:bbox,
    meta:{resourceId:'add-group',scrollViewport:rect(0,204,402,541),tappable:true}};
  const g=evaluateCheckpoint([n],{platform:'ios',viewport:{width:402,height:874},
    safeArea:{left:0,right:0,top:59,bottom:291},footer:rect(0,762,402,874)});
  assert.ok(g.findings.some(x=>x.rule===2&&/scroll ancestors/.test(x.reason)));
  assert.ok(g.findings.some(x=>x.rule===2&&/bottom>583/.test(x.reason)));
  assert.ok(g.findings.some(x=>x.rule===5&&/undersized painted/.test(x.reason)));
});
