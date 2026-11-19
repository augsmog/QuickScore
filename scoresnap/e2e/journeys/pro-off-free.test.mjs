import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';
const workflow=yaml.load(fs.readFileSync(new URL('../../../.github/workflows/web-smoke.yml',import.meta.url),'utf8'));
test('flag-off free browser journey is registered in the dedicated CI leg',()=>{
 const job=workflow.jobs['flag-off-free-journey'];assert(job);
 assert.equal(job.env.EXPO_PUBLIC_PRO_ENABLED,'false');
 assert.equal(job.env.EXPO_PUBLIC_OFFLINE_MODE,'true');
 const runs=job.steps.map(s=>s.run||'').join('\n');
 assert.match(runs,/expo export --platform web/);
 assert.match(runs,/pro-off-free\.mjs/);
 assert.match(runs,/--expect-paywall/);
 assert.match(fs.readFileSync(new URL('./pro-off-free.mjs',import.meta.url),'utf8'),/getByTestId\('score-par-Casey'\)/);
});
