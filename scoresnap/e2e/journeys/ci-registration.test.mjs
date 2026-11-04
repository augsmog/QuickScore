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
}
test('all accepted bugs run unfiltered on every device profile in existing two-minute CI step',()=>registered(manifest,workflow));
test('missing registration, capture, control or filtered execution fails integration contract',()=>{
 for(const mutate of [m=>m.journeys.splice(m.journeys.findIndex(j=>j.id==='J-trial-preview-unloaded'),1),m=>m.journeys.find(j=>j.id==='J-by-game-pending').requiredSteps=[],m=>m.journeys.find(j=>j.id==='J-delete-account').status='deferred']){const m=structuredClone(manifest);mutate(m);assert.throws(()=>registered(m,workflow));}
 for(const transform of [s=>s.replace('settled-timestamp.browser.test.mjs','omitted-control.mjs'),s=>'JOURNEYS=J-delete-account '+s,s=>s.replace('iphone-pro-max','missing-profile')]){const w=structuredClone(workflow);const step=w.jobs['browser-flows'].steps.find(s=>s.name==='Journey budgets and reachability');step.run=transform(step.run);assert.throws(()=>registered(manifest,w));}
});
