import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {cases} from './adapter.mjs';
const yaml=createRequire(import.meta.url)('js-yaml');
const manifest=JSON.parse(fs.readFileSync(new URL('./journeys.json',import.meta.url)));
const workflow=yaml.load(fs.readFileSync(new URL('../../../.github/workflows/web-smoke.yml',import.meta.url),'utf8'));
const required=['J-delete-account','J-settings-control-inventory','J-by-game-nine','J-by-game-pending','J-settlement-mark-lifecycle','J-settlement-tab-runtime-recalc','J-trial-preview-unloaded'];
function registered(m,w){
 const steps=w.jobs['browser-flows'].steps;
 const contracts=steps.find(s=>s.name==='Journey contract tests');
 const gate=steps.find(s=>s.name==='Journey runner + negative proof');
 assert(contracts,'separate contract-test step');
 assert(gate,'separate runner step');
 assert.equal(steps.indexOf(gate),steps.indexOf(contracts)+1);
 for(const step of [contracts,gate]){
  assert.equal(step['timeout-minutes'],3);
  assert.equal(step.if,undefined);
  assert.equal(step['continue-on-error'],undefined);
 }
 assert.equal((contracts.run.match(/node --test /g)||[]).length,4);
 for(const file of ['metrics','glyph-evidence','glyph-evidence.browser','paywall-recovery','reach-report','paywall-badge.browser','acceptance-fixtures','offline-containment','punctuation-reference','probe-target','settlement-row-contract','text-fragments','focused-fixtures','fixture-origin','game-rules','ci-registration','punctuation-reference.browser','review-negative.browser','value-dom-regressions.browser','settled-timestamp.browser'])assert(contracts.run.includes(`${file}.test.mjs`),file);
 assert(gate.run.includes('negative-proof.mjs'));
 assert.match(gate.run,/for profile in iphone-se iphone-15-pro iphone-pro-max; do/);
 assert.match(gate.run,/DEVICE_PROFILE="\$profile" BASE_URL=http:\/\/127\.0\.0\.1:8092 OUT_DIR="e2e\/journey-screens\/\$profile" node e2e\/journeys\/runner\.mjs/);
 assert.match(gate.run,/for pid in "\$\{pids\[@\]\}"; do wait "\$pid" \|\| status=1; done/);
 assert(!/JOURNEYS=/.test(gate.run),'All registered journeys must run');
 const upload=steps[steps.indexOf(gate)+1];assert.equal(upload.name,'Upload journey screenshots');assert.equal(upload.if,'always()');assert.equal(upload.with.path,'scoresnap/e2e/journey-screens');
 for(const id of required){const j=m.journeys.find(j=>j.id===id);assert(j,id);assert.equal(j.status,'gated');assert.equal(typeof cases[id],'function');assert(j.assertions.length>0);assert(j.requiredSteps.length>0);assert.equal(new Set(j.requiredSteps).size,j.requiredSteps.length);}
 assert(w.jobs['build-standard'].steps.some(s=>s.run==='npm test -- --runInBand'));
 const exports=w.jobs['build-standard'].steps.find(s=>s.name==='Export Pro flag off and on with isolated Metro caches');
 assert(exports,'AUG-852 requires the isolated Pro flag exports');
 assert.match(exports.run,/EXPO_PUBLIC_PRO_ENABLED=false EXPO_PUBLIC_OFFLINE_MODE=true TMPDIR="\$RUNNER_TEMP\/metro-cache-pro-off"[\s\S]*?--output-dir dist-web-pro-off --clear/);
 assert.match(exports.run,/EXPO_PUBLIC_PRO_ENABLED=true EXPO_PUBLIC_OFFLINE_MODE=true TMPDIR="\$RUNNER_TEMP\/metro-cache-pro-on"[\s\S]*?--output-dir dist-web-pro-on --clear/);
 assert(w.jobs['build-standard'].steps.some(s=>s.name==='Install Chromium for Pro-off acceptance journey'&&s.run==='npx playwright install --with-deps chromium'));
 const proJourney=w.jobs['build-standard'].steps.find(s=>s.name==='Pro flag-off Playwright journey and flag-on negative proof');
 assert(proJourney,'AUG-852 Pro-off browser journey must run in build-standard');
 assert.match(proJourney.run,/BASE_URL=http:\/\/127\.0\.0\.1:8093 OUT_DIR=e2e\/journey-screens\/pro-off-free node e2e\/journeys\/pro-off-free\.mjs/);
 assert.match(proJourney.run,/BASE_URL=http:\/\/127\.0\.0\.1:8094 OUT_DIR=e2e\/journey-screens\/pro-on-negative node e2e\/journeys\/pro-off-free\.mjs/);
 assert.match(proJourney.run,/negative_status=\$\?/);
 assert.match(proJourney.run,/if \[ "\$negative_status" -eq 0 \]; then[\s\S]*?exit 1/);
 assert.match(proJourney.run,/grep -E 'FIRST_PRO_GATE \(skins-create\|settlement\):' e2e\/journey-screens\/pro-on-negative\/run\.log/);
 const exportIndex=w.jobs['build-standard'].steps.indexOf(exports);
 const journeyIndex=w.jobs['build-standard'].steps.indexOf(proJourney);
 assert(journeyIndex>exportIndex,'journey must run after both isolated exports');
 for(const [name,directory] of [['pro-off-free-journey-','scoresnap/e2e/journey-screens/pro-off-free'],['pro-on-negative-journey-','scoresnap/e2e/journey-screens/pro-on-negative']]){
  const artifact=w.jobs['build-standard'].steps.find(s=>s.uses==='actions/upload-artifact@v4'&&s.with.name.startsWith(name));
  assert(artifact,'missing artifact '+name);
  assert.equal(artifact.if,'always()');
  assert.equal(artifact.with.path,directory);
  assert.equal(artifact.with['if-no-files-found'],'error');
 }
}
test('all accepted bugs run unfiltered on every device profile in separately bounded CI steps',()=>registered(manifest,workflow));
test('missing registration, capture, control or filtered execution fails integration contract',()=>{
 for(const mutate of [m=>m.journeys.splice(m.journeys.findIndex(j=>j.id==='J-trial-preview-unloaded'),1),m=>m.journeys.find(j=>j.id==='J-by-game-pending').requiredSteps=[],m=>m.journeys.find(j=>j.id==='J-delete-account').status='deferred']){const m=structuredClone(manifest);mutate(m);assert.throws(()=>registered(m,workflow));}
 for(const mutate of [w=>{const s=w.jobs['build-standard'].steps.find(s=>s.name?.startsWith('Export Pro flag'));s.run=s.run.replace('EXPO_PUBLIC_PRO_ENABLED=false','EXPO_PUBLIC_PRO_ENABLED=true');},w=>{const s=w.jobs['build-standard'].steps.find(s=>s.name?.startsWith('Pro flag-off'));s.run=s.run.replace('BASE_URL=http://127.0.0.1:8094 OUT_DIR=e2e/journey-screens/pro-on-negative node e2e/journeys/pro-off-free.mjs','echo no-op');},w=>{for(const s of w.jobs['build-standard'].steps.filter(s=>s.with?.name?.startsWith('pro-'))){s.if='false';s.with.path='scoresnap/missing';}}]){const w=structuredClone(workflow);mutate(w);assert.throws(()=>registered(manifest,w));}
 for(const [name,transform] of [
  ['Journey contract tests',s=>s.replace('settled-timestamp.browser.test.mjs','omitted-control.mjs')],
  ['Journey runner + negative proof',s=>'JOURNEYS=J-delete-account '+s],
  ['Journey runner + negative proof',s=>s.replace('iphone-pro-max','missing-profile')],
  ['Journey runner + negative proof',s=>s.replace('negative-proof.mjs','omitted-proof.mjs')],
 ]){const w=structuredClone(workflow);const step=w.jobs['browser-flows'].steps.find(s=>s.name===name);step.run=transform(step.run);assert.throws(()=>registered(manifest,w));}
 for(const name of ['Journey contract tests','Journey runner + negative proof']){
  for(const mutate of [s=>s['timeout-minutes']=2,s=>s['timeout-minutes']=6,s=>s['continue-on-error']=true,s=>s.if='false']){
   const w=structuredClone(workflow);mutate(w.jobs['browser-flows'].steps.find(s=>s.name===name));assert.throws(()=>registered(manifest,w));
  }
 }
});

// Execute the real YAML shell with a cheap node stand-in: no browsers or recursive tests.
// This catches timing wrappers swallowing failures, removed waits, and skipped proof.
function runStep(name,fail=''){
 const step=workflow.jobs['browser-flows'].steps.find(s=>s.name===name);
 assert(step,`missing ${name}`);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'journey-ci-'));
 try{
  fs.mkdirSync(path.join(dir,'e2e/journey-screens'),{recursive:true});
  fs.writeFileSync(path.join(dir,'node'),`#!/bin/bash
key="$*"
if [[ "$1" == "e2e/journeys/runner.mjs" ]]; then key="runner:$DEVICE_PROFILE"; fi
printf '%s\\n' "$key" >> "$COMMAND_LOG"
if [[ -n "$FAIL_COMMAND" && "$key" == *"$FAIL_COMMAND"* ]]; then exit 17; fi
`,{mode:0o755});
  const result=spawnSync('bash',['--noprofile','--norc','-e','-o','pipefail','-c',step.run],{
   cwd:dir,encoding:'utf8',timeout:10000,
   env:{...process.env,PATH:`${dir}:${process.env.PATH}`,COMMAND_LOG:path.join(dir,'commands.log'),FAIL_COMMAND:fail},
  });
  assert.ifError(result.error);
  const commands=fs.readFileSync(path.join(dir,'commands.log'),'utf8').trim().split('\n');
  const profiles=fs.readdirSync(path.join(dir,'e2e/journey-screens')).filter(f=>f.endsWith('-run.log')).map(f=>fs.readFileSync(path.join(dir,'e2e/journey-screens',f),'utf8')).join('\n');
  return {...result,commands,timings:result.stderr+profiles};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('contract batches log timings and preserve each failure exit',()=>{
 const name='Journey contract tests',ok=runStep(name);
 assert.equal(ok.status,0,ok.stderr);
 assert.equal(ok.commands.length,4);
 for(const label of ['contract-metrics','contract-badge','contract-fixtures','contract-browser'])assert.match(ok.timings,new RegExp(`JOURNEY_TIMING ${label} [0-9.]+ seconds`));
 for(const [index,file] of ['metrics.test.mjs','paywall-badge.browser.test.mjs','acceptance-fixtures.test.mjs','punctuation-reference.browser.test.mjs'].entries()){
  const failed=runStep(name,file);
  assert.equal(failed.status,17,`${file}: ${failed.stderr}`);
  assert.equal(failed.commands.length,index+1,'failed batch must stop later batches');
 }
});
test('runner step waits for every profile and runs negative proof only after all pass',()=>{
 const name='Journey runner + negative proof',ok=runStep(name);
 assert.equal(ok.status,0,ok.stderr);
 assert.equal(ok.commands.length,4);
 assert.equal(ok.commands.at(-1),'e2e/journeys/negative-proof.mjs');
 for(const profile of ['iphone-se','iphone-15-pro','iphone-pro-max']){
  assert.match(ok.timings,new RegExp(`JOURNEY_TIMING runner-${profile} [0-9.]+ seconds`));
  const failed=runStep(name,`runner:${profile}`);
  assert.equal(failed.status,1,profile);
  assert.deepEqual(failed.commands.sort(),['runner:iphone-se','runner:iphone-15-pro','runner:iphone-pro-max'].sort());
 }
 assert.match(ok.timings,/JOURNEY_TIMING negative-proof [0-9.]+ seconds/);
 assert.equal(runStep(name,'negative-proof.mjs').status,17);
});
