// Shell-stub regressions for the native entry scripts (Codex check on 7116885, finding 1): run the
// REAL scripts against a throwaway repo copy with stubbed build/maestro/adb/reviewer commands and
// prove every path they invoke resolves and the candidate-bound pipeline reaches a verdict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const DL_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BUNDLER = `#!/usr/bin/env node
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
const a = process.argv.slice(2); const f = (n) => a[a.indexOf(n) + 1];
const out = f('--out'); const profile = f('--profile'); const platform = f('--platform');
const cfgText = readFileSync(new URL('../config/device-layout.config.json', import.meta.url), 'utf8');
const cfg = JSON.parse(cfgText);
const prof = cfg.profiles.find((p) => p.id === profile);
const context = { viewport: { width: prof.logicalSize[0], height: prof.logicalSize[1] }, safeArea: { top: 20, bottom: 0, left: 0, right: 0 } };
mkdirSync(join(dirname(out), 'shots'), { recursive: true });
const checkpoints = []; let i = 0;
for (const fl of cfg.flows.filter((x) => x.cadence === 'per-pr')) for (const c of fl.checkpoints) {
  const rel = 'shots/' + (i++) + '.png'; const buf = Buffer.from(profile + rel);
  writeFileSync(join(dirname(out), rel), buf);
  const box = { left: 20, top: 100, right: 340, bottom: 160 };
  checkpoints.push({ flow: fl.id, checkpoint: c, screen: fl.id, deviceId: profile, platform, context,
    nodes: [{ id: 'b', role: 'control', text: 'b', bbox: box, hitRegion: box, enabled: true, parentId: null, meta: { required: true } }],
    screenshot: rel, screenshotSha256: createHash('sha256').update(buf).digest('hex') });
}
writeFileSync(out, JSON.stringify({ sourceSha: f('--source-sha'), buildHash: 'stub-build', profile, platform,
  configSha256: createHash('sha256').update(cfgText).digest('hex'), checkpoints }));
`;

// Stub reviewer: replays the committed calibration review for owner fixtures (live self-check),
// and returns a clean, bound review for candidate screenshots.
const REVIEWER = `#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
const { items } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = items.map(({ meta }) => {
  const cal = process.env.CAL_DIR + '/' + meta.artifactHash + '.json';
  if (existsSync(cal)) return JSON.parse(readFileSync(cal, 'utf8'));
  return { sourceSha: meta.sourceSha, buildHash: meta.buildHash, artifactHash: meta.artifactHash,
    device: meta.device, flow: meta.flow, checkpoint: meta.checkpoint,
    reviewer: { provider: 'openai', model: 'gpt-6-astra', effort: 'high' }, findings: [], verdict: process.env.STUB_VERDICT || 'pass',
    ...(process.env.STUB_VERDICT === 'fail' ? { findings: [{ rule: 2, severity: 'major', bbox: [0, 0, 1, 1], reason: 'stub clip' }] } : {}) };
});
process.stdout.write(JSON.stringify(out));
`;

function fakeRepo({ harness = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dl-native-'));
  const dl = join(root, 'scoresnap/e2e/device-layout');
  cpSync(DL_SRC, dl, { recursive: true });
  const bin = join(root, '.stubbin'); mkdirSync(bin);
  for (const [name, body] of Object.entries({
    adb: 'echo "emulator-5554 device"', maestro: 'echo "maestro $*"', sw_vers: 'echo 26.4', xcodebuild: 'echo "Xcode 26.4.1"',
  })) { writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`); chmodSync(join(bin, name), 0o755); }
  if (harness) {
    mkdirSync(join(root, '.maestro/flows/device-layout'), { recursive: true });
    writeFileSync(join(root, '.maestro/flows/device-layout/new-contest.yaml'), 'appId: stub\n');
    writeFileSync(join(dl, 'scripts/build-android.sh'), 'echo built-android\n');
    writeFileSync(join(dl, 'scripts/build-ios-sim.sh'), 'echo built-ios\n');
    writeFileSync(join(dl, 'scripts/bundle-from-maestro.mjs'), BUNDLER);
  }
  writeFileSync(join(root, 'reviewer.mjs'), REVIEWER);
  execFileSync('bash', ['-c', 'git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm stub'], { cwd: root });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, DEVICE_LAYOUT_OUT: join(root, 'out'),
    CAL_DIR: join(dl, 'fixtures/negative/calibration') };
  return { root, dl, env };
}

function emitAndroidFixture(dl, env, root) {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  execFileSync('node', [join(dl, 'scripts/bundle-from-maestro.mjs'), '--out', join(root, 'out/android-compact/bundle.json'), '--profile', 'android-compact', '--platform', 'android', '--source-sha', sha], { env });
}

const run = (script, args, env, cwd) => spawnSync('bash', [script, ...args], { env, cwd, encoding: 'utf8' });

test('native scripts fail loudly when the AUG-1376 harness is absent', () => {
  const { dl, env, root } = fakeRepo({ harness: false });
  for (const s of ['run-android-compact.sh', 'run-ios-sim.sh']) {
    const r = run(join(dl, 'scripts', s), [], env, root);
    assert.notEqual(r.status, 0, s);
    assert.match(r.stdout, s === 'run-android-compact.sh' ? /INCOMPLETE/ : /PENDING-NATIVE-HARNESS AUG-1376/);
  }
});

test('Android refuses untrusted stub intake; independent fixture pipeline retains complete bundle checks', () => {
  const { dl, env, root } = fakeRepo();
  const a = run(join(dl, 'scripts/run-android-compact.sh'), [], env, '/');
  assert.notEqual(a.status, 0);
  assert.match(a.stdout, /INCOMPLETE/);
  emitAndroidFixture(dl, env, root); // parser fixture only, never native output
  const i = run(join(dl, 'scripts/run-ios-sim.sh'), [], env, '/');
  assert.equal(i.status, 0, i.stdout + i.stderr);
  assert.equal((i.stdout.match(/GEOMETRY GATE: PASS/g) || []).length, 2);
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const b = JSON.parse(readFileSync(join(root, 'out/iphone-se-3/bundle.json'), 'utf8'));
  assert.equal(b.sourceSha, sha);

  // Candidate vision over all three bundles: fails closed with no reviewer, passes with one.
  const noRev = run(join(dl, 'scripts/run-vision-candidate.sh'), [join(root, 'out')], env, '/');
  assert.notEqual(noRev.status, 0);
  assert.match(noRev.stdout + noRev.stderr, /DEVICE_LAYOUT_VISION_CMD not configured/);
  const withRev = run(join(dl, 'scripts/run-vision-candidate.sh'), [join(root, 'out')],
    { ...env, DEVICE_LAYOUT_VISION_CMD: `node ${join(root, 'reviewer.mjs')}` }, '/');
  assert.equal(withRev.status, 0, withRev.stdout + withRev.stderr);
  assert.equal((withRev.stdout.match(/CANDIDATE VISION: PASS/g) || []).length, 3);
  // A reviewer that flags the candidate fails the leg.
  const flagged = run(join(dl, 'scripts/run-vision-candidate.sh'), [join(root, 'out')],
    { ...env, STUB_VERDICT: 'fail', DEVICE_LAYOUT_VISION_CMD: `node ${join(root, 'reviewer.mjs')}` }, '/');
  assert.notEqual(flagged.status, 0);
  assert.match(flagged.stdout, /CANDIDATE VISION: FAIL/);
  // A reviewer that errors fails closed.
  const broken = run(join(dl, 'scripts/run-vision-candidate.sh'), [join(root, 'out')],
    { ...env, DEVICE_LAYOUT_VISION_CMD: 'false' }, '/');
  assert.notEqual(broken.status, 0);
});

test('a stale bundle (different SHA) fails the geometry gate', () => {
  const { dl, env, root } = fakeRepo();
  emitAndroidFixture(dl, env, root);
  const r = spawnSync('node', [join(dl, 'run-geometry.mjs'), join(root, 'out/android-compact/bundle.json'),
    '--expect-sha', 'f'.repeat(40), '--profile', 'android-compact'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /stale evidence/);
});
