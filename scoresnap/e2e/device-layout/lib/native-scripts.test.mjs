// Shell-stub regressions for the native entry scripts (Codex check on 7116885, finding 1): run the
// REAL scripts against a throwaway repo copy with stubbed build/maestro/adb/reviewer commands and
// prove every path they invoke resolves and the candidate-bound pipeline reaches a verdict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, chmodSync, readFileSync, unlinkSync } from 'node:fs';
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
const manifest = JSON.parse(readFileSync(join(a[0], 'capture-manifest.json'), 'utf8'));
const geometryFault = process.env.STUB_SCALE_CASE === 'geometry-1.3' && manifest.fontScale === 1.3;
const context = { viewport: { width: prof.logicalSize[0], height: prof.logicalSize[1] }, fontScale: manifest.fontScale ?? 1, safeArea: { top: 20, bottom: 0, left: 0, right: 0 } };
if (process.env.DEVICE_LAYOUT_ANDROID_PAYWALL_DUAL_QA === '1') {
  const r = manifest.checkpoints[0], scale = manifest.fontScale, scroll = a[0].endsWith('-scrolled');
  const png = Buffer.alloc(26);
  png.set(Buffer.from('89504e470d0a1a0a', 'hex'));
  png.write('IHDR', 12); png.writeUInt32BE(1080, 16); png.writeUInt32BE(2400, 20);
  png[24] = scale===1 ? 10 : 13; png[25] = Number(scroll);
  writeFileSync(join(a[0], r.screenshot), png);
  const item = (id,role,text,parentId,left,top,right,bottom,extra={}) => ({
    id,role,text,parentId,bbox:{left,top,right,bottom},enabled:true,...extra,
  });
  const nodes = [
    item('free','control','Free, Current plan',null,20,100,340,165),
    item('free-label','text','Free','free',70,108,150,130),
    item('paid','control','Tournament Director, $79.99/year',null,20,180,340,295,{checked:true}),
    item('paid-label','text','Tournament Director','paid',70,188,250,212),
  ];
  if (scale === 1 || scroll) {
    nodes.push(item('price','text','$79.99/year','paid',70,228,180,250));
    if (process.env.STUB_SCALE_CASE !== 'companion-incomplete') {
      nodes.push(item('cta','control','Currently unavailable',null,20,315,340,375,{enabled:false}));
    }
  }
  writeFileSync(out, JSON.stringify({ sourceSha:f('--source-sha'), buildHash:manifest.buildHash,
    profile, platform, configSha256:createHash('sha256').update(cfgText).digest('hex'),
    checkpoints:[{flow:r.flow,checkpoint:r.checkpoint,screen:r.screen,state:r.state,deviceId:profile,platform,
      nodes,context,screenshot:r.screenshot,screenshotSha256:createHash('sha256').update(png).digest('hex')}] }));
  process.exit(0);
}
mkdirSync(join(dirname(out), 'shots'), { recursive: true });
const checkpoints = []; let i = 0;
for (const fl of cfg.flows.filter((x) => x.cadence === 'per-pr')) for (const c of fl.checkpoints) {
  const rel = 'shots/' + (i++) + '.png'; const buf = Buffer.from(profile + rel);
  writeFileSync(join(dirname(out), rel), buf);
  const box = { left: 20, top: 100, right: geometryFault ? 999 : 340, bottom: 160 };
  checkpoints.push({ flow: fl.id, checkpoint: c, screen: fl.id, deviceId: profile, platform, context,
    nodes: [{ id: 'b', role: 'control', text: 'b', bbox: box, hitRegion: box, enabled: true, parentId: null, meta: { required: true } }],
    screenshot: rel, screenshotSha256: createHash('sha256').update(buf).digest('hex') });
}
writeFileSync(out, JSON.stringify({ sourceSha: f('--source-sha'), buildHash: platform === 'android' ? readFileSync(join(process.env.DEVICE_LAYOUT_OUT, 'android-build-hash.txt'), 'utf8').trim() : 'stub-build', profile, platform,
  configSha256: createHash('sha256').update(cfgText).digest('hex'), checkpoints }));
`;

// A minimal valid ZIP container with one AndroidManifest.xml entry. It is intentionally not a
// signed/installable Android package: the fake adb is the install boundary in this test.
const BUILD_ANDROID = `set -eu
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const out = process.env.DEVICE_LAYOUT_OUT;
const fault = process.env.STUB_SCALE_CASE;
const apk = join(out, 'app fixture.apk');
const data = Buffer.from('UEsDBBQAAAAAAAAAIQAEQArSFwAAABcAAAATAAAAQW5kcm9pZE1hbmlmZXN0LnhtbFNuYXBTY29yZSB0ZXN0IFpJUCBvbmx5UEsBAhQDFAAAAAAAAAAhAARACtIXAAAAFwAAABMAAAAAAAAAAAAAAIABAAAAAEFuZHJvaWRNYW5pZmVzdC54bWxQSwUGAAAAAAEAAQBBAAAASAAAAAAA', 'base64');
if (fault !== 'absent-apk') {
  writeFileSync(apk, fault === 'nonzip-apk' ? 'not an apk' : data);
}
if (fault !== 'missing-path') {
  const path = fault === 'relative-path' ? 'app fixture.apk' : apk;
  writeFileSync(join(out, 'android-apk-path.txt'), path + '\\n');
}
if (fault !== 'missing-hash') {
  const hash = fault === 'invalid-hash' ? 'not-a-sha256'
    : fault === 'mismatch-hash' ? '0'.repeat(64) : createHash('sha256').update(data).digest('hex');
  writeFileSync(join(out, 'android-build-hash.txt'), hash + '\\n');
}
NODE
echo built-android
`;

const MAESTRO = `case "\${STUB_SCALE_CASE:-}:$*" in
  failed-flow-1.3:*" test "*)
    [ "$(cat "$DEVICE_LAYOUT_OUT/stub-font-scale")" != 1.3 ] || { echo "stub flow assertion failed"; exit 74; } ;;
  timeout-flow-1.3:*" test "*)
    [ "$(cat "$DEVICE_LAYOUT_OUT/stub-font-scale")" != 1.3 ] || { echo "stub flow timeout"; exit 124; } ;;
  failed-hierarchy-1.3:*" hierarchy")
    [ "$(cat "$DEVICE_LAYOUT_OUT/stub-font-scale")" != 1.3 ] || exit 74 ;;
  empty-hierarchy-1.3:*" hierarchy")
    [ "$(cat "$DEVICE_LAYOUT_OUT/stub-font-scale")" != 1.3 ] || exit 0 ;;
esac
echo "maestro $*"
`;

// Use an actual adb-shaped CLI stub with persisted system settings so the entry script, not a
// copied implementation of its guard, sees write failure, read failure, drift and missing capture.
const ADB = `set -eu
if [ "\${1:-}" = -s ]; then shift 2; fi
state="$DEVICE_LAYOUT_OUT/stub-font-scale"
case "$*" in
  wait-for-device) ;;
  devices) echo "emulator-5554 device" ;;
  "shell wm density") echo "Override density: 480" ;;
  "shell wm size") echo "Override size: 1080x2400" ;;
  "shell settings put system font_scale "*)
    if [ "\${STUB_SCALE_CASE:-}" = "write-$6" ]; then exit 74; fi
    printf '%s' "$6" > "$state"
    printf 'put %s\n' "$6" >> "$state.log"
    ;;
  "shell settings get system font_scale")
    current="$(cat "$state")"
    printf 'get %s\n' "$current" >> "$state.log"
    case "\${STUB_SCALE_CASE:-}:$current" in
      "read-1.3:1.3") exit 74 ;;
      "drift-1.3:1.3")
        if [ "$(grep -c 'get 1.3' "$state.log")" -gt 1 ]; then current=1.0; fi ;;
      "mismatch-1.0:1.0") current=1.3 ;;
      "mismatch-1.3:1.3") current=1.0 ;;
      "null-1.3:1.3") current=null ;;
      "malformed-1.3:1.3") current=1.3x ;;
      *) current="\${current}0" ;;
    esac
    printf '%s\r\n' "$current"
    ;;
  "install -r -t "*)
    [ "$4" = "$DEVICE_LAYOUT_OUT/app fixture.apk" ] || exit 99
    printf '%s' "$4" > "$DEVICE_LAYOUT_OUT/stub-installed-apk"
    case "\${STUB_SCALE_CASE:-}" in
      failed-install) echo 'Failure [INSTALL_FAILED_INVALID_APK]'; exit 74 ;;
      no-install-success) echo 'Failure [INSTALL_FAILED_INVALID_APK]'; exit 0 ;;
    esac
    printf 'Performing Streamed Install\nSuccess\r\n'
    ;;
  "exec-out screencap -p")
    current="$(cat "$state")"
    case "\${STUB_SCALE_CASE:-}:$current" in
      "empty-shot-1.3:1.3") exit 0 ;;
      "failed-shot-1.0:1.0") exit 74 ;;
    esac
    printf 'nonempty-stub-png'
    ;;
  *) ;;
esac`;

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

function fakeRepo({ harness = true, paywall = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dl-native-'));
  const dl = join(root, 'scoresnap/e2e/device-layout');
  cpSync(DL_SRC, dl, { recursive: true });
  const bin = join(root, '.stubbin'); mkdirSync(bin);
  const home = join(root, '.stubhome'); mkdirSync(home);
  for (const [name, body] of Object.entries({
    adb: ADB, maestro: MAESTRO, timeout: 'shift; exec "$@"', sw_vers: 'echo 26.4', xcodebuild: 'echo "Xcode 26.4.1"',
    // Installed xcrun must never create/delete real simulators in this stub fixture.
    xcrun: 'exit 1',
  })) { writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`); chmodSync(join(bin, name), 0o755); }
  if (harness) {
    mkdirSync(join(root, '.maestro/flows/device-layout'), { recursive: true });
    mkdirSync(join(root, '.maestro/flows/device-layout/new-contest'));
    writeFileSync(join(root, '.maestro/flows/device-layout/new-contest/00-empty-wizard.yaml'), 'appId: stub\n');
    if (paywall) {
      mkdirSync(join(root, '.maestro/flows/device-layout/paywall'));
      writeFileSync(join(root, '.maestro/flows/device-layout/paywall/00-tier-td.yaml'), 'appId: stub\n');
    }
    writeFileSync(join(dl, 'scripts/build-android.sh'), BUILD_ANDROID);
    writeFileSync(join(dl, 'scripts/build-ios-sim.sh'), 'echo built-ios\n');
    writeFileSync(join(dl, 'scripts/bundle-from-maestro.mjs'), BUNDLER);
  }
  writeFileSync(join(root, 'reviewer.mjs'), REVIEWER);
  execFileSync('bash', ['-c', 'git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm stub'], { cwd: root });
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, DEVICE_LAYOUT_OUT: join(root, 'out'),
    DEVICE_LAYOUT_LARGE_TEXT: '', DEVICE_LAYOUT_AX_BUDGET_S: '', STUB_SCALE_CASE: '',
    CAL_DIR: join(dl, 'fixtures/negative/calibration') };
  return { root, dl, env };
}
const run = (script, args, env, cwd) => spawnSync('bash', [script, ...args], { env, cwd, encoding: 'utf8' });

test('native scripts fail loudly when the AUG-1376 harness is absent', () => {
  const { dl, env, root } = fakeRepo({ harness: false });
  for (const s of ['run-android-compact.sh', 'run-ios-sim.sh']) {
    const r = run(join(dl, 'scripts', s), [], env, root);
    assert.notEqual(r.status, 0, s);
    assert.match(r.stdout, /PENDING-NATIVE-HARNESS AUG-1376/);
  }
});

test('android + iOS scripts resolve every path and pass a complete candidate-bound bundle', () => {
  const { dl, env, root } = fakeRepo();
  const a = run(join(dl, 'scripts/run-android-compact.sh'), [], env, '/');
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.match(a.stdout, /built-android/);
  assert.match(a.stdout, /GEOMETRY GATE: PASS/);
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
  assert.equal(run(join(dl, 'scripts/run-android-compact.sh'), [], env, '/').status, 0);
  const r = spawnSync('node', [join(dl, 'run-geometry.mjs'), join(root, 'out/android-compact/bundle.json'),
    '--expect-sha', 'f'.repeat(40), '--profile', 'android-compact'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /stale evidence/);
});

test('Android baseline-only still verifies 1.0 and the enabled 1.3 pass captures fresh labeled evidence', () => {
  const { dl, env, root } = fakeRepo();
  const script = join(dl, 'scripts/run-android-compact.sh');
  for (const required of [false, true]) {
    const out = join(root, required ? 'required' : 'baseline');
    const r = run(script, [], { ...env, DEVICE_LAYOUT_OUT: out, DEVICE_LAYOUT_LARGE_TEXT: String(required) }, '/');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal((r.stdout.match(/GEOMETRY GATE: PASS/g) || []).length, required ? 2 : 1);
    assert.equal(readFileSync(join(out, 'stub-installed-apk'), 'utf8'), join(out, 'app fixture.apk'));
    const [baseline, large] = ['android-compact', 'android-compact-large-text'].map((device) =>
      join(out, device, 'capture-manifest.json'));
    for (const [file, scale] of required ? [[baseline, 1.0], [large, 1.3]] : [[baseline, 1.0]]) {
      const manifest = JSON.parse(readFileSync(file, 'utf8'));
      assert.equal(manifest.fontScale, scale);
      assert.equal(manifest.checkpoints.length, 1);
      assert.equal(manifest.checkpoints[0].fontScale, scale);
      assert.ok(manifest.checkpoints[0].screenshot);
    }
    if (!required) assert.throws(() => readFileSync(large), { code: 'ENOENT' });
    const settingLog = readFileSync(join(out, 'stub-font-scale.log'), 'utf8');
    assert.match(settingLog, /put 1\.0\nget 1\.0\n/);
    if (required) assert.match(settingLog, /put 1\.3\nget 1\.3[\s\S]*put 1\.0\nget 1\.0\n$/);
    else assert.doesNotMatch(settingLog, /1\.3/);
  }
});

test('required Android font-scale gate fails on adb/capture problems or expired budget', async (t) => {
  const { dl, env, root } = fakeRepo();
  const script = join(dl, 'scripts/run-android-compact.sh');
  const cases = [
    ['write-1.0', /could not set Android font_scale to 1\.0/],
    ['mismatch-1.0', /readback mismatch \(expected 1\.0\)/],
    ['write-1.3', /could not set Android font_scale to 1\.3/],
    ['read-1.3', /could not read Android font_scale \(expected 1\.3\)/],
    ['mismatch-1.3', /readback mismatch \(expected 1\.3\)/],
    ['null-1.3', /readback mismatch \(expected 1\.3\)/],
    ['malformed-1.3', /readback mismatch \(expected 1\.3\)/],
    ['drift-1.3', /readback mismatch \(expected 1\.3\)/],
    ['failed-shot-1.0', /missing Android hierarchy or screenshot/],
    ['failed-flow-1.3', /maestro sub-flow failed or timed out[\s\S]*stub flow assertion failed/],
    ['timeout-flow-1.3', /maestro sub-flow failed or timed out[\s\S]*stub flow timeout/],
    ['failed-hierarchy-1.3', /missing Android hierarchy or screenshot/],
    ['empty-hierarchy-1.3', /missing Android hierarchy or screenshot/],
    ['empty-shot-1.3', /missing Android hierarchy or screenshot/],
    ['budget', /required Android font_scale 1\.3 capture not attempted/],
    ['reused-output', /refusing to reuse Android capture directory/],
  ];
  for (const [fault, message] of cases) await t.test(fault, () => {
    const out = join(root, fault);
    if (fault === 'reused-output') mkdirSync(join(out, 'android-compact-large-text'), { recursive: true });
    const r = run(script, [], { ...env, DEVICE_LAYOUT_OUT: out, DEVICE_LAYOUT_LARGE_TEXT: 'true',
      DEVICE_LAYOUT_AX_BUDGET_S: fault === 'budget' ? '0' : '', STUB_SCALE_CASE: fault }, '/');
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, message);
    assert.doesNotMatch(r.stdout, /device-layout android: PASS/);
    assert.throws(() => readFileSync(join(out, 'android-compact-large-text', 'geometry-bundle.large-text.json')),
      { code: 'ENOENT' });
    if (fault.endsWith('-1.3')) assert.equal(readFileSync(join(out, 'stub-font-scale'), 'utf8'), '1.0');
  });
});

test('Android refuses to capture until fresh candidate APK receipts, bytes, and install are verified', async (t) => {
  const { dl, env, root } = fakeRepo();
  const script = join(dl, 'scripts/run-android-compact.sh');
  const cases = [
    ['missing-path', /missing fresh Android APK path receipt/],
    ['missing-hash', /missing fresh Android APK hash receipt/],
    ['absent-apk', /must name an absolute, nonempty regular \.apk/],
    ['relative-path', /must name an absolute, nonempty regular \.apk/],
    ['nonzip-apk', /Android APK has no ZIP local file header/],
    ['invalid-hash', /must be a lowercase SHA-256 digest/],
    ['mismatch-hash', /does not match the candidate build receipt/],
    ['failed-install', /candidate Android APK install failed/],
    ['no-install-success', /candidate Android APK install failed/],
    ['stale-receipt', /refusing to reuse Android build receipt/],
  ];
  for (const [fault, message] of cases) await t.test(fault, () => {
    const out = join(root, fault);
    if (fault === 'stale-receipt') {
      mkdirSync(out);
      writeFileSync(join(out, 'android-apk-path.txt'), '/old/candidate.apk\n');
    }
    const r = run(script, [], { ...env, DEVICE_LAYOUT_OUT: out, STUB_SCALE_CASE: fault }, '/');
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, message);
    assert.doesNotMatch(r.stdout, /device-layout android: PASS/);
    assert.throws(() => readFileSync(join(out, 'stub-font-scale')), { code: 'ENOENT' });
  });
});

test('Android exits nonzero for actual large-text geometry findings despite a passing baseline', () => {
  const { dl, env, root } = fakeRepo();
  const r = run(join(dl, 'scripts/run-android-compact.sh'), [], {
    ...env, DEVICE_LAYOUT_LARGE_TEXT: 'true', STUB_SCALE_CASE: 'geometry-1.3',
  }, '/');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GEOMETRY GATE: PASS/);
  assert.match(r.stdout, /GEOMETRY GATE: FAIL/);
  assert.match(r.stdout, /device-layout android: FAIL/);
  const report = join(root, 'out/android-compact-large-text/geometry-bundle.large-text.json');
  assert.equal(JSON.parse(readFileSync(report, 'utf8')).ok, false);
});

test('Android fails when the flow directory has zero checkpoints', () => {
  const { dl, env, root } = fakeRepo();
  unlinkSync(join(root, '.maestro/flows/device-layout/new-contest/00-empty-wizard.yaml'));
  const r = run(join(dl, 'scripts/run-android-compact.sh'), [], env, '/');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /missing Android checkpoints at font_scale 1\.0/);
});

const AX_QA_SCOPE = {
  GITHUB_REPOSITORY: 'augsmog/QuickScore', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/qa/snapscore-android-ax-only', GITHUB_JOB: 'android-compact',
  DEVICE_LAYOUT_LARGE_TEXT: 'true', DEVICE_LAYOUT_ANDROID_AX_ONLY_QA: '1',
};

test('standalone Android 1.3 rejects wrong hosted scope before build or device capture', () => {
  const { dl, env, root } = fakeRepo();
  for (const override of [
    { GITHUB_REPOSITORY: 'other/QuickScore' },
    { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_JOB: 'another-job' },
    { DEVICE_LAYOUT_LARGE_TEXT: 'false' },
  ]) {
    const r = run(join(dl, 'scripts/run-android-compact.sh'), [], { ...env, ...AX_QA_SCOPE, ...override }, '/');
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /requires dedicated workflow scope/);
    assert.doesNotMatch(r.stdout, /built-android|checkpoint/);
  }
});

test('standalone Android 1.3 QA cannot be displaced by baseline budget or claim full gate pass', () => {
  const { dl, env, root } = fakeRepo();
  const r = run(join(dl, 'scripts/run-android-compact.sh'), [], {
    ...env, ...AX_QA_SCOPE,
    DEVICE_LAYOUT_AX_BUDGET_S: '0',
  }, '/');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /device-layout android: PASS/);
  assert.match(r.stdout, /baseline not evaluated/);
  const marker = JSON.parse(readFileSync(join(root, 'out/android-qa-scope.json'), 'utf8'));
  assert.equal(marker.scope, 'android-offline-layout-1p3-only');
  assert.equal(marker.releaseVerdict, false);
  assert.equal(marker.baselineEvaluated, false);
  assert.equal(marker.sourceSha, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
  assert.equal(marker.apkSha256, readFileSync(join(root, 'out/android-build-hash.txt'), 'utf8').trim());
  assert.throws(() => readFileSync(join(root, 'out/android-compact/capture-manifest.json')), { code: 'ENOENT' });
  const manifest = JSON.parse(readFileSync(join(root, 'out/android-compact-large-text/capture-manifest.json'), 'utf8'));
  assert.equal(manifest.fontScale, 1.3);
  assert.equal(manifest.checkpoints[0].fontScale, 1.3);
  assert.equal(readFileSync(join(root, 'out/stub-font-scale'), 'utf8'), '1.0');
});
test('standalone Android 1.3 QA restores baseline and fails on drift', () => {
  const { dl, env, root } = fakeRepo();
  const r = run(join(dl, 'scripts/run-android-compact.sh'), [], {
    ...env, ...AX_QA_SCOPE, STUB_SCALE_CASE: 'drift-1.3',
  }, '/');
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /readback mismatch/);
  assert.equal(readFileSync(join(root, 'out/stub-font-scale'), 'utf8'), '1.0');
});


const PAYWALL_DUAL_SCOPE = {
  ...AX_QA_SCOPE, GITHUB_REF: 'refs/heads/qa/snapscore-android-paywall-dual',
  DEVICE_LAYOUT_ANDROID_AX_ONLY_QA: '0', DEVICE_LAYOUT_ANDROID_PAYWALL_DUAL_QA: '1',
};

test('focused paywall dual QA captures exactly one labeled checkpoint at each scale from one APK and restores 1.0', () => {
  const { dl, env, root } = fakeRepo({ paywall: true });
  const r = run(join(dl, 'scripts/run-android-compact.sh'), [], {
    ...env, ...PAYWALL_DUAL_SCOPE, DEVICE_LAYOUT_AX_BUDGET_S: '0',
  }, '/');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal((r.stdout.match(/built-android/g) || []).length, 1);
  assert.doesNotMatch(r.stdout, /device-layout android: PASS|checkpoint .*new-contest/);
  const marker = JSON.parse(readFileSync(join(root, 'out/android-qa-scope.json'), 'utf8'));
  assert.equal(marker.scope, 'android-offline-paywall-1p0-and-1p3');
  assert.equal(marker.releaseVerdict, false);
  assert.equal(marker.fullLayoutGate, false);
  assert.equal(marker.sourceSha, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
  assert.equal(marker.captureReady, true);
  assert.equal(marker.visualStatus, 'required-not-evaluated');
  assert.equal(marker.captures.length, 2);
  assert.equal(marker.captures[0].scrollScreenshotSha256, undefined);
  assert.match(marker.captures[1].scrollScreenshotSha256, /^[a-f0-9]{64}$/);
  for (const [suffix, scale] of [['-1p0', 1.0], ['-1p3', 1.3], ['-1p3-scrolled', 1.3]]) {
    const manifest = JSON.parse(readFileSync(join(root, 'out/android-compact' + suffix, 'capture-manifest.json'), 'utf8'));
    assert.equal(manifest.fontScale, scale);
    assert.deepEqual(manifest.checkpoints.map(c => [c.flow, c.fontScale]), [['paywall', scale]]);
  }
  assert.equal(readFileSync(join(root, 'out/stub-font-scale'), 'utf8').trim(), '1.0');
});

test('focused paywall dual QA fails incomplete companion without release green and restores scale', () => {
  const { dl, env, root } = fakeRepo({ paywall:true });
  const r = run(join(dl,'scripts/run-android-compact.sh'),[],{...env,...PAYWALL_DUAL_SCOPE,STUB_SCALE_CASE:'companion-incomplete'},'/');
  assert.notEqual(r.status,0);
  assert.doesNotMatch(r.stdout,/device-layout android: PASS/);
  assert.match(r.stderr,/capture evidence incomplete/);
  const scope=JSON.parse(readFileSync(join(root,'out/android-qa-scope.json'),'utf8'));
  assert.equal(scope.releaseVerdict,false);
  assert.equal(scope.captureReady,undefined);
  assert.equal(readFileSync(join(root,'out/stub-font-scale'),'utf8').trim(),'1.0');
});

test('focused paywall dual QA refuses off-scope or absent checkpoint before Android build', () => {
  const { dl, env } = fakeRepo();
  for (const [extra, error] of [
    [{ GITHUB_REF: 'refs/heads/main' }, /requires dedicated workflow scope/],
    [{}, /missing focused paywall checkpoint/],
  ]) {
    const r = run(join(dl, 'scripts/run-android-compact.sh'), [], { ...env, ...PAYWALL_DUAL_SCOPE, ...extra }, '/');
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, error);
    assert.doesNotMatch(r.stdout, /built-android/);
  }
});
