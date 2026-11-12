import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {cases} from './adapter.mjs';
const yaml=createRequire(import.meta.url)('js-yaml');
const manifest=JSON.parse(fs.readFileSync(new URL('./journeys.json',import.meta.url)));
const workflow=yaml.load(fs.readFileSync(new URL('../../../.github/workflows/web-smoke.yml',import.meta.url),'utf8'));
const required=['J-delete-account','J-settings-control-inventory','J-by-game-nine','J-by-game-pending','J-settlement-mark-lifecycle','J-settlement-tab-runtime-recalc','J-trial-preview-unloaded'];
function registered(m,w){
 const steps=w.jobs['browser-flows'].steps,gate=steps.find(s=>s.name==='Journey budgets and reachability');
 assert.equal(gate['timeout-minutes'],2);
 assert.match(gate.run,/for profile in iphone-se iphone-15-pro iphone-pro-max; do/);
 assert.match(gate.run,/DEVICE_PROFILE="\$profile" BASE_URL=http:\/\/127\.0\.0\.1:8092 OUT_DIR="e2e\/journey-screens\/\$profile" node e2e\/journeys\/runner\.mjs/);
 assert.match(gate.run,/for pid in "\$\{pids\[@\]\}"; do wait "\$pid" \|\| status=1; done/);
 assert(!/JOURNEYS=/.test(gate.run),'All registered journeys must run');
 for(const file of ['fixture-origin.test.mjs','ci-registration.test.mjs','settled-timestamp.browser.test.mjs','negative-proof.mjs'])assert(gate.run.includes(file),file);
 const upload=steps[steps.indexOf(gate)+1];assert.equal(upload.name,'Upload journey screenshots');assert.equal(upload.if,'always()');assert.equal(upload.with.path,'scoresnap/e2e/journey-screens');
 for(const id of required){const j=m.journeys.find(j=>j.id===id);assert(j,id);assert.equal(j.status,'gated');assert.equal(typeof cases[id],'function');assert(j.assertions.length>0);assert(j.requiredSteps.length>0);assert.equal(new Set(j.requiredSteps).size,j.requiredSteps.length);}
 assert(w.jobs['build-standard'].steps.some(s=>s.run==='npm test -- --runInBand'));
 const exports=w.jobs['build-standard'].steps.find(s=>s.name==='Export Pro flag off and on with isolated Metro caches');
 assert(exports,'AUG-852 requires the isolated Pro flag exports');
 assert.match(exports.run,/EXPO_PUBLIC_PRO_ENABLED=false EXPO_PUBLIC_OFFLINE_MODE=true TMPDIR="\$RUNNER_TEMP\/metro-cache-pro-off"[\s\S]*?--output-dir dist-web-pro-off --clear/);
 assert.match(exports.run,/EXPO_PUBLIC_PRO_ENABLED=true EXPO_PUBLIC_OFFLINE_MODE=true TMPDIR="\$RUNNER_TEMP\/metro-cache-pro-on"[\s\S]*?--output-dir dist-web-pro-on --clear/);
 assert(w.jobs['build-standard'].steps.some(s=>s.name==='Install Chromium for Pro-off acceptance journey'&&s.uses==='./.github/actions/playwright-chromium'));
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
 const chromiumIndex=w.jobs['build-standard'].steps.findIndex(s=>s.uses==='./.github/actions/playwright-chromium');
 assert(chromiumIndex>-1&&chromiumIndex<journeyIndex,'shared Chromium setup must run before the Pro-off browser journey');
 for(const [name,directory] of [['pro-off-free-journey-','scoresnap/e2e/journey-screens/pro-off-free'],['pro-on-negative-journey-','scoresnap/e2e/journey-screens/pro-on-negative']]){
  const artifact=w.jobs['build-standard'].steps.find(s=>s.uses==='actions/upload-artifact@v4'&&s.with.name.startsWith(name));
  assert(artifact,'missing artifact '+name);
  assert.equal(artifact.if,'always()');
  assert.equal(artifact.with.path,directory);
  assert.equal(artifact.with['if-no-files-found'],'error');
 }
}
test('all accepted bugs run unfiltered on every device profile in existing two-minute CI step',()=>registered(manifest,workflow));
test('missing registration, capture, control or filtered execution fails integration contract',()=>{
 for(const mutate of [m=>m.journeys.splice(m.journeys.findIndex(j=>j.id==='J-trial-preview-unloaded'),1),m=>m.journeys.find(j=>j.id==='J-by-game-pending').requiredSteps=[],m=>m.journeys.find(j=>j.id==='J-delete-account').status='deferred']){const m=structuredClone(manifest);mutate(m);assert.throws(()=>registered(m,workflow));}
 for(const mutate of [w=>{const s=w.jobs['build-standard'].steps.find(s=>s.name?.startsWith('Export Pro flag'));s.run=s.run.replace('EXPO_PUBLIC_PRO_ENABLED=false','EXPO_PUBLIC_PRO_ENABLED=true');},w=>{const s=w.jobs['build-standard'].steps.find(s=>s.name?.startsWith('Pro flag-off'));s.run=s.run.replace('BASE_URL=http://127.0.0.1:8094 OUT_DIR=e2e/journey-screens/pro-on-negative node e2e/journeys/pro-off-free.mjs','echo no-op');},w=>{for(const s of w.jobs['build-standard'].steps.filter(s=>s.with?.name?.startsWith('pro-'))){s.if='false';s.with.path='scoresnap/missing';}},w=>{const steps=w.jobs['build-standard'].steps;const i=steps.findIndex(s=>s.uses==='./.github/actions/playwright-chromium');const [setup]=steps.splice(i,1);steps.push(setup);}]){const w=structuredClone(workflow);mutate(w);assert.throws(()=>registered(manifest,w));}
 for(const transform of [s=>s.replace('settled-timestamp.browser.test.mjs','omitted-control.mjs'),s=>'JOURNEYS=J-delete-account '+s,s=>s.replace('iphone-pro-max','missing-profile')]){const w=structuredClone(workflow);const step=w.jobs['browser-flows'].steps.find(s=>s.name==='Journey budgets and reachability');step.run=transform(step.run);assert.throws(()=>registered(manifest,w));}
});
