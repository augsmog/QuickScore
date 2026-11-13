/** Build a reproducible packet from a sanitized GET receipt; never accesses ASC. */
import * as fs from 'fs';
import * as path from 'path';
import { accept, sha256 } from './source-binding';
import { validate, flatten, LIMITS } from './validate-and-diff';
export function stage(payload:any,readback:any,output:string) {
 const result=accept(payload,validate);
 if(!result.ok) throw new Error(result.errors.join('\n'));
 if(readback.app!=='6761034352'||readback.version!=='1.0'||readback.locale!=='en-US'||!readback.timestamp||!readback.operations?.length||readback.operations.some((o:any)=>o.method!=='GET'||o.status!==200)) throw new Error('GET-only 1.0 en-US receipt required');
 const fields=flatten(payload);
 for(const key of Object.keys(fields)) if(!/^[a-f0-9]{64}$/.test(readback.fields?.[key]?.sha256??'')||!Number.isInteger(readback.fields[key].length)) throw new Error('missing GET field '+key);
 fs.mkdirSync(output,{recursive:true});
 const files:Record<string,any>={
  'metadata.json':payload,
  'readback.json':readback,
  'lint.json':{ok:true,errors:[],shipped_mode_count:payload.sourceBinding.shippedModeCount,counts:Object.fromEntries(Object.keys(LIMITS).map(k=>[k,Array.from(fields[k]).length]))},
  'manifest.json':{schema:'snapscore-asc-staged/1',status:'STAGED-NOT-APPLIED',app:readback.app,version:readback.version,locale:readback.locale,sourceSha:payload.sourceBinding.sourceSha,sources:payload.sourceBinding.sources,promoApproval:payload.sourceBinding.promoApproval,operations:readback.operations,timestamp:readback.timestamp},
  'diff.md':'# Live 1.0 en-US vs staged metadata\n\nGET only; no ASC writes. Values represented by Unicode character length and SHA256.\n\n| Field | Live length / sha256 | Staged length / sha256 | Equal |\n|---|---|---|---|\n'+Object.entries(fields).map(([k,v])=>`| ${k} | ${readback.fields[k].length} / ${readback.fields[k].sha256} | ${Array.from(v).length} / ${sha256(v)} | ${readback.fields[k].sha256===sha256(v)} |`).join('\n')+'\n',
 };
 const sums:string[]=[];
 for(const [name,value] of Object.entries(files)){const content=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';fs.writeFileSync(path.join(output,name),content);sums.push(`${sha256(content)}  ${name}`);}
 fs.writeFileSync(path.join(output,'SHA256SUMS'),sums.join('\n')+'\n');
 return files;
}
if(require.main===module) {
 const [readback,output]=process.argv.slice(2);
 if(!readback||!output) throw new Error('Usage: tsx stage-packet.ts sanitized-readback.json output-dir');
 stage(JSON.parse(fs.readFileSync(path.join(__dirname,'en-US.payload.json'),'utf8')),JSON.parse(fs.readFileSync(readback,'utf8')),output);
}
