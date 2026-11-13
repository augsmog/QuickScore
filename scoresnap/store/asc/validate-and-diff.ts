/** Offline ASC lint and field diff. No credentials or network. */
import * as fs from 'fs';
import * as path from 'path';
export const LIMITS:Record<string,number>={name:30,subtitle:30,keywords:100,promotionalText:170,description:4000};
export const URL_FIELDS=['supportUrl','marketingUrl','privacyPolicyUrl'];
export function flatten(p:any):Record<string,string> {return {...(p.appInfoLocalization??{}),...(p.versionLocalization??{})};}
export function validate(p:any):string[] {
 const errors:string[]=[],fields=flatten(p);
 for(const key of Object.keys(p.appInfoLocalization??{})) if(Object.hasOwn(p.versionLocalization??{},key)) errors.push(key+': duplicate field');
 if(p.locale!=='en-US') errors.push('locale: en-US required');
 for(const [key,max] of Object.entries(LIMITS)) {
  const value=fields[key];
  if(typeof value!=='string'||!value.length) errors.push(key+': missing');
  else if(Array.from(value).length>max) errors.push(key+': exceeds '+max);
 }
 for(const key of URL_FIELDS) {
  try {const u=new URL(fields[key]);if(u.protocol!=='https:'||u.hostname!=='snapscore.autumn8.me'||u.port||u.username||u.password||u.search||u.hash) throw new Error();}
  catch {errors.push(key+': canonical HTTPS URL required');}
 }
 for(const [key,value] of Object.entries(fields)) {
  if(![...Object.keys(LIMITS),...URL_FIELDS].includes(key)) errors.push(key+': unapproved field');
  if(typeof value!=='string') {errors.push(key+': must be text');continue;}
  if(/\b(?:bets?|betting|wagers?|wagering|gambl\w*|payouts?|unlock\w*|leagues?)\b/i.test(value)) errors.push(key+': banned or unshipped term');
  if(/scoresnap\.app/i.test(value)) errors.push(key+': retired host');
  for(const claim of value.matchAll(/\b\d+\+?\s+game modes\b/gi)) if(claim[0]!=='50+ game modes') errors.push(key+': noncanonical mode claim');
 }
 if(!fields.description?.includes('50+ game modes')) errors.push('description: exact 50+ game modes phrase required');
 return errors;
}
export function diff(staged:Record<string,string>,live:Record<string,string>):string[] {
 return Object.keys(staged).filter(k=>staged[k]!==live[k]).map(k=>`${k}: live=${JSON.stringify(live[k]??null)} -> staged=${JSON.stringify(staged[k])}`);
}
if(require.main===module) {
 const p=JSON.parse(fs.readFileSync(process.argv[2]??path.join(__dirname,'en-US.payload.json'),'utf8'));
 const errors=validate(p);console.log(JSON.stringify({ok:!errors.length,errors},null,2));if(errors.length)process.exit(1);
 if(process.argv[3]) console.log(diff(flatten(p),flatten(JSON.parse(fs.readFileSync(process.argv[3],'utf8')))).join('\n'));
}
