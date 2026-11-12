import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { stage } from '../stage-packet';
import { flatten } from '../validate-and-diff';
import { sha256 } from '../source-binding';
const p=JSON.parse(fs.readFileSync(path.join(__dirname,'../en-US.payload.json'),'utf8'));
const r={app:'6761034352',version:'1.0',locale:'en-US',timestamp:'2026-11-12T06:00:00Z',operations:[{method:'GET',status:200,path:'/v1/apps/6761034352/appStoreVersions'}],fields:Object.fromEntries(Object.entries(flatten(p)).map(([k,v])=>[k,{sha256:sha256(v),length:Array.from(v).length}]))};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'asc-packet-'));
try {
 stage(p,r,temp);
 const sums=fs.readFileSync(path.join(temp,'SHA256SUMS'),'utf8').trim().split('\n');
 assert.strictEqual(sums.length,5);
 for(const row of sums){const [hash,name]=row.split('  ');assert.strictEqual(sha256(fs.readFileSync(path.join(temp,name),'utf8')),hash);}
 for(const mutation of [(b:any)=>b.operations[0].method='PATCH',(b:any)=>b.operations[0].status=403,(b:any)=>b.app='wrong',(b:any)=>b.version='2.0',(b:any)=>b.locale='fr-FR',(b:any)=>delete b.fields.subtitle]) {
  const bad=JSON.parse(JSON.stringify(r));mutation(bad);assert.throws(()=>stage(p,bad,temp));
 }
 console.log('8 packet checks passed');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
