import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { accept, parseListing } from '../source-binding';
import { validate, flatten, LIMITS } from '../validate-and-diff';
import { GAME_MODE_LIBRARY } from '../../../src/engine/game-mode-library';
const root=path.resolve(__dirname,'../../..');
const p=JSON.parse(fs.readFileSync(path.join(__dirname,'../en-US.payload.json'),'utf8'));
const clone=()=>JSON.parse(JSON.stringify(p));
let n=0;
const t=(name:string,fn:()=>void)=>{fn();n++;console.log('ok -',name);};
t('exact approved payload accepted',()=>assert.deepStrictEqual(accept(p,validate),{ok:true,errors:[]}));
t('current plain listing matches byte for byte',()=>{
 const a=parseListing(fs.readFileSync(path.join(root,'docs/APP_STORE_LISTING.md'),'utf8'));
 for(const f of ['description','subtitle','keywords']) assert.strictEqual(flatten(p)[f],a[f]);
});
t('declared deviation cannot authorize copy',()=>{const b=clone();b.versionLocalization.description+=' Changed.';b.sourceBinding.declaredDeviations={description:'reason'};assert.ok(!accept(b,validate).ok);});
for(const key of ['supportUrl','marketingUrl','privacyPolicyUrl']) {
 t('missing URL rejected '+key,()=>{const b=clone();delete b.versionLocalization[key];delete b.appInfoLocalization[key];assert.ok(!accept(b,validate).ok);});
 t('wrong URL rejected '+key,()=>{const b=clone();(key==='privacyPolicyUrl'?b.appInfoLocalization:b.versionLocalization)[key]='https://scoresnap.app/wrong';assert.ok(!accept(b,validate).ok);});
}
t('rejected group-size promo rejected',()=>{const b=clone();b.versionLocalization.promotionalText=parseListing(fs.readFileSync(path.join(root,'docs/APP_STORE_LISTING.md'),'utf8')).promotionalText;assert.ok(!accept(b,validate).ok);});
for(const term of ['bet','wagering','gamble','payout','unlock','league','29 game modes','56 game modes','50 game modes','scoresnap.app'])
 t('unsafe claim rejected '+term,()=>{const b=clone();b.versionLocalization.description+=' '+term;assert.ok(validate(b).length>0);});
for(const [key,max] of Object.entries(LIMITS)) t('limit enforced '+key,()=>{const b=clone();(key==='name'||key==='subtitle'?b.appInfoLocalization:b.versionLocalization)[key]='x'.repeat(max+1);assert.ok(validate(b).some(e=>e.startsWith(key+':')));});
t('missing 50+ phrase rejected',()=>{const b=clone();b.versionLocalization.description=b.versionLocalization.description.replaceAll('50+ game modes','many modes');assert.ok(validate(b).length>0);});
t('source hash drift rejected',()=>{const b=clone();b.sourceBinding.sources['docs/APP_STORE_LISTING.md']='0'.repeat(64);assert.ok(!accept(b,validate).ok);});
t('unrecorded source SHA rejected',()=>{const b=clone();b.sourceBinding.sourceSha='0'.repeat(40);assert.ok(!accept(b,validate).ok);});
t('catalog count matches shipped catalog',()=>{assert.ok(GAME_MODE_LIBRARY.length>=50);assert.strictEqual(new Set(GAME_MODE_LIBRARY.map(x=>x.id)).size,GAME_MODE_LIBRARY.length);assert.strictEqual(p.sourceBinding.shippedModeCount,GAME_MODE_LIBRARY.length);});
t('false catalog count rejected',()=>{const b=clone();b.sourceBinding.shippedModeCount=29;assert.ok(!accept(b,validate).ok);});
t('prior PR219 and PR220 payloads regress',()=>{for(const sha of ['7d2539a4d2d63bee8d70c3c0c345d3b61c6ce821','65459e4d7b1f84a32fdd9f11a4877be1c1c6e607']) {const old=JSON.parse(execFileSync('git',['show',sha+':scoresnap/store/asc/en-US.payload.json'],{cwd:root,encoding:'utf8'}));assert.ok(!accept(old,validate).ok);}});
t('unapproved whatsNew rejected',()=>{const b=clone();b.versionLocalization.whatsNew='New trial';assert.ok(validate(b).length>0);});
t('applied status rejected',()=>{const b=clone();b.status='APPLIED';assert.ok(!accept(b,validate).ok);});
console.log(`${n} passed`);
// Source mutations must fail even when a caller recomputes the declared digest.
import * as os from 'os';
import { SOURCE_PATHS, checkBinding, sha256 } from '../source-binding';
for(const source of ['docs/APP_STORE_LISTING.md','src/config/support.ts','src/engine/game-mode-library.ts']) t('mutated source rejected '+source,()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'asc-source-'));
 try {
  fs.symlinkSync(path.join(root,'../.git'),path.join(temp,'.git'));
  for(const f of SOURCE_PATHS){fs.mkdirSync(path.dirname(path.join(temp,f)),{recursive:true});fs.copyFileSync(path.join(root,f),path.join(temp,f));}
  const f=path.join(temp,source);fs.appendFileSync(f,'\n// changed\n');
  const b=clone();b.sourceBinding.sources[source]=sha256(fs.readFileSync(f,'utf8'));
  assert.ok(checkBinding(b,temp).some(e=>e.includes('recorded source SHA')));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

t('duplicate field rejected',()=>{const b=clone();b.versionLocalization.subtitle=b.appInfoLocalization.subtitle;assert.ok(validate(b).length>0);});
t('source-matched alternate promo still rejected',()=>{const b=clone();b.versionLocalization.promotionalText='A different promo';assert.ok(!accept(b,validate).ok);});
