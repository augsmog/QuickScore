// Additive acceptance candidate. Run only on dedicated disposable iOS E2E sims.
// Provision only a disposable owner identity; the host UI creates/enrolls the round.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, mkdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { disposableURL, validateFixture, eventually, assertBinding, assertScores } from './contract.mjs';
import { id, tap, wait, signInSteps, hostCreateSteps, guestRequestSteps, guestReconnectSteps,
  hostReopenSteps, hiddenEntrySteps, deriveFreshFixture, guestVisitor, hostName, guestName } from './native-manual-flow.mjs';
const appId='com.scoresnap.app';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const exec=(bin,args,opts={})=>execFileSync(bin,args,{stdio:'pipe',...opts});

export function validateArtifact(meta, api, source, sharing) {
  assert.match(source,/^[a-f0-9]{40}$/);
  assert.equal(meta.schema,'invite-journey-app/1');
  assert.equal(meta.source_sha,source);
  assert.equal(meta.api,api);
  assert.equal(meta.cross_device_sharing,sharing);
  assert.equal(meta.offline,false);
  assert.match(meta.executable_sha256,/^[a-f0-9]{64}$/);
  assert.match(meta.bundle_sha256,/^[a-f0-9]{64}$/,'require build-provenance hash of bundled JS flags');
}

async function checkedArtifact(app, api, expected, sharing) {
  assert(app);
  assert.equal((await readFile(path.join(app,'SourceCommit.txt'),'utf8')).trim(),expected);
  const meta=JSON.parse(await readFile(path.join(app,'InviteJourneyBuild.json'),'utf8'));
  validateArtifact(meta,api,expected,sharing);
  const plist=path.join(app,'Info.plist');
  assert.equal(exec('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',plist],{encoding:'utf8'}).trim(),appId);
  const executable=exec('/usr/libexec/PlistBuddy',['-c','Print :CFBundleExecutable',plist],{encoding:'utf8'}).trim();
  assert.match(executable,/^[A-Za-z0-9_.-]+$/);assert.notEqual(executable,'.');assert.notEqual(executable,'..');
  assert.equal(createHash('sha256').update(await readFile(path.join(app,executable))).digest('hex'),meta.executable_sha256);
  assert.equal(createHash('sha256').update(await readFile(path.join(app,'main.jsbundle'))).digest('hex'),meta.bundle_sha256);
  return meta;
}

async function responseJSON(seed,sub,{actor=seed.anonKey,method='GET',body}={}) {
  assert.match(sub,/^\/(auth|rest)\/v1\//);
  const headers={apikey:seed.anonKey, Authorization:'Bearer '+actor};
  if(body)headers['Content-Type']='application/json';
  const response=await fetch(seed.api+sub,{headers,method,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(12000)});
  assert(response.ok,'Disposable HTTP assertion failed: '+response.status);
  return response.json();
}
export async function main(env=process.env) {
  assert.equal(process.platform,'darwin','Native execution belongs to dedicated macOS E2E');
  const { INVITE_HOST_UDID: host, INVITE_GUEST_UDID: guest, INVITE_NEGATIVE_UDID: negative,
    INVITE_APP: app, INVITE_NEGATIVE_APP: negativeApp, INVITE_EXPECT_SOURCE: source, OUT_DIR:out}=env;
  assert(out);assert.match(source,/^[a-f0-9]{40}$/);
  assert([host,guest,negative].every(v=>uuid.test(v??'')) && new Set([host,guest,negative]).size===3,
    'Require three distinct E2E-owned devices; never mutate a positive device for the negative case');
  const sf=await lstat(env.INVITE_STATUS);
  assert(sf.isFile() && (sf.mode&0o077)===0,'Disposable status file must be private');
  const status=JSON.parse(await readFile(env.INVITE_STATUS,'utf8'));
  const seed={api:disposableURL(status.API_URL),anonKey:status.ANON_KEY,adminKey:status.SERVICE_ROLE_KEY,
    name:'Native Journey '+randomBytes(6).toString('hex'),
    email:'native-journey-'+randomBytes(16).toString('hex')+'@example.test',password:randomBytes(32).toString('hex')};
  assert(seed.anonKey && seed.adminKey && seed.anonKey!==seed.adminKey);
  const artifact=await checkedArtifact(app,seed.api,source,true);
  const negativeArtifact=await checkedArtifact(negativeApp,seed.api,source,false);
  assert.notEqual(path.resolve(app),path.resolve(negativeApp));
  assert.notEqual(artifact.bundle_sha256,negativeArtifact.bundle_sha256,'positive and negative JS artifacts must differ');
  const devices=JSON.parse(exec('xcrun',['simctl','list','devices','-j'],{encoding:'utf8'}));
  for (const udid of [host,guest,negative]){
    const d=Object.values(devices.devices).flat().find(d=>d.udid===udid);
    assert(d && d.name.startsWith('e2e-invite-') && d.state==='Booted','Booted E2E-owned simulator required');
    let installed=false;
    try{exec('xcrun',['simctl','get_app_container',udid,appId,'app']);installed=true;}catch(error){
      assert(error.status>0,'could not inspect dedicated simulator');
    }
    assert(!installed,'a fresh dedicated simulator must not already have this app installed');
  }
  await mkdir(out,{recursive:false,mode:0o700}); // new run directory, never overwrite prior receipt
  const work=await mkdtemp(path.join(tmpdir(),'invite-native-manual-private-'));
  let phase=0;
  async function flow(udid,steps){
    assert(!steps.some(s=>Object.hasOwn(s,'openLink')),'This acceptance journey must use only the native UI');
    const filename=path.join(work,'phase-'+(++phase)+'.yaml');
    await writeFile(filename,JSON.stringify({appId})+'\n---\n'+JSON.stringify(steps)+'\n',{mode:0o600});
    try{exec(env.INVITE_MAESTRO||'maestro',['--device',udid,'test',filename],{cwd:work,timeout:180000});}
    catch {throw Error('Native manual phase '+phase+' failed (private flow/logs omitted)');}
  }
  const screenshot=(udid,stage)=>exec('xcrun',['simctl','io',udid,'screenshot',path.join(out,stage+'.png')]);
  const cold=udid=>exec('xcrun',['simctl','terminate',udid,appId]); // do not silently accept a failed termination
  try {
    await responseJSON(seed,'/auth/v1/health');
    seed.hostSession=await responseJSON(seed,'/auth/v1/signup',{method:'POST',body:{email:seed.email,password:seed.password,data:{full_name:hostName}}});
    assert(seed.hostSession.access_token && uuid.test(seed.hostSession.user?.id??'') && !seed.hostSession.user.is_anonymous);
    const contestFilter=new URLSearchParams({owner_id:'eq.'+seed.hostSession.user.id,name:'eq.'+seed.name,select:'id,owner_id,name,created_at'});
    const contests=()=>responseJSON(seed,'/rest/v1/contests?'+contestFilter,{actor:seed.adminKey});
    assert.deepEqual(await contests(),[],'fresh contest must not be pre-seeded');
    seed.startedAt=Math.floor(Date.now()/1000)*1000;
    for(const udid of [host,guest])exec('xcrun',['simctl','install',udid,app]);
    exec('xcrun',['simctl','install',negative,negativeApp]);
    await flow(host,signInSteps(seed.email,seed.password));
    await flow(host,hostCreateSteps(seed.name));
    const f=await eventually(async()=>{
      const rows=await contests();assert.equal(rows.length,1);assert.match(rows[0].id,uuid);
      const snapshot=await responseJSON(seed,'/rest/v1/rpc/fetch_snapshot',{actor:seed.hostSession.access_token,method:'POST',body:{contest_id:rows[0].id,after_revision:0}});
      const f=deriveFreshFixture(seed,rows[0],snapshot);validateFixture(f);return f;
    });
    await flow(host,[wait({id:'organizer-join-code',text:'Join code: '+f.code})]);
    screenshot(host,'fresh-host-code');
    await flow(guest,guestRequestSteps(f.code));
    screenshot(guest,'guest-pending');
    const db={
      read: resource=>responseJSON(seed,'/rest/v1/'+resource,{actor:seed.adminKey}),
      snapshot: ()=>responseJSON(seed,'/rest/v1/rpc/fetch_snapshot',{actor:seed.hostSession.access_token,method:'POST',body:{contest_id:f.contestId,after_revision:0}})
    };
    const request=await eventually(async()=>{
      const requests=await db.read('contest_join_requests?contest_id=eq.'+f.contestId+'&status=eq.pending&select=*');
      assert.equal(requests.length,1);return requests[0];
    });
    assert.match(request.requester,uuid);
    assert.equal((await responseJSON(seed,'/auth/v1/admin/users/'+request.requester,{actor:seed.adminKey})).is_anonymous,true);
    await flow(host,[tap(id('round-status-chip')),tap('Online sync'),wait(guestVisitor+' requests a player slot'),tap('Approve as '+guestName),tap('^Approve$')]);
    const checkBinding=async ()=>{
      const rows=await db.read('contest_memberships?contest_id=eq.'+f.contestId+'&user_id=eq.'+request.requester+'&select=*');
      assert.equal(rows.length,1);assertBinding(f,rows[0],request.requester);
    };
    await eventually(checkBinding);
    await flow(guest,[wait(seed.name+' · Approved online scorecard'),wait('Hole 1 · current clear · par 4'),
      tap(seed.name+' hole 1 strokes'),{inputText:'6'},{hideKeyboard:{}},tap('^Save hole 1$'),wait('Hole 1 · current 6 · par 4')]);
    await flow(host,[tap(id('round-status-done')),tap('^Scorecard$'),tap('^Group 1$'),tap(id('score-par-'+hostName))]);
    await eventually(async()=>assertScores(f,await db.snapshot()));
    cold(guest);cold(host);
    await flow(guest,[...guestReconnectSteps(seed.name),wait('Hole 1 · current 6 · par 4')]);
    await flow(host,[...hostReopenSteps(seed.name),tap('^Scorecard$'),tap('^Group 1$'),
      {assertVisible:{id:'score-par-'+hostName,text:'^4$'}},tap('^Group 2$'),{assertVisible:{id:'score-par-'+guestName,text:'^6$'}}]);
    await checkBinding();assertScores(f,await db.snapshot());
    screenshot(guest,'guest-cold-score');screenshot(host,'host-cold-guest-score');
    await responseJSON(seed,'/auth/v1/health');
    await flow(negative,hiddenEntrySteps(seed.email,seed.password));
    await responseJSON(seed,'/auth/v1/health');
    await checkBinding();assertScores(f,await db.snapshot());
    screenshot(negative,'flag-off-home');
    await writeFile(path.join(out,'receipt.json'),JSON.stringify({
      status:'PASS',platform:'ios',source_sha:source,artifact_executable_sha256:artifact.executable_sha256,
      artifact_bundle_sha256:artifact.bundle_sha256,negative_artifact_executable_sha256:negativeArtifact.executable_sha256,
      negative_artifact_bundle_sha256:negativeArtifact.bundle_sha256,contestId:f.contestId,roundId:f.roundId,
      checks:['authenticated Home manual entry visible','fresh owner contest created and enrolled in UI',
        'guest enters code via first-run Join a group, pending then host-approved exact binding',
        'host and guest score convergence and normal-UI cold reconnect',
        'flag-off entry hidden on onboarding, sign-in and Home while disposable backend remains healthy'],
      limitations:['iOS native-only','no league evidence','no store upload','no layout evidence matrix']
    }),{mode:0o600,flag:'wx'});
  }finally{await rm(work,{recursive:true,force:true});}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(()=>{console.error('Native manual acceptance failed; no release verdict. Check dedicated device and private phase evidence.');process.exitCode=1;});
