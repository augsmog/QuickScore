// Existing disposable stack only; private fixture never belongs in uploaded evidence.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { disposableURL, validateFixture } from './contract.mjs';
import * as enrollmentModule from '../../src/services/online-enrollment';
const { enrollNewRound } = (enrollmentModule as any).default ?? enrollmentModule;
const status=JSON.parse(await readFile(process.env.INVITE_STATUS!, 'utf8'));
const api=disposableURL(status.API_URL);
const auth=createClient(api,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const email=`journey-${randomUUID()}@example.test`, password=randomBytes(32).toString('hex');
const {data,error}=await auth.auth.signUp({email,password});
assert(!error && data.session && data.user,'Disposable confirmed host signup');
const contestId=randomUUID(), roundId=randomUUID();
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let code=''; do {code=Array.from(randomBytes(6),v=>alphabet[v%alphabet.length]).join('');}while(code==='DGTWEW');
const players=[{id:randomUUID(),groupId:randomUUID(),name:'Journey Host',score:4},{id:randomUUID(),groupId:randomUUID(),name:'Journey Guest',score:6}];
const course={name:'Synthetic Journey Course',holes:[{num:1,par:4},{num:2,par:3}]};
const groups=players.map((p,i)=>({id:p.groupId,name:`Journey Group ${i+1}`,players:[{id:p.id,name:p.name,handicap:0,scores:[0,0]}]}));
const contest:any={id:contestId,name:'Synthetic Invite Journey',joinCode:code,course,groups,games:[],betUnit:0,hasTeams:false,rounds:[{id:roundId,number:1,name:'Journey Round',course,groups}]};
await enrollNewRound(contest,data.user.id,{
  create:async row=>{const {error}=await auth.from('contests').insert(row);assert(!error,'Disposable contest insert');},
  rpc:async(name,args)=>{const {data,error}=await auth.rpc(name,args);assert(!error,`Disposable fixture RPC ${name}`);return data;}
});
const {data:snapshot,error:snapshotError}=await auth.rpc('fetch_snapshot',{contest_id:contestId,after_revision:0});
assert(!snapshotError && snapshot,'Fixture snapshot RPC succeeds');
assert.equal(snapshot.invite_code,code,'Owner snapshot contains canonical synthetic invite (requires owner-invite proposal)');
assert.equal(snapshot.rounds.length,1,'Fixture contains exactly one round');
const round=snapshot.rounds[0];
// Bind generated server IDs, never local IDs assumed to survive enrollment.
const fixture={api,code,contestId,roundId:round.id,hole:1,players:players.map(p=>{
  const matches=round.players.filter((r:any)=>r.displayName===p.name);assert.equal(matches.length,1);
  return {...p,id:matches[0].id,groupId:matches[0].group_id};
}),anonKey:status.ANON_KEY,adminKey:status.SERVICE_ROLE_KEY,hostSession:data.session,hostEmail:email,hostPassword:password};
validateFixture(fixture);
await writeFile(process.env.INVITE_FIXTURE!,JSON.stringify(fixture),{mode:0o600});
await chmod(process.env.INVITE_FIXTURE!,0o600);
console.log('Seeded synthetic two-group fixture on disposable loopback; private fixture is not evidence');
