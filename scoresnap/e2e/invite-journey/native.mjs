// Opt-in, two existing dedicated simulators; never builds an app or calls production.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { backend, validateFixture, assertBinding, assertScores, assertShare, eventually } from './contract.mjs';
const appId='com.scoresnap.app';
export function validateArtifact(meta,f,source) {
  assert.equal(meta.schema,'invite-journey-app/1');assert.equal(meta.source_sha,source);
  assert.equal(meta.api,f.api);assert.equal(meta.cross_device_sharing,true);assert.equal(meta.offline,false);
  assert.match(source,/^[a-f0-9]{40}$/);assert.match(meta.executable_sha256,/^[a-f0-9]{64}$/);
}
export async function main(env=process.env) {
  assert.equal(process.platform,'darwin','Native execution belongs to macOS E2E, not a box lane');
  const f=JSON.parse(await readFile(env.INVITE_FIXTURE,'utf8'));validateFixture(f);
  const app=env.INVITE_APP,out=env.OUT_DIR;assert(app && out);await mkdir(out,{recursive:true});
  const source=(await readFile(path.join(app,'SourceCommit.txt'),'utf8')).trim();
  const meta=JSON.parse(await readFile(path.join(app,'InviteJourneyBuild.json'),'utf8'));validateArtifact(meta,f,source);
  const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
  execFileSync('git',['merge-base','--is-ancestor','6017bec355cae206fa7bb3da583859736c7ad57e',source],{cwd:repo,stdio:'pipe'});
  const executable=execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleExecutable',path.join(app,'Info.plist')],{encoding:'utf8'}).trim();
  assert.equal(createHash('sha256').update(await readFile(path.join(app,executable))).digest('hex'),meta.executable_sha256);
  const host=env.INVITE_HOST_UDID,guest=env.INVITE_GUEST_UDID;assert(host && guest && host!==guest,'Two different dedicated simulator UDIDs required');
  const devices=JSON.parse(execFileSync('xcrun',['simctl','list','devices','-j'],{encoding:'utf8'}));
  for(const udid of [host,guest]) {
    const d=Object.values(devices.devices).flat().find(d=>d.udid===udid);
    assert(d && d.name.startsWith('e2e-invite-') && d.state==='Booted','Requires booted E2E-owned disposable simulator');
  }
  const work=await mkdtemp(path.join(tmpdir(),'invite-private-'));
  const db=backend(f),tap=text=>({tapOn:text}),visible=text=>({extendedWaitUntil:{visible:text,timeout:30000}});
  const open=link=>[{openLink:link},{tapOn:{text:'Open',optional:true}}];
  const launch={launchApp:{clearState:false,permissions:{all:'allow'}}};
  const cold=udid=>{try{execFileSync('xcrun',['simctl','terminate',udid,appId],{stdio:'pipe'});}catch{} };
  let phase=0;
  async function flow(udid,steps) {
    const filename=path.join(work,`phase-${++phase}.yaml`);
    await writeFile(filename,`${JSON.stringify({appId})}\n---\n${JSON.stringify(steps)}\n`,{mode:0o600});
    try {execFileSync('maestro',['--device',udid,'test',filename],{cwd:work,stdio:'pipe',timeout:180000});}
    catch {throw Error(`Native phase ${phase} failed; private logs are not published`);}
  }
  async function shot(udid,name){execFileSync('xcrun',['simctl','io',udid,'screenshot',path.join(out,`${name}.png`)],{stdio:'pipe'});}
  try {
    for(const udid of [host,guest])execFileSync('xcrun',['simctl','install',udid,app],{stdio:'pipe'});
    // E2E must supply fresh simulators; never seed an approved guest session or final local scores.
    await flow(host,[launch,{tapOn:{text:'Skip',optional:true}},...open('snapscore://auth/sign-in'),tap('Already have an account? Sign in'),tap('Email address'),{inputText:f.hostEmail},tap('Password'),{inputText:f.hostPassword},tap('Sign In'),{extendedWaitUntil:{visible:{id:'home-new-contest'},timeout:30000}}]);
    cold(host);
    await flow(host,[launch,...open(`snapscore://contest/${f.contestId}`),visible(`Join code: ${f.code}`),{assertNotVisible:'Enable online sharing'},tap('Copy / share invite'),tap('Copy')]);
    assertShare(f,execFileSync('xcrun',['simctl','pbpaste',host],{encoding:'utf8'}));
    await shot(host,'restored-canonical-invite');
    await flow(guest,[launch,{tapOn:{text:'Skip',optional:true}},...open(`snapscore://join/${f.code}`),visible('Join with code'),tap('Display name'),{inputText:'Journey Visitor'},tap('Find contest'),visible('Request sent.*'),{assertNotVisible:'.*Guest sign-in unavailable.*'},{assertNotVisible:'.*Approved online scorecard.*'}]);
    const request=await eventually(async()=>{const r=await db.read(`contest_join_requests?contest_id=eq.${f.contestId}&status=eq.pending&select=*`);assert.equal(r.length,1);return r[0];});
    const auth=await fetch(`${f.api}/auth/v1/admin/users/${request.requester}`,{headers:{apikey:f.anonKey,Authorization:`Bearer ${f.adminKey}`}});
    assert(auth.ok);assert.equal((await auth.json()).is_anonymous,true);
    await flow(host,[tap({id:'round-status-chip'}),tap('Online sync'),visible('Journey Visitor requests a player slot'),tap(`Approve as ${f.players[1].name}`),tap('Approve')]);
    await eventually(async()=>{const m=await db.read(`contest_memberships?contest_id=eq.${f.contestId}&user_id=eq.${request.requester}&select=*`);assert.equal(m.length,1);assertBinding(f,m[0],request.requester);});
    cold(guest);
    await flow(guest,[launch,...open(`snapscore://join/${f.code}`),visible('.*Approved online scorecard.*'),tap('Journey Round hole 1 strokes'),{eraseText:2},{inputText:'6'},tap('Save hole 1'),visible('Hole 1 · current 6 · par 4')]);
    await flow(host,[tap({id:'round-status-done'}),...open(`snapscore://contest/${f.contestId}/scorecard`),tap('Journey Group 1'),tap({id:'score-par-Journey Host'})]);
    await eventually(async()=>assertScores(f,await db.snapshot()));
    // Cold process reconnect, preserving each app installation and its identity.
    for(const udid of [host,guest])cold(udid);
    await flow(guest,[launch,...open(`snapscore://join/${f.code}`),visible('Hole 1 · current 6 · par 4')]);
    await flow(host,[launch,...open(`snapscore://contest/${f.contestId}/scorecard`),tap('Journey Group 1'),{assertVisible:{id:'score-par-Journey Host',text:'4'}},tap('Journey Group 2'),{assertVisible:{id:'score-par-Journey Guest',text:'6'}}]);
    assertScores(f,await db.snapshot());
    const m=await db.read(`contest_memberships?contest_id=eq.${f.contestId}&user_id=eq.${request.requester}&select=*`);assert.equal(m.length,1);assertBinding(f,m[0],request.requester);
    await shot(host,'two-group-persisted');await shot(guest,'anonymous-rejoined');
    await writeFile(path.join(out,'receipt.json'),JSON.stringify({status:'PASS',platform:'ios',source_sha:source,artifact_executable_sha256:meta.executable_sha256,contestId:f.contestId,roundId:f.roundId,players:f.players,checks:['canonical restored display and actual copied share','anonymous UI pending and host approval','intended binding','two-group score identity and cold reconnect persistence']}));
  } finally {await rm(work,{recursive:true,force:true});}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Native invite journey failed; check artifact compatibility and phase evidence (private credentials omitted)');process.exitCode=1;});
