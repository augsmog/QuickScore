import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyIOSWizard as verify} from './ios-wizard-proof.mjs';
import {normalizeMaestroCapture} from './normalize-maestro.mjs';
const opt={sourceSha:'a'.repeat(40),buildHash:'b'.repeat(64),profileId:'iphone-16-pro'};
const pos=(top,h=44)=>({left:20,top,right:140,bottom:top+h});
const inside={left:0,top:100,right:402,bottom:750};
function n(id,text,top,h) {
  return {id,text,role:id.startsWith('wizard-player-row')?'container':'control',enabled:true,selected:false,checked:false,bbox:pos(top,h),meta:{scrollViewport:inside}};
}
function fixture(){
  const checkpoints=['name entry','four players','last player above footer','rewind remove ava','four players add group'].map((name,i)=>{
    const keyboard=i===0?260:0, top=[100,140,-220,140,-280][i];
    const nodes=[];
    for(let j=0;j<(i?4:2);j++) {
      nodes.push(n('wizard-player-row-'+(j+1),'',top+130*j,120),n('wizard-player-name-'+(j+1),j?'Player '+(j+1)+' name':'Ava',top+130*j));
      if(i) nodes.push(n('remove-player-'+(j?'':'Ava'),j?'Remove player':'Remove Ava',top+130*j));
    }
    nodes.push(n('add-group','Add group',top+550));
    return {flow:'new-contest',screen:'new-contest',checkpoint:name,platform:'ios',deviceId:opt.profileId,
      screenshot:i+'-new-contest-'+name.replaceAll(' ','-')+'.png',screenshotSha256:String(i+1).repeat(64),
      context:{viewport:{width:402,height:874},safeArea:{top:59,left:0,right:0,bottom:keyboard||34},
        footer:{left:0,top:762,right:402,bottom:874},measuredKeyboardInset:keyboard},nodes};
  });
  return {platform:'ios',profile:opt.profileId,sourceSha:opt.sourceSha,buildHash:opt.buildHash,checkpoints};
}
test('four-player scroll down to full fourth card then rewind and paint Remove Ava; separately paint Add group',()=>verify(fixture(),opt));
const at=(b,i,id)=>b.checkpoints[i].nodes.find(n=>n.id===id);
for(const [why,mutate] of Object.entries({
  'wrong name':b=>{at(b,0,'wizard-player-name-1').text='Golfer'},
  'static safe area is not a measured keyboard':b=>{b.checkpoints[0].context.measuredKeyboardInset=0},
  'keyboard included but unsafe name':b=>{at(b,0,'wizard-player-name-1').bbox=pos(630)},
  'sticky Continue cannot prove last row scroll':b=>{at(b,1,'wizard-player-row-4').bbox=at(b,2,'wizard-player-row-4').bbox},
  'clipped last row':b=>{at(b,2,'wizard-player-row-4').bbox=pos(720,120)},
  'stale tail image':b=>{b.checkpoints[2].screenshotSha256=b.checkpoints[1].screenshotSha256},
  'wrong screenshot filename':b=>{b.checkpoints[2].screenshot=b.checkpoints[1].screenshot},
  'missing checksum':b=>{b.checkpoints[2].screenshotSha256=null},
  'permanently clipped Ava':b=>{at(b,3,'remove-player-Ava').bbox=pos(70)},
  '43 point Ava':b=>{at(b,3,'remove-player-Ava').bbox=pos(140,43)},
  'disabled Ava':b=>{at(b,3,'remove-player-Ava').enabled=false},
  'stale four-player state':b=>{at(b,3,'wizard-player-name-2').text='Changed'},
  'copied roster missing slot':b=>{at(b,3,'wizard-player-row-4').id='wizard-player-row-3'},
  'footer obscures Add group':b=>{b.checkpoints[4].context.footer.top=300},
  'duplicate rewind':b=>{b.checkpoints.push(b.checkpoints[3])},
  'reordered rewind':b=>{b.checkpoints.reverse()},
  'missing rewind':b=>{b.checkpoints.splice(3,1)},
  'wrong profile':b=>{b.checkpoints[3].deviceId='iphone-se-3'},
  'stale candidate':b=>{b.sourceSha='c'.repeat(40)},
  'stale binary':b=>{b.buildHash='c'.repeat(64)}
})) test('reject: '+why,()=>{const b=fixture();mutate(b);assert.throws(()=>verify(b,opt),/iOS wizard capture/);});
test('historical native name entry measures a keyboard distinct from a declared safe area',()=>{
  const load = name => JSON.parse(readFileSync(new URL('fixtures/native/'+name+'.hierarchy.json',import.meta.url),'utf8'));
  const up=normalizeMaestroCapture(load('ios-16pro-name-entry'),{viewport:{width:402,height:874}});
  const down=normalizeMaestroCapture(load('ios-se3-empty-wizard'),{viewport:{width:375,height:667}});
  assert.ok(up.keyboardInset>34);assert.equal(down.keyboardInset,0);
});
