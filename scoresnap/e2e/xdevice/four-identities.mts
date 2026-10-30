import type { WriteArgs } from '../../src/services/tournament-sync-plan';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
const { scoreOutbox } = await import(process.env.XDEVICE_OUTBOX_MODULE || '../../src/services/score-outbox.ts');
import { syncV1, snapshotScore } from '../../src/services/sync-v1';
import { projectScore } from '../../src/services/score-projection';

const native = process.env.XDEVICE_NATIVE === '1';
const api = process.env.XDEVICE_API!;
const db = process.env.XDEVICE_DB!;
// Refuse remote endpoints before any Auth, SQL or HTTP operation.
for (const url of [api, db]) assert(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'disposable loopback stack only');
const sql = (input: string) => execFileSync('psql', [db, '-XAt', '-v', 'ON_ERROR_STOP=1'], {input, encoding:'utf8', stdio:['pipe','pipe','pipe']}).trim();
const work = await mkdtemp(join(tmpdir(), 'snapscore-four-identities-'));
const contest = randomUUID(), p1 = randomUUID(), p2 = randomUUID(), r2 = randomUUID(), group = randomUUID();
const users: {id:string; token:string; refresh?:string}[] = [];
let anonKey = '';
const sockets:any[]=[];
const hints:any[]=[];
async function subscribe(i:number) {
  const transport=createClient(api,anonKey,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:WebSocket as any}});
  sockets.push(transport);
  await transport.realtime.setAuth(users[i].token);
  const channel=transport.channel(`snapscore:${contest}`,{config:{private:true}}).on('broadcast',{event:'revision'},({payload}:any)=>hints.push({i,payload}));
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('private subscribe timeout')),15000);
    channel.subscribe((status:string)=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve()}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timer);reject(Error('private subscribe denied'))}});
  });
  return transport;
}
async function eventually(check:()=>boolean) {
  const deadline=Date.now()+15000;
  while(!check()){assert(Date.now()<deadline,'revision hint deadline');await new Promise(r=>setTimeout(r,100))}
}
try {
  if (!native) {
    const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], {cwd:process.env.XDEVICE_BACKEND, encoding:'utf8', stdio:['ignore','pipe','pipe']}));
    anonKey = status.ANON_KEY;
    assert(anonKey);
  }
  for (let i=0;i<4;i++) {
    if (native) {
      const id=randomUUID();
      const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
      const payload=Buffer.from(JSON.stringify({sub:id,role:'authenticated',is_anonymous:i!==0,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
      const token=`${header}.${payload}.${createHmac('sha256',process.env.XDEVICE_JWT!).update(`${header}.${payload}`).digest('base64url')}`;
      users.push({id,token}); sql(`INSERT INTO auth.users(id) VALUES('${id}');`);
    } else {
      const auth=createClient(api,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data,error}=await auth.auth.signUp({email:`xdevice-${randomUUID()}@example.test`,password:randomUUID()+'aA!9'});
      assert(!error && data.session && data.user, 'disposable Auth signup');
      users.push({id:data.user.id,token:data.session.access_token,refresh:data.session.refresh_token});
    }
  }
  sql(`INSERT INTO public.contests(id,owner_id,course,protocol,sync_enabled,invite_code) VALUES('${contest}','${users[0].id}','{"name":"Home","holes":[{"num":1,"par":4}]}',1,true,'R2TEST');
INSERT INTO public.contest_players(id,contest_id,name) VALUES('${p1}','${contest}','One'),('${p2}','${contest}','Two');
INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES('${contest}','${users[1].id}','player','${p1}','approved'),('${contest}','${users[2].id}','player','${p2}','approved'),('${contest}','${users[3].id}','scorer',NULL,'approved');
INSERT INTO public.contest_rounds(id,contest_id,round_number,name,course_data) VALUES('${r2}','${contest}',2,'Away','{"name":"Away","holes":[{"num":1,"par":5},{"num":2,"par":3}]}');
INSERT INTO public.contest_groups(id,contest_id,round_id,name) VALUES('${group}','${contest}','${r2}','Away group');
INSERT INTO public.round_player_assignments(contest_id,round_id,player_id,group_id) VALUES('${contest}','${r2}','${p1}','${group}');
INSERT INTO public.round_scorer_scopes(contest_id,round_id,user_id,group_id,status) VALUES('${contest}','${r2}','${users[3].id}','${group}','approved');`);
  const rpc = (i:number) => async (name:string,args:Record<string,unknown>) => {
    const response=await fetch(`${api}${native?'':'/rest/v1'}/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${users[i].token}`,...(anonKey?{apikey:anonKey}:{})},body:JSON.stringify(args)});
    const data=await response.json();
    if(!response.ok) throw Object.assign(Error(`RPC ${name} failed`),{code:data.code,status:response.status});
    return data;
  };
  const views = users.map(()=>new Map<string,any>());
  const clients=users.map((_,i)=>syncV1(rpc(i),(id,member,snapshot)=>{if(member&&snapshot) views[i].set(id,snapshot);else views[i].delete(id)}));
  // Owner restores directly: discovery intentionally lists memberships only.
  await clients[0].restore(contest,{status:'approved',role:'host'} as any);
  for(let i=1;i<4;i++) await clients[i].discover();
  assert(users.every((_,i)=>views[i].has(contest)));
  const first=views[0].get(contest), r1=first.rounds[0].id;
  assert.equal(first.rounds[1].course.holes[0].par,5);
  assert.equal(first.rounds[0].course.holes[0].par,4);
  assert.equal(first.rounds[1].players.find((p:any)=>p.id===p2).group_id,null);
  const storage={getItem:async(key:string)=>{try{return await readFile(join(work,key),'utf8')}catch(e:any){if(e.code==='ENOENT')return null;throw e}},setItem:(key:string,value:string)=>writeFile(join(work,key),value)};
  if(!native){await subscribe(1);await subscribe(3);}
  let lose=true;
  const requests:any[]=[];
  const boxes=users.map((user,i)=>scoreOutbox(storage,user.id,randomUUID,async (args:WriteArgs)=>{
    requests.push({i,args:{...args}});
    const receipt=await rpc(i)('write_score',args);
    if(i===1&&lose){lose=false;throw Error('injected lost response after commit')}
    return receipt;
  }));
  const enqueue=async(i:number,round:string,player:string,hole:number,strokes:number|null)=>{
    const edit=snapshotScore(true,views[i].get(contest),round,player,hole,strokes);
    await boxes[i].enqueue(edit.draft,edit.version);
  };
  // All four identities edit while offline, before any replay. Host/player overlap;
  // scorer owns only Away and p2 has no Away assignment.
  await enqueue(0,r1,p1,1,6);
  await enqueue(1,r1,p1,1,4);
  await enqueue(1,r1,p1,2,5);
  await enqueue(2,r1,p2,1,3);
  await enqueue(3,r2,p1,1,7);
  assert.equal(projectScore({contest_id:contest,round_id:r1,player_id:p1,hole:1},null,(await boxes[1].inspect()).entries).strokes,4);
  await assert.rejects(boxes[1].replay(),/lost response/);
  const immutable=(await boxes[1].inspect()).entries[0].request;
  // Force process-equivalent outbox reconstruction from disk after lost response.
  boxes[1]=scoreOutbox(storage,users[1].id,randomUUID,async (args:WriteArgs)=>{requests.push({i:1,args:{...args}});return rpc(1)('write_score',args)});
  await boxes[1].replay();
  assert.deepEqual(requests.filter(r=>r.i===1).slice(0,2).map(r=>r.args),[immutable,immutable]);
  await Promise.all([boxes[0].replay(),boxes[2].replay(),boxes[3].replay()]);
  const conflict=(await boxes[0].inspect()).entries[0];
  assert.equal(conflict.state,'conflict'); assert.equal(conflict.receipt?.strokes,4);
  await boxes[0].resolve(conflict.id,'keep-current',true);
  assert.equal((await boxes[0].inspect()).entries.length,0);
  assert.equal(sql(`SELECT count(*) FROM public.score_events WHERE contest_id='${contest}';`),'4');
  // Reconnect fetch repairs every authorized view, preserving stable IDs and CAS.
  const reconnect=async()=>{await clients[0].restore(contest,{status:'approved',role:'host'} as any);for(let i=1;i<4;i++)await clients[i].discover()};
  if(!native){await eventually(()=>hints.some(h=>h.i===1)&&hints.some(h=>h.i===3));for(const h of hints)assert.deepEqual(Object.keys(h.payload),['revision']);await sockets[0].removeAllChannels();await subscribe(1);}
  await reconnect();
  const canonical=views[0].get(contest);
  for(let i=1;i<4;i++) assert.deepEqual(views[i].get(contest),canonical);
  const getCell=(s:any,r:string,p:string,h:number)=>s.rounds.find((x:any)=>x.id===r).players.find((x:any)=>x.id===p).cells.find((x:any)=>x.hole===h);
  assert.equal(getCell(canonical,r1,p1,1).strokes,4);
  assert.equal(getCell(canonical,r2,p1,1).strokes,7);
  // Clear is an accepted versioned tombstone; a later edit uses the durable receipt.
  await enqueue(1,r1,p1,1,null); await boxes[1].replay();
  if(!native)await eventually(()=>hints.some(h=>h.i===1&&h.payload.revision===5));
  await reconnect();
  assert.equal(getCell(views[2].get(contest),r1,p1,1).strokes,null);
  assert.equal(getCell(views[2].get(contest),r1,p1,1).version,2);
  await enqueue(1,r1,p1,1,5); await boxes[1].replay();
  await reconnect();
  assert.equal(getCell(views[0].get(contest),r1,p1,1).version,3);
  // Asymmetric assignment is authorization, not merely a UI filter.
  await enqueue(2,r2,p2,1,9); await boxes[2].replay();
  assert.equal((await boxes[2].inspect()).entries[0].state,'denied');
  // Queue before revocation, then reconnect. View and replay both fail closed.
  await enqueue(3,r2,p1,2,8);
  const count=sql(`SELECT count(*) FROM public.score_events WHERE contest_id='${contest}';`);
  await rpc(0)('revoke_membership',{contest_id:contest,member_id:users[3].id});
  await clients[3].discover(); assert(!views[3].has(contest));
  await assert.rejects(rpc(3)('fetch_snapshot',{contest_id:contest,after_revision:0}),{code:'42501'});
  await assert.rejects(rpc(3)('can_receive_sync',{topic:`snapscore:${contest}`}).then(allowed=>{if(!allowed)throw Object.assign(Error('revoked'),{code:'42501'})}),{code:'42501'});
  await boxes[3].replay(); assert.equal((await boxes[3].inspect()).entries[0].state,'denied');
  assert.equal(sql(`SELECT count(*) FROM public.score_events WHERE contest_id='${contest}';`),count);
  // Accepted receipts do not bypass revocation either.
  const prior=requests.find(r=>r.i===3).args;
  await assert.rejects(rpc(3)('write_score',prior),{code:'42501'});
  if(!native){
    const auth=createClient(api,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await auth.auth.refreshSession({refresh_token:users[3].refresh!});
    assert(!error&&data.session,'real disposable Auth reconnect'); users[3].token=data.session.access_token;
    await clients[3].discover();assert(!views[3].has(contest));
    // Cached authorization of an existing socket is not a score source. A fresh
    // subscribe must be denied after revocation and refreshed Auth credentials.
    await sockets[1].removeAllChannels();
    await assert.rejects(subscribe(3),/denied/);
  }
  console.log('PASS four independent identities: durable offline overlap/disjoint, lost response/restart, conflict, tombstone, asymmetric rounds, convergence, revocation and reconnect');
  console.log(native?'LIMIT: native JWT issuance and Realtime SQL stubs; no Auth service or sockets':'PASS disposable Auth signup/refresh, PostgREST, private revision sockets, authorized reconnect and revoked resubscribe denial');
} finally { for(const socket of sockets){await socket.removeAllChannels();socket.realtime.disconnect()} await rm(work,{recursive:true,force:true}); }
