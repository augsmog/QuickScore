/** Offline acceptance for AUG-966. Exact approved copy; no arbitrary deviations. */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { GAME_MODE_LIBRARY } from '../../src/engine/game-mode-library';
import { flatten } from './validate-and-diff';
const ROOT=path.resolve(__dirname,'../..');
export const LISTING_DOC='docs/APP_STORE_LISTING.md';
export const SOURCE_PATHS=[LISTING_DOC,'src/config/support.ts','src/engine/game-mode-library.ts','src/engine/types.ts'];
// AUG-403 item 1; owner reply 2026-11-03T16:39:18Z rejected the group-size replacement.
export const APPROVED_PROMO='Pick your players and games. SnapScore keeps score and works out who owes what across Skins, Nassau and Wolf. Got a paper card? Scan it, check it, done.';
export const sha256=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
export function parseListing(md:string):Record<string,string> {
 const headings:Record<string,string>={'App Name':'name','Subtitle':'subtitle','Keywords':'keywords','Promotional Text':'promotionalText','Description':'description'};
 const out:Record<string,string>={};
 for(const sec of md.split(/^## /m).slice(1)) {
  const line=sec.split('\n')[0];
  const h=Object.keys(headings).find(h=>line===h||line.startsWith(h+' ('));
  if(h) {const body=sec.slice(line.length).trim();out[headings[h]]=body.startsWith('```\n')?body.slice(4,body.lastIndexOf('\n```')):body;}
 }
 return out;
}
export function approvedFields(root=ROOT):Record<string,string> {
 const a=parseListing(fs.readFileSync(path.join(root,LISTING_DOC),'utf8'));
 const support=fs.readFileSync(path.join(root,'src/config/support.ts'),'utf8');
 const base=support.match(/export const SUPPORT_BASE_URL = "([^"]+)";/)?.[1];
 const suffix=support.match(/export const SUPPORT_PATH = "([^"]+)";/)?.[1];
 const privacy=a.description?.match(/^Privacy Policy: (\S+)$/m)?.[1];
 if(!base||!suffix||!privacy) throw new Error('required URL source missing');
 return {name:a.name,subtitle:a.subtitle,keywords:a.keywords,description:a.description,promotionalText:APPROVED_PROMO,supportUrl:base+suffix,marketingUrl:base,privacyPolicyUrl:privacy};
}
export function checkBinding(p:any,root=ROOT):string[] {
 const b=p.sourceBinding;
 if(!b) return ['sourceBinding: missing'];
 const errors:string[]=[];
 if(!/^[a-f0-9]{40}$/.test(b.sourceSha??'')) errors.push('sourceBinding.sourceSha: invalid');
 if(Object.keys(b.declaredDeviations??{}).length) errors.push('declaredDeviations: copy deviations are not approved');
 for(const f of SOURCE_PATHS) {
  const actual=fs.readFileSync(path.join(root,f),'utf8');
  if(b.sources?.[f]!==sha256(actual)) errors.push(f+': source drift');
  try {
   const recorded=execFileSync('git',['show',`${b.sourceSha}:scoresnap/${f}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
   if(recorded!==actual) errors.push(f+': does not match recorded source SHA');
  }catch {errors.push(f+': source SHA unavailable');}
 }
 const expected=approvedFields(root),staged=flatten(p);
 for(const [key,value] of Object.entries(expected)) if(staged[key]!==value && !(key.endsWith('Url')&&staged[key]?.replace(/\/$/,'')===value.replace(/\/$/,''))) errors.push(key+': differs from approved source');
 const count=GAME_MODE_LIBRARY.length;
 if(count<50||new Set(GAME_MODE_LIBRARY.map(g=>g.id)).size!==count||GAME_MODE_LIBRARY.some(g=>!g.name||!g.desc)||b.shippedModeCount!==count) errors.push('shippedModeCount: actual unique complete catalog must match and be >=50');
 if(b.promoApproval!=='AUG-403:2026-11-03T16:39:18Z') errors.push('promoApproval: missing exception provenance');
 return errors;
}
export function accept(p:any,validate:(p:any)=>string[]) {
 const errors=[...validate(p),...checkBinding(p)];
 if(p.status!=='STAGED-NOT-APPLIED') errors.push('status: must be STAGED-NOT-APPLIED');
 return {ok:errors.length===0,errors};
}
if(require.main===module) {
 const {validate}=require('./validate-and-diff');
 const p=JSON.parse(fs.readFileSync(process.argv[2]??path.join(__dirname,'en-US.payload.json'),'utf8'));
 const result=accept(p,validate);console.log(JSON.stringify(result,null,2));process.exit(result.ok?0:1);
}
