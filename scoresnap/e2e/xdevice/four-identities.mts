import type { WriteArgs } from '../../src/services/tournament-sync-plan';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
const outboxModule = await import(process.env.XDEVICE_OUTBOX_MODULE || '../../src/services/score-outbox.ts');
const { scoreOutbox } = outboxModule.default ?? outboxModule;
import * as onlineModule from '../../src/services/online-client';
const { onlineClient, foregroundRetry, foregroundSync, hostOrDiscover, rootRefresh } = (onlineModule as any).default ?? onlineModule;
import * as syncModule from '../../src/services/sync-v1';
const { syncV1, snapshotScore, revisionHint, loadSyncCapability } = (syncModule as any).default ?? syncModule;
import * as projectionModule from '../../src/services/score-projection';
const { projectScore } = (projectionModule as any).default ?? projectionModule;

const native = process.env.XDEVICE_NATIVE === '1';
const api = process.env.XDEVICE_API!;
const db = process.env.XDEVICE_DB!;
// Refuse remote endpoints before any Auth, SQL or HTTP operation.
for (const url of [api, db]) assert(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'disposable loopback stack only');
const sql = (input: string) => execFileSync('psql', [db, '-XAt', '-v', 'ON_ERROR_STOP=1'], {input, encoding:'utf8', stdio:['pipe','pipe','pipe']}).trim();
const work = await mkdtemp(join(tmpdir(), 'snapscore-four-identities-'));
const contest = randomUUID(), p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID(), r2 = randomUUID(), group = randomUUID();
const users: {id:string; token:string; refresh?:string}[] = [];
let anonKey = '';
const sockets:any[]=[];
const hints:any[]=[];
async function subscribe(i:number) {
  const transport=createClient(api,anonKey,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:WebSocket as any}});
  sockets.push(transport);
  await transport.realtime.setAuth(users[i].token);
  const channel=transport.channel(`snapscore:${contest}`,{config:{private:true}}).on('broadcast',{event:'revision'},({payload}:any)=>{const revision=revisionHint(payload);assert.notEqual(revision,null,'only revision plus optional Realtime delivery UUID');hints.push({i,payload:{revision}})});
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
      const {data,error}=await (i===0 ? auth.auth.signUp({email:`xdevice-${randomUUID()}@example.test`,password:randomUUID()+'aA!9'}) : auth.auth.signInAnonymously());
      assert(!error && data.session && data.user, 'disposable host/anonymous guest Auth signup');
      if(i>0)assert.equal(data.user.is_anonymous,true);
      users.push({id:data.user.id,token:data.session.access_token,refresh:data.session.refresh_token});
    }
  }
  sql(`INSERT INTO public.contests(id,owner_id,course,protocol,sync_enabled,invite_code) VALUES('${contest}','${users[0].id}','{"name":"Home","holes":[{"num":1,"par":4}]}',1,true,'R2TEST');
INSERT INTO public.contest_players(id,contest_id,name) VALUES('${p1}','${contest}','One'),('${p2}','${contest}','Two'),('${p3}','${contest}','Three');
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
  const failures = new Map<number,string>();
  const views = users.map(()=>new Map<string,any>());
  const clients=users.map((_,i)=>onlineClient(async (name:string,args:any)=>{if(failures.get(i)===name)throw Error('injected transport offline');return {data:await rpc(i)(name,args),error:null}},(id:string,member:any,snapshot:any)=>{if(member&&snapshot) views[i].set(id,snapshot);else views[i].delete(id)}));
  // Real production enrollment: pending never yields a roster, only the host decides.
  for(let i=1;i<4;i++) {
    assert.deepEqual(await clients[i].requestJoin('R2TEST',`Guest ${i}`),{status:'pending'});
    const status=await clients[i].discover();
    assert.equal(status.memberships.length,0);
    assert(status.requests.every((r:any)=>r.contest_id===null));
    assert(!views[i].has(contest));
    await assert.rejects(rpc(i)('fetch_snapshot',{contest_id:contest,after_revision:0}),{code:'42501'});
    await assert.rejects(clients[i].listRequests(contest),{code:'42501'});
  }
  const pending=await clients[0].listRequests(contest);
  for(let i=1;i<4;i++)await clients[0].decide(pending.find((r:any)=>r.requester===users[i].id).id,true,[p1,p2,p3][i-1]);
  // Scorer provisioning has no public UI/RPC yet. Only this ancillary role/scope
  // fixture uses SQL; enrollment and player approval above never do.
  sql(`UPDATE public.contest_memberships SET role='scorer',player_id=NULL WHERE contest_id='${contest}' AND user_id='${users[3].id}';`);
  // Owner restores directly: discovery intentionally lists memberships only.
  await clients[0].rejoinHost(contest);
  for(let i=1;i<4;i++) await clients[i].discover();
  for(const name of ['list_join_requests','fetch_snapshot']){
    failures.set(0,name);await assert.rejects(hostOrDiscover(clients[0],contest),/transport offline/);
    assert(views[0].has(contest),'production host refresh must retain authorized view offline');
  }
  failures.clear();
  let rootReplays=0;
  const root = rootRefresh(async()=>users[0].id,()=>views[0].has(contest)?[contest]:[],clients[0],async()=>{rootReplays++});
  for(const name of ['list_join_requests','sync_capabilities','fetch_snapshot']) {
    failures.set(0,name);
    await assert.rejects(root(),/transport offline/);
    assert(views[0].has(contest),'root discovery must retain owner-host during transport failure');
    failures.clear();
    await root();
    assert(views[0].has(contest),'healthy root poll must recover without an open host panel');
  }
  assert.equal(rootReplays,3);
  // Hold a real authorized host-proof HTTP response across membership-only
  // discovery, in both orders. No synthetic authorization is substituted.
  for(const discoveryFirst of [true,false]) {
    let release!:()=>void, arrived!:()=>void;
    const ready=new Promise<void>(resolve=>arrived=resolve);
    const gate=new Promise<void>(resolve=>release=resolve);
    let hostView:any=null;
    const overlapping=onlineClient(async(name:string,args:any)=>{
      const data=await rpc(0)(name,args);
      if(name==='list_join_requests'){arrived();await gate;}
      return {data,error:null};
    },(_id:string,_member:any,snapshot:any)=>{hostView=snapshot});
    const proof=rootRefresh(async()=>users[0].id,()=>[contest],overlapping,async()=>{})();
    await ready;
    if(discoveryFirst)await overlapping.discover();
    release();await proof;
    if(!discoveryFirst)await overlapping.discover();
    assert(hostView,'owner-host proof survives membership absence in either response order');
    overlapping.deny(contest);
    assert.equal(hostView,null,'explicit denial still clears owner-host');
  }
  console.log('PASS real root foreground host retention/recovery and overlapping owner proofs in both response orders');
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
    await loadSyncCapability(true,contest,()=>rpc(i)('sync_capabilities',{contest_id:contest}),()=>views[i].delete(contest));
    requests.push({i,args:{...args}});
    const receipt=await rpc(i)('write_score',{...args});
    if(i===1&&lose){lose=false;throw Error('injected lost response after commit')}
    return receipt;
  }));
  const retries=users.map((user,i)=>foregroundRetry(async()=>user.id,async()=>boxes[i].replay(),async()=>{
    if(i===0)await rootRefresh(async()=>user.id,()=>views[i].has(contest)?[contest]:[],clients[i],async()=>boxes[i].replay())();else await clients[i].discover();
    return views[i].get(contest)??null;
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
  await assert.rejects(loadSyncCapability(true,contest,async()=>{throw Error('offline capability')},()=>views[1].delete(contest)),/offline/);
  assert(views[1].has(contest),'offline capability retains authorized view');
  await assert.rejects(boxes[1].replay(),/lost response/);
  const immutable=(await boxes[1].inspect()).entries[0].request;
  // Force process-equivalent outbox reconstruction from disk after lost response.
  boxes[1]=scoreOutbox(storage,users[1].id,randomUUID,async (args:WriteArgs)=>{await loadSyncCapability(true,contest,()=>rpc(1)('sync_capabilities',{contest_id:contest}),()=>views[1].delete(contest));requests.push({i:1,args:{...args}});return rpc(1)('write_score',{...args})});
  await boxes[1].replay();
  assert.deepEqual(requests.filter(r=>r.i===1).slice(0,2).map(r=>r.args),[immutable,immutable]);
  await Promise.all([boxes[0].replay(),boxes[2].replay(),boxes[3].replay()]);
  const conflict=(await boxes[0].inspect()).entries[0];
  assert.equal(conflict.state,'conflict'); assert.equal(conflict.receipt?.strokes,4);
  await boxes[0].resolve(conflict.id,'keep-current',true);
  assert.equal((await boxes[0].inspect()).entries.length,0);
  assert.equal(sql(`SELECT count(*) FROM public.score_events WHERE contest_id='${contest}';`),'4');
  // Reconnect fetch repairs every authorized view, preserving stable IDs and CAS.
  const reconnect=async()=>{for(const i of [3,1,0,2])await retries[i]()};
  if(!native){await eventually(()=>hints.some(h=>h.i===1)&&hints.some(h=>h.i===3));for(const h of hints)assert.deepEqual(Object.keys(h.payload),['revision']);await sockets[0].removeAllChannels();await subscribe(1);}
  await reconnect();
  const canonical=views[0].get(contest);
  for(let i=1;i<4;i++) assert.deepEqual(views[i].get(contest),canonical);
  const getCell=(s:any,r:string,p:string,h:number)=>s.rounds.find((x:any)=>x.id===r).players.find((x:any)=>x.id===p).cells.find((x:any)=>x.hole===h);
  assert.equal(getCell(canonical,r1,p1,1).strokes,4);
  assert.equal(getCell(canonical,r2,p1,1).strokes,7);
  // Clear is an accepted versioned tombstone; a later edit uses the durable receipt.
  const clearRevision=views[1].get(contest).revision+1;
  await enqueue(1,r1,p1,1,null); await boxes[1].replay();
  if(!native)await eventually(()=>hints.some(h=>h.i===1&&h.payload.revision===clearRevision));
  await reconnect();
  assert.equal(getCell(views[2].get(contest),r1,p1,1).strokes,null);
  assert.equal(getCell(views[2].get(contest),r1,p1,1).version,2);
  await enqueue(1,r1,p1,1,5); await boxes[1].replay();
  await reconnect();
  assert.equal(getCell(views[0].get(contest),r1,p1,1).version,3);
  // Asymmetric assignment is authorization, not merely a UI filter.
  await enqueue(2,r2,p2,1,9); await boxes[2].replay();
  assert.equal((await boxes[2].inspect()).entries[0].state,'denied');
  // No Save/Retry action: a running foreground poll observes reconnection and
  // drains a durable offline edit through the same orchestration as the UI.
  let connected=false, attempted=false;
  await enqueue(1,r1,p1,2,6);
  const polling=foregroundSync(async()=>{attempted=true;if(!connected)throw Error('offline');return retries[1]()},()=>{},20);
  await eventually(()=>attempted);
  assert.equal((await boxes[1].inspect()).entries.length,1);
  connected=true;
  try { await eventually(()=>views[1].get(contest)?.rounds.find((r:any)=>r.id===r1)?.players.find((p:any)=>p.id===p1)?.cells.find((c:any)=>c.hole===2)?.strokes===6); }
  finally {polling.stop()}
  assert.equal((await boxes[1].inspect()).entries.length,0);
  // All four authorized writers overlap the SAME cell, in varied reconnect orders.
  // Ancillary scorer fixture grants actor 2 the existing Away group after real approval.
  sql(`UPDATE public.contest_memberships SET role='scorer',player_id=NULL WHERE contest_id='${contest}' AND user_id='${users[2].id}';
INSERT INTO public.round_scorer_scopes(contest_id,round_id,user_id,group_id,status) VALUES('${contest}','${r2}','${users[2].id}','${group}','approved');`);
  for(const order of [[2,0,3,1],[3,1,2,0]]) {
    await reconnect();
    for(let i=0;i<4;i++)await enqueue(i,r2,p1,1,i+3);
    for(const i of order)await retries[i](); // same production foreground/reconnect drain
    for(let i=0;i<4;i++){
      const entries=(await boxes[i].inspect()).entries.filter((e:any)=>e.draft.round_id===r2&&e.draft.player_id===p1&&e.draft.hole===1);
      if(i===order[0])assert.equal(entries.length,0);
      else {assert.equal(entries.length,1);assert.equal(entries[0].state,'conflict');await boxes[i].resolve(entries[0].id,'keep-current',true)}
    }
    await reconnect();
    for(let i=1;i<4;i++)assert.deepEqual(views[i].get(contest),views[0].get(contest));
    assert.equal(getCell(views[0].get(contest),r2,p1,1).strokes,order[0]+3);
  }
  // Queue before revocation, then reconnect. View and replay both fail closed.
  await enqueue(3,r2,p1,2,8);
  const count=sql(`SELECT count(*) FROM public.score_events WHERE contest_id='${contest}';`);
  let releaseSnapshot: (()=>void)|undefined;
  const staleClient=onlineClient(async(name:string,args:any)=>{
    const data=await rpc(3)(name,args);
    if(name==='fetch_snapshot')await new Promise<void>(resolve=>{releaseSnapshot=resolve});
    return {data,error:null};
  },(id:string,member:any,snapshot:any)=>{if(member&&snapshot)views[3].set(id,snapshot);else views[3].delete(id)});
  const heldRestore=staleClient.restore(contest,{status:'approved',role:'scorer',player_id:null});
  const heldResult=heldRestore.then(()=>false,()=>true);
  await eventually(()=>!!releaseSnapshot);
  await rpc(0)('revoke_membership',{contest_id:contest,member_id:users[3].id});
  await staleClient.discover();assert(!views[3].has(contest));
  releaseSnapshot!();assert(await heldResult,'late authorized snapshot must be discarded');assert(!views[3].has(contest));
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
  // Transfer through host decision revokes the former slot, then reject its rejoin.
  await clients[3].requestJoin('R2TEST','Transfer');
  let requestsNow=await clients[0].listRequests(contest);
  await clients[0].decide(requestsNow.find((r:any)=>r.requester===users[3].id&&r.status==='pending').id,true,p1);
  await clients[1].discover();assert(!views[1].has(contest));
  await clients[3].discover();assert(views[3].has(contest));
  await clients[1].requestJoin('R2TEST','Rejected rejoin');
  requestsNow=await clients[0].listRequests(contest);
  await clients[0].decide(requestsNow.find((r:any)=>r.requester===users[1].id&&r.status==='pending').id,false,null);
  const rejected=await clients[1].discover();assert(!views[1].has(contest));assert(rejected.requests.some((r:any)=>r.status==='rejected'));
  console.log('PASS anonymous enrollment/pending privacy/host approval/transfer/reject; production onlineClient + foreground replay; four-way same-cell overlap in two reconnect orders');
  console.log('PASS four independent identities: durable offline overlap/disjoint, lost response/restart, conflict, tombstone, asymmetric rounds, convergence, revocation and reconnect');
  console.log(native?'LIMIT: native JWT issuance and Realtime SQL stubs; no Auth service or sockets':'PASS disposable Auth signup/refresh, PostgREST, private revision sockets, authorized reconnect and revoked resubscribe denial');
} finally { for(const socket of sockets){await socket.removeAllChannels();socket.realtime.disconnect()} await rm(work,{recursive:true,force:true}); }
