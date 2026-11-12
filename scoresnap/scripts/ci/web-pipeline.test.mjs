import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createManifest, verifyManifest, currentIdentity, STANDARD_FLAGS } from './web-artifact.mjs';
import { assertWebGate, REQUIRED_WEB_JOBS } from './web-gate.mjs';

// js-yaml is already fixed in the existing npm lockfile (Jest dependency).
const yaml = createRequire(import.meta.url)('js-yaml');
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = yaml.load(fs.readFileSync(path.join(repository, '.github/workflows/web-smoke.yml'), 'utf8'));
const steps = job => workflow.jobs[job].steps;
const commands = job => steps(job).filter(step => step.run).map(step => step.run).join('\n');
const identity = { run: '12', attempt: '1', commit: 'abc', tree: 'def', workflow: 'w', lock: 'l', node: 'v22.23.4', imageOS: 'ubuntu24', imageVersion: '20261025.353.1', expo: '54', playwright: '1.64.1', flags: STANDARD_FLAGS };

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-artifact-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_expo/static/js/web'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<script src="/_expo/static/js/web/entry-a.js"></script>');
  fs.writeFileSync(path.join(root, '_expo/static/js/web/entry-a.js'), 'Build contests. Settle up.');
  fs.mkdirSync(path.join(root, '.well-known'));
  fs.writeFileSync(path.join(root, '.well-known/proof'), 'hidden files are inventoried');
  return root;
}

test('same-run exact standard artifact passes, including hidden files', t => {
  const root = fixture(t); const manifest = createManifest(root, identity);
  assert.ok(manifest.files.some(file => file.path === '.well-known/proof'));
  verifyManifest(root, identity, manifest);
});
for (const key of Object.keys(identity).filter(key => key !== 'imageVersion')) test(`reject changed ${key} provenance`, t => {
  const root = fixture(t); const manifest = createManifest(root, identity);
  assert.throws(() => verifyManifest(root, { ...identity, [key]: 'wrong' }, manifest), /provenance/);
});
test('runner image revision may differ within the same run; build image remains in the manifest', t => {
  const root = fixture(t); const manifest = createManifest(root, identity);
  verifyManifest(root, { ...identity, imageVersion: '20261101.360.1' }, manifest);
  assert.equal(manifest.identity.imageVersion, '20261025.353.1');
});
test('Node patch drift within one major passes; a different or unparsable major rejects', t => {
  const root = fixture(t); const manifest = createManifest(root, identity);
  verifyManifest(root, { ...identity, node: 'v22.24.0' }, manifest);
  for (const node of ['v24.1.0', 'v2.23.4', 'v22.garbage', 'v22.', ['v22.23.4'], '', undefined]) {
    assert.throws(() => verifyManifest(root, { ...identity, node }, manifest), /provenance/);
  }
});
test('manifest still requires a recorded build image and the exact identity key set', t => {
  const root = fixture(t);
  const { imageVersion, ...noImage } = identity;
  assert.throws(() => verifyManifest(root, identity, createManifest(root, noImage)), /provenance/);
  assert.throws(() => verifyManifest(root, identity, createManifest(root, { ...identity, extra: 'x' })), /provenance/);
  assert.throws(() => verifyManifest(root, identity, createManifest(root, { ...identity, nodeMajor: '22' })), /provenance/);
  const { lock, ...noLock } = identity;
  assert.throws(() => verifyManifest(root, identity, createManifest(root, noLock)), /provenance/);
});
for (const kind of ['changed', 'missing', 'extra', 'hidden', 'symlink', 'router-only', 'second-entry']) test(`reject ${kind} artifact`, t => {
  const root = fixture(t); const manifest = createManifest(root, identity);
  if (kind === 'changed') fs.appendFileSync(path.join(root, 'index.html'), 'changed');
  if (kind === 'missing') fs.unlinkSync(path.join(root, 'index.html'));
  if (kind === 'extra') fs.writeFileSync(path.join(root, 'extra.js'), 'extra');
  if (kind === 'hidden') fs.writeFileSync(path.join(root, '.well-known/proof'), 'changed');
  if (kind === 'symlink') fs.symlinkSync('index.html', path.join(root, 'link.html'));
  if (kind === 'router-only') fs.writeFileSync(path.join(root, '_expo/static/js/web/entry-a.js'), 'router only');
  if (kind === 'second-entry') fs.writeFileSync(path.join(root, '_expo/static/js/web/entry-b.js'), 'Build contests. Settle up.');
  assert.throws(() => verifyManifest(root, identity, manifest));
});
test('reject missing/malformed manifests', t => {
  const root = fixture(t);
  for (const bad of [null, {}, { schema: 2 }, { schema: 1, identity }]) assert.throws(() => verifyManifest(root, identity, bad));
});
test('CI identity binds actual checkout, lockfile, workflow and installed runtime', t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'web-ci-identity-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const app = path.join(repo, 'scoresnap');
  fs.mkdirSync(path.join(repo, '.github/workflows'), { recursive: true });
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(repo, '.github/workflows/web-smoke.yml'), 'workflow fixture');
  fs.writeFileSync(path.join(app, 'package-lock.json'), JSON.stringify({ packages: {
    'node_modules/expo': { version: '54' }, 'node_modules/playwright': { version: '1.64.1' },
  } }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
  const env = { GITHUB_RUN_ID: '12', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: git('rev-parse', 'HEAD'), ImageOS: 'ubuntu24', ImageVersion: '1' };
  const actual = currentIdentity(app, env);
  assert.equal(actual.commit, env.GITHUB_SHA);
  assert.equal(actual.tree, git('rev-parse', 'HEAD^{tree}'));
  assert.equal(actual.node, process.version);
  assert.equal(actual.expo, '54'); assert.equal(actual.playwright, '1.64.1');
  for (const key of Object.keys(env)) {
    const missing = { ...env }; delete missing[key];
    assert.throws(() => currentIdentity(app, missing), /Missing CI identity/);
  }
  assert.throws(() => currentIdentity(app, { ...env, GITHUB_SHA: 'different' }), /Checkout/);
  fs.appendFileSync(path.join(app, 'package-lock.json'), ' ');
  assert.throws(() => currentIdentity(app, env));
});

const success = () => Object.fromEntries(REQUIRED_WEB_JOBS.map(job => [job, { result: 'success' }]));
test('aggregate accepts only all required successes', () => assertWebGate(success()));
for (const job of REQUIRED_WEB_JOBS) for (const state of ['failure', 'cancelled', 'skipped', 'timed_out', 'neutral', '', null]) {
  test(`aggregate rejects ${job} ${state}`, () => {
    const needs = success(); needs[job].result = state;
    assert.throws(() => assertWebGate(needs));
  });
}
test('aggregate rejects absent/extra dependency and missing results', () => {
  for (const job of REQUIRED_WEB_JOBS) {
    const needs = success(); delete needs[job]; assert.throws(() => assertWebGate(needs));
    const noResult = success(); noResult[job] = {}; assert.throws(() => assertWebGate(noResult));
  }
  assert.throws(() => assertWebGate({ ...success(), unexpected: { result: 'success' } }));
  for (const invalid of [null, [], {}, 'success']) assert.throws(() => assertWebGate(invalid));
});
test('workflow retains triggers, permissions and established required check', () => {
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.ok(workflow.on.pull_request.paths.includes('scoresnap/**'));
  assert.ok(workflow.on.pull_request.paths.includes('.maestro/**'));
  assert.ok(workflow.on.pull_request.paths.includes('.github/workflows/web-smoke.yml'));
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs).sort(), [...REQUIRED_WEB_JOBS, 'web-smoke'].sort());
  assert.deepEqual(workflow.jobs['web-smoke'].needs, REQUIRED_WEB_JOBS);
  assert.equal(workflow.jobs['web-smoke'].if, '${{ always() }}');
  const gate = steps('web-smoke').find(step => step.name === 'Require every Web smoke lane');
  assert.equal(gate.env.NEEDS_JSON, '${{ toJSON(needs) }}');
  assert.equal(gate.run, 'node scoresnap/scripts/ci/web-gate.mjs');
  for (const job of Object.values(workflow.jobs)) assert.equal(job['continue-on-error'], undefined);
});
test('standard producer runs original unit gates and exact flag-specific export', () => {
  const build = steps('build-standard').find(step => step.name === 'Build and identify standard offline app');
  assert.deepEqual(build.env, STANDARD_FLAGS);
  assert.match(commands('build-standard'), /node --test e2e\/usability-gate\.test\.mjs scripts\/ci\/web-pipeline\.test\.mjs/);
  assert.match(commands('build-standard'), /npm test -- --runInBand/);
  assert.ok(build.run.indexOf('npx expo export --platform web --output-dir dist-web') < build.run.indexOf('web-artifact.mjs create'));
  const upload = steps('build-standard').find(step => step.uses === 'actions/upload-artifact@v4');
  assert.equal(upload.with.name, 'standard-web-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.equal(upload.with['include-hidden-files'], true);
  assert.match(upload.with.path, /scoresnap\/dist-web\nscoresnap\/ci-standard-manifest\.json/);
});
test('consumers verify same-attempt artifact before any browser runs', () => {
  for (const job of ['browser-flows', 'browser-matrix']) {
    assertBrowserSetupContract(workflow, job);
  }
});

function assertBrowserSetupContract(value, job) {
  assert.equal(value.jobs[job].needs, 'build-standard');
  const all = value.jobs[job].steps;
  const download = all.findIndex(step => step.uses === 'actions/download-artifact@v4');
  const verify = all.findIndex(step => step.run?.includes('web-artifact.mjs verify'));
  const setup = all.findIndex(step => step.uses === './.github/actions/playwright-chromium');
  const browser = all.findIndex(step => /^Browser (smoke|matrix)$/.test(step.name ?? ''));
  assert.ok(download >= 0 && verify > download && setup > verify && browser > setup,
    `${job} must download and verify the same-attempt artifact, install Chromium, then run browsers`);
  assert.equal(all[download].with.name, 'standard-web-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(all[download].with['run-id'], undefined);
  assert.equal(all[download].with['github-token'], undefined);
  assert.ok(all.some(step => step.run === 'npm ci'));
  assert.equal(all.filter(step => step.uses === './.github/actions/playwright-chromium').length, 1);
  assert.ok(!all.some(step => step.run?.includes('playwright install --with-deps chromium')),
    `${job} must use the shared Chromium action rather than the inline apt install`);
}

test('browser setup contract rejects a missing or misplaced shared Chromium action', () => {
  for (const mutate of [
    steps => { steps.splice(steps.findIndex(step => step.uses === './.github/actions/playwright-chromium'), 1); },
    steps => {
      const index = steps.findIndex(step => step.uses === './.github/actions/playwright-chromium');
      [steps[index], steps[index - 1]] = [steps[index - 1], steps[index]];
    },
    steps => {
      const index = steps.findIndex(step => step.uses === './.github/actions/playwright-chromium');
      [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
    },
  ]) {
    const copy = structuredClone(workflow);
    mutate(copy.jobs['browser-flows'].steps);
    assert.throws(() => assertBrowserSetupContract(copy, 'browser-flows'));
  }
});
test('all original browser coverage and flag-distinct builds remain', () => {
  const flows = commands('browser-flows');
  for (const script of ['web-real-flow.mjs', 'live-share.mjs', 'join-gate.mjs', 'usability.mjs', 'safe-area-sheets.mjs', 'usability-regression.mjs', 'journeys/metrics.test.mjs', 'journeys/glyph-evidence.test.mjs', 'journeys/glyph-evidence.browser.test.mjs', 'journeys/runner.mjs', 'journeys/negative-proof.mjs', 'scripts/render-scorecard.mjs']) assert.ok(flows.includes(script), script);
  const safeArea = steps('browser-flows').find(step => step.name?.startsWith('Safe-area sheets'));
  assert.deepEqual(safeArea.run.trim().split('\n').map(line => line.trim()), [
    'node --test e2e/safe-area-profiles.test.mjs',
    'for profile in iphone-se iphone-15-pro iphone-pro-max; do',
    'DEVICE_PROFILE="$profile" BASE_URL=http://127.0.0.1:8089 OUT_DIR="e2e/screens/safe-area/$profile" node e2e/safe-area-sheets.mjs',
    'done',
  ]);
  assert.equal((flows.match(/node e2e\/web-real-flow\.mjs/g) || []).length, 3);
  assert.equal((flows.match(/node e2e\/join-gate\.mjs/g) || []).length, 2);
  assert.match(flows, /EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING=true EXPO_PUBLIC_OFFLINE_MODE=true npx expo export --platform web --output-dir dist-web-sharing --clear/);
  assert.match(flows, /EXPO_PUBLIC_DEMO_MODE=true EXPO_PUBLIC_OFFLINE_MODE=true npx expo export --platform web --output-dir dist-web-scorecard --clear/);
  assert.match(flows, /if \[ "\$DEMO_BUNDLE" = "\$STANDARD_BUNDLE" \]/);
  assert.match(commands('browser-matrix'), /BASE_URL=http:\/\/127\.0\.0\.1:8089 OUT_DIR=e2e\/screens\/matrix npm run e2e:matrix -- --retries=1/);
  assert.ok(!flows.includes('npm run e2e:matrix'));
  assert.match(commands('browser-matrix'), /trap 'kill "\$SERVER_PID"/);
  for (const job of ['browser-flows', 'browser-matrix']) {
    for (const upload of steps(job).filter(step => step.uses === 'actions/upload-artifact@v4')) assert.equal(upload.if, 'always()');
  }
});

// AUG-293: exercise the workflow's actual explicit discovery, not filename assumptions.
function assertRecoveryWiring(value) {
  const steps=value.jobs['browser-flows'].steps;
  const contracts=steps.find(s=>s.name==='Journey contract tests');
  const step=steps.find(s=>s.name==='Journey runner + negative proof');
  for(const gate of [contracts,step]){
   assert.equal(gate['timeout-minutes'],3);
   assert.equal(gate.if,undefined);assert.equal(gate['continue-on-error'],undefined);
   assert.equal(gate.env?.JOURNEYS,undefined);
  }
  const lines=(contracts.run+'\n'+step.run).trim().split('\n').map(s=>s.trim().replace(/^time /,''));
  assert.ok(lines.includes('node --test e2e/journeys/metrics.test.mjs e2e/journeys/glyph-evidence.test.mjs e2e/journeys/glyph-evidence.browser.test.mjs e2e/journeys/paywall-recovery.test.mjs e2e/journeys/reach-report.test.mjs'));
  assert.ok(lines.includes('OUT_DIR=e2e/journey-screens/td-badge-controls node --test e2e/journeys/paywall-badge.browser.test.mjs'));
  assert.ok(lines.includes('for profile in iphone-se iphone-15-pro iphone-pro-max; do'));
  assert.ok(lines.includes('DEVICE_PROFILE="$profile" BASE_URL=http://127.0.0.1:8092 OUT_DIR="e2e/journey-screens/$profile" node e2e/journeys/runner.mjs'));
  assert.ok(lines.includes(') > "e2e/journey-screens/$profile-run.log" 2>&1 &'));
  assert.ok(lines.includes('for pid in "${pids[@]}"; do wait "$pid" || status=1; done'));
  assert.ok(lines.includes('if [ "$status" -ne 0 ]; then exit "$status"; fi'));
  assert.ok(lines.includes('BASE_URL=http://127.0.0.1:8092 OUT_DIR=e2e/journey-screens/negative-proof node e2e/journeys/negative-proof.mjs'));
  const upload=steps[steps.indexOf(step)+1];
  assert.equal(upload.name,'Upload journey screenshots');assert.equal(upload.if,'always()');
  assert.equal(upload.with.path,'scoresnap/e2e/journey-screens');
}
test('AUG-293 and per-profile reach reports run in the split CI steps',()=>{
 assertRecoveryWiring(workflow);
 for(const mutate of [s=>s.run=s.run.replace(' e2e/journeys/paywall-recovery.test.mjs',''),s=>s.run=s.run.split('\n').filter(l=>!l.includes('paywall-badge.browser')).join('\n'),s=>s.run=s.run.replace('for profile in iphone-se iphone-15-pro iphone-pro-max; do','for profile in iphone-se iphone-15-pro; do'),s=>s.run=s.run.replace('OUT_DIR="e2e/journey-screens/$profile" node e2e/journeys/runner.mjs','JOURNEYS=J-other OUT_DIR=e2e/journey-screens node e2e/journeys/runner.mjs'),s=>s.if='false',s=>s['continue-on-error']=true,s=>s['timeout-minutes']=2]){
  const copy=structuredClone(workflow);
  for(const step of copy.jobs['browser-flows'].steps.filter(s=>['Journey contract tests','Journey runner + negative proof'].includes(s.name)))mutate(step);
  assert.throws(()=>assertRecoveryWiring(copy));
 }
});

// ASC acceptance checks pinned approved source and rejected historical payloads.
test('build checkout retains history for ASC source provenance regressions', () => {
  const checkout = steps('build-standard').find(step => step.uses === 'actions/checkout@v4');
  assert.equal(checkout?.with?.['fetch-depth'], 0, 'ASC git-show acceptance requires complete history');
});
