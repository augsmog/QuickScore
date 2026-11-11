const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function run(dir,args=[]){return spawnSync(process.execPath,['e2e/storekit/check_catalog.js',...args],{cwd:dir,encoding:'utf8'});}
test('TD-only shipping and four-product Pro fixture both match plan prices',()=>{
 const a=run(root),b=run(root,['--pro-enabled']);
 assert.equal(a.status,0,a.stderr);assert.match(a.stdout,/2 shipping TD-only products/);
 assert.equal(b.status,0,b.stderr);assert.match(b.stdout,/4 Pro-enabled products/);
});
test('shipping catalog rejects a Pro product even when the expected TD rows are present',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'storekit-catalog-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'e2e/storekit'),{recursive:true});fs.mkdirSync(path.join(dir,'src/services'),{recursive:true});
 for(const file of ['check_catalog.js','SnapScore.storekit','SnapScore.pro-enabled.storekit'])fs.copyFileSync(path.join(__dirname,file),path.join(dir,'e2e/storekit',file));
 fs.copyFileSync(path.join(root,'src/services/paywall-plans.ts'),path.join(dir,'src/services/paywall-plans.ts'));
 const file=path.join(dir,'e2e/storekit/SnapScore.storekit'),catalog=JSON.parse(fs.readFileSync(file,'utf8'));
 catalog.subscriptionGroups[0].subscriptions.push(JSON.parse(fs.readFileSync(path.join(__dirname,'SnapScore.pro-enabled.storekit'),'utf8')).subscriptionGroups[0].subscriptions.find(x=>x.productID==='snapscore.pro.annual'));
 fs.writeFileSync(file,JSON.stringify(catalog));const result=run(dir);
 assert.notEqual(result.status,0);assert.match(result.stderr,/shipping catalog must not contain Pro products|product set differs/);
});
