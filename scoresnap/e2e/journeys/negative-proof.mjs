import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.env.OUT_DIR||'e2e/journey-screens/negative-proof');
fs.mkdirSync(root,{recursive:true});
const expected={hide:'control-hidden',rename:'accessible-name-mismatch',disable:'control-disabled','hide-label':'visible-text-missing','transparent-label':'visible-text-missing','label-overflow-clipped':'visible-text-missing','label-clip-path':'visible-text-missing','text-fill-transparent':'visible-text-missing','opaque-overlay':'visible-text-missing','striped-overlay':'visible-text-missing','pseudo-after-stripes':'visible-text-missing','currentcolor-overlay':'visible-text-missing','partial-striped-overlay':'visible-text-missing','sliver-striped-overlay':'visible-text-missing','textured-transparent-label':'visible-text-missing'};
const results=[];
for(const [mutation,signature] of Object.entries(expected)) {
  // A failed fresh invocation must never reuse a previous report.
  const out=fs.mkdtempSync(path.join(root,`${mutation}-`));
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('./runner.mjs',import.meta.url)),`--mutate=${mutation}`],{env:{...process.env,JOURNEYS:'J-home-create-cancel',OUT_DIR:out},encoding:'utf8',timeout:45000});
  fs.writeFileSync(path.join(root,`${mutation}.log`),child.stdout+child.stderr);
  assert.equal(child.error,undefined,`${mutation}: runner must complete`);
  assert.equal(child.status,1,`${mutation}: runner must go red`);
  const r=JSON.parse(fs.readFileSync(path.join(out,'journeys-results.json')));
  assert.equal(r.gate.status,'failed');assert.deepEqual(r.required,['J-home-create-cancel']);
  assert.equal(r.results[0].attempts[0].signature,signature,`${mutation}: unrelated failure cannot prove the gate`);
  assert.equal(r.results[0].status,'failed');
  assert.equal(r.mutation,mutation);
  results.push({mutation,out,exitCode:child.status,signature,proved:true});
  console.log(`PASS ${mutation}: runner RED (exit ${child.status}, ${signature})`);
}
fs.writeFileSync(path.join(root,'negative-proof-results.json'),JSON.stringify(results,null,2)+'\n');
