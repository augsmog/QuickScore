import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateConfig, resolveConfig} from '../src/config.mjs';
import {evaluateSnapshot, findOverlaps, SNAPSHOT_SCHEMA} from '../src/rules.mjs';
import {runGate, validateWaivers, WAIVER_SCHEMA, configHash} from '../src/gate.mjs';
import {fromGodotDump} from '../adapters/godot.mjs';
import {fromCaptureAudit, profileToDevice} from '../adapters/snapscore.mjs';
import {fromParentsGame} from '../adapters/parents-game.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');
const readJson = p => JSON.parse(readFileSync(join(pkg, p), 'utf8'));
const lrd = readJson('configs/lrd.device-layout.json');
const snapscore = readJson('configs/snapscore.device-layout.json');
const dump = readJson('test/fixtures/lrd-main-menu.iphone-15-pro-landscape.json');
const box = (id, name, left, top, w, h, extra = {}) => ({id, name, left, top, right: left + w, bottom: top + h, ...extra});
const snap = (device, screen, targets, texts = []) => ({schema: SNAPSHOT_SCHEMA, device, screen, targets, texts});
// Gated run provenance; gate() stamps snapshots that carry none (provenance itself is tested separately).
const RUN = {sourceSha: 'e'.repeat(40), buildHash: 'build-42'};
const stamp = (config, s) => (s && typeof s === 'object' && !s.provenance ? {...s, provenance: {...RUN, configHash: configHash(config)}} : s);
const gate = ({config, snapshots, ...rest}) => runGate({config, snapshots: snapshots.map(s => stamp(config, s)), provenance: RUN, ...rest});

test('shipped configs validate', () => {
  for (const c of [lrd, snapscore]) assert.deepEqual(validateConfig(c), {ok: true, errors: []});
});

test('config rejects orientation/size mismatch, duplicate ids, unknown checks, unusable insets', () => {
  const bad = structuredClone(lrd);
  bad.devices[0].orientation = 'portrait';
  bad.devices.push({...lrd.devices[1]});
  bad.devices[2].safeArea = {left: 600, right: 600};
  bad.rules.checks = ['target-size', 'vibes'];
  const {ok, errors} = validateConfig(bad);
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('disagrees')), errors.join('\n'));
  assert.ok(errors.some(e => e.includes('duplicate device')));
  assert.ok(errors.some(e => e.includes('no usable area')));
  assert.ok(errors.some(e => e.includes('unknown check "vibes"')));
  assert.throws(() => resolveConfig(bad), /invalid device-layout config/);
});

test('rules: target size honours per-device minimum and sub-pixel epsilon', () => {
  const cfg = resolveConfig(lrd);
  const pixel = cfg.devices.find(d => d.id === 'pixel-7-landscape');
  const iphone = cfg.devices.find(d => d.id === 'iphone-se-landscape');
  const t = [box(0, 'jitter', 100, 100, 44 - 2 ** -15, 44), box(1, 'small', 200, 100, 40, 44)];
  assert.deepEqual(evaluateSnapshot(snap('iphone-se-landscape', 'main-menu', t), iphone, cfg.rules).map(f => f.subject), ['small']);
  assert.deepEqual(evaluateSnapshot(snap('pixel-7-landscape', 'main-menu', t), pixel, cfg.rules).map(f => f.subject).sort(), ['jitter', 'small']);
});

test('rules: landscape left/right safe area, offscreen, overlap, text-over-control, backdrop exemption', () => {
  const cfg = resolveConfig(lrd);
  const dev = cfg.devices.find(d => d.id === 'iphone-15-pro-landscape');
  const s = snap('iphone-15-pro-landscape', 'battle-hud', [
    box(0, 'pause', 20, 100, 50, 50),            // under the left notch band (59pt)
    box(1, 'fire', 700, 100, 60, 60),
    box(2, 'reload', 730, 120, 60, 60),          // overlaps fire, stays inside right band (793)
    box(3, 'offscreen', 830, 300, 60, 60),       // past the right edge
    box(4, 'scrim', 0, 0, 852, 393, {backdrop: true}),
  ], [box(null, 'Wave 3', 705, 130, 40, 20, {owners: []})]);
  const rules = evaluateSnapshot(s, dev, cfg.rules).map(f => `${f.rule}:${f.subject}`).sort();
  assert.deepEqual(rules, [
    'control-overlap:fire x reload',
    'offscreen:offscreen',
    'safe-area:pause',
    'text-over-control:Wave 3 x fire',
    'text-over-control:Wave 3 x reload',
  ]);
});

test('findOverlaps matches SnapScore interactive-target-geometry on the same targets', async () => {
  const {findInteractiveTargetOverlaps} = await import('../../../scoresnap/e2e/interactive-target-geometry.mjs');
  const targets = [box(0, 'a', 0, 0, 50, 50), box(1, 'b', 40, 40, 50, 50), box(2, 'c', 45, 0, 50, 10, {parentId: 0}), box(3, 'd', 49, 49, 2.5, 2.5)];
  assert.deepEqual(findOverlaps(targets), findInteractiveTargetOverlaps(targets));
});

test('godot adapter scales canvas units to device points and attributes text', () => {
  const cfg = resolveConfig(lrd);
  const dev = cfg.devices.find(d => d.id === 'iphone-15-pro-landscape');
  const s = fromGodotDump(dump, dev);
  assert.equal(s.targets.length, 2, 'hidden node dropped');
  const play = s.targets.find(t => t.name === 'Play');
  const sx = 852 / 1560.92, sy = 393 / 720;
  assert.ok(Math.abs(play.left - 640 * sx) < 1e-6 && Math.abs(play.bottom - 420 * sy) < 1e-6);
  assert.ok(Math.abs((play.right - play.left) - 280 * sx) < 1e-6);
  assert.deepEqual(s.texts.map(t => t.name), ['Locker Room Defense']);
  assert.deepEqual(evaluateSnapshot(s, dev, cfg.rules), []);
});

test('godot adapter refuses wrong device, aspect mismatch, wrong schema', () => {
  const cfg = resolveConfig(lrd);
  const dev = cfg.devices.find(d => d.id === 'iphone-15-pro-landscape');
  assert.throws(() => fromGodotDump({...dump, viewport: {width: 1280, height: 720}}, dev), /aspect mismatch/);
  assert.throws(() => fromGodotDump(dump, cfg.devices[0]), /captured for/);
  assert.throws(() => fromGodotDump({...dump, schema: 'x'}, dev), /schema/);
});

test('godot adapter: undersized button and notch-band button fail', () => {
  const cfg = resolveConfig(lrd);
  const dev = cfg.devices.find(d => d.id === 'iphone-15-pro-landscape');
  const d = structuredClone(dump);
  d.nodes.push({path: '/root/Main/Back', name: 'Back', class: 'Button', rect: [20, 20, 60, 60], visible: true, interactive: true, text: '<', parent_interactive: null});
  const rules = evaluateSnapshot(fromGodotDump(d, dev), dev, cfg.rules).map(f => `${f.rule}:${f.subject}`).sort();
  assert.deepEqual(rules, ['safe-area:Back', 'target-size:Back']);
});

test('snapscore adapter round-trips a capture audit and profile', () => {
  const device = profileToDevice('iphone-16', {width: 393, height: 852, top: 59, bottom: 34});
  assert.deepEqual(device.safeArea, {top: 59, right: 0, bottom: 34, left: 0});
  const layout = {targets: [{id: 0, name: 'Save', left: 20, top: 100, right: 120, bottom: 140, raw: {}, size: {width: 100, height: 44}, backdrop: false}], texts: [{name: 'Save', left: 30, top: 110, right: 60, bottom: 130, owners: [0]}]};
  const s = fromCaptureAudit(layout, {device: 'iphone-16', screen: 'settings'});
  const r = gate({config: {...snapscore, screens: [{id: 'settings', devices: ['iphone-16']}]}, snapshots: [s]});
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.results));
  assert.equal(r.results[0].failures.length, 0);
});

test('gate: missing required screen/device and empty snapshot fail', () => {
  const cfg = resolveConfig(lrd);
  const dev = cfg.devices.find(d => d.id === 'iphone-15-pro-landscape');
  const r = gate({config: lrd, snapshots: [fromGodotDump(dump, dev), snap('iphone-se-landscape', 'main-menu', [], [])]});
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.invalid.length, 1);
  assert.equal(r.missing.length, 4 * 3 - 1);
  assert.equal(gate({config: snapscore, snapshots: []}).verdict, 'FAIL', 'zero snapshots can never pass');
});

test('waivers: ticketed waiver moves a failure to waived; expired waiver fails gate; bad waiver rejected', () => {
  const cfg = {...snapscore, screens: [{id: 'home', devices: ['iphone-se-3']}]};
  const s = snap('iphone-se-3', 'home', [box(0, 'tiny', 10, 30, 30, 30)]);
  const waiver = {id: 'w1', rule: 'target-size', subject: 'tiny', device: 'iphone-se-3', ticket: 'AUG-1381', reason: 'fixture exception for test', approvedBy: 'checker', expires: '2099-01-01'};
  const ok = gate({config: cfg, snapshots: [s], waivers: {schema: WAIVER_SCHEMA, waivers: [waiver]}});
  assert.equal(ok.verdict, 'PASS');
  assert.equal(ok.results[0].waived[0].ticket, 'AUG-1381');
  const old = gate({config: cfg, snapshots: [s], waivers: {schema: WAIVER_SCHEMA, waivers: [{...waiver, expires: '2020-01-01'}]}, today: '2026-11-19'});
  assert.equal(old.verdict, 'FAIL');
  assert.equal(old.results[0].failures.length, 1);
  assert.deepEqual(old.expiredWaivers.map(w => w.id), ['w1']);
  assert.ok(validateWaivers({schema: WAIVER_SCHEMA, waivers: [{...waiver, ticket: 'none', expires: 'soon'}]}).length >= 2);
});

test('receipt carries schema, digest, devices and pending vision rubric', () => {
  const r = gate({config: snapscore, snapshots: [snap('iphone-se-3', 'home', [box(0, 'ok', 10, 30, 50, 50)])], sha: 'a'.repeat(40)});
  const schema = readJson('schema/receipt.v1.schema.json');
  for (const k of schema.required) assert.ok(k in r, `receipt missing ${k}`);
  assert.match(r.configDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(r.vision.status, 'pending-independent-checker');
});

test('parents-game adapter refuses until AUG-1024 scopes it', () => {
  assert.throws(() => fromParentsGame(), /AUG-1024/);
});

test('CLI: godot adapter PASS on fixture-only matrix, FAIL exit 1 on full matrix, 2 on bad config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-'));
  const one = {...lrd, devices: [lrd.devices[1]], screens: [{id: 'main-menu'}]};
  writeFileSync(join(dir, 'one.json'), JSON.stringify(one));
  mkdirSync(join(dir, 'dumps'));
  writeFileSync(join(dir, 'dumps', 'a.json'), JSON.stringify({...dump, provenance: {...RUN, configHash: configHash(one)}}));
  const cli = (...a) => spawnSync(process.execPath, [join(pkg, 'bin/device-layout.mjs'), ...a], {encoding: 'utf8'});
  const prov = ['--source-sha', RUN.sourceSha, '--build-hash', RUN.buildHash];
  const pass = cli('check', '--config', join(dir, 'one.json'), '--adapter', 'godot', '--snapshots', join(dir, 'dumps'), ...prov, '--out', join(dir, 'r.json'));
  assert.equal(pass.status, 0, pass.stdout + pass.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')).verdict, 'PASS');
  const fail = cli('check', '--config', join(pkg, 'configs/lrd.device-layout.json'), '--adapter', 'godot', '--snapshots', join(dir, 'dumps'), ...prov);
  assert.equal(fail.status, 1, fail.stdout + fail.stderr);
  assert.match(fail.stdout, /MISSING ipad-mini-landscape \/ pause-menu/);
  writeFileSync(join(dir, 'bad.json'), '{"schema":"nope"}');
  assert.equal(cli('validate', '--config', join(dir, 'bad.json')).status, 2);
});

// --- AUG-1373 widened gate (follow-up commit) ---
import {evaluateVision, validateVisionReview} from '../src/vision.mjs';
import {findTightTargets, PLATFORM_MIN_TARGET} from '../src/rules.mjs';

test('snapscore matrix is the AUG-1373 six-row iOS+Android matrix; 402x874 is iPhone 16 Pro', () => {
  const cfg = resolveConfig(snapscore);
  assert.deepEqual(cfg.devices.map(d => `${d.platform}:${d.id}:${d.width}x${d.height}:${d.cadence}`), [
    'ios:iphone-se-3:375x667:pr', 'ios:iphone-16:393x852:nightly', 'ios:iphone-16-pro:402x874:pr',
    'ios:iphone-16-pro-max:440x956:nightly', 'android:android-compact-360:360x800:pr', 'android:android-pixel-pro-448:448x998:nightly',
  ]);
  assert.ok(!cfg.devices.some(d => d.id.includes('plus')), 'no iphone-16-plus mislabel');
  assert.equal(cfg.rules.overlapTolerance, 1, 'rule 1: 1 logical unit');
  assert.deepEqual(cfg.devices.find(d => d.platform === 'android').minTarget, {width: 48, height: 48});
  assert.deepEqual(cfg.devices.find(d => d.platform === 'ios').minTarget, {width: 44, height: 44});
});

test('config rejects a per-device minimum below the platform floor', () => {
  const bad = structuredClone(snapscore);
  bad.devices[4].minTarget = {width: 44, height: 44};
  assert.ok(validateConfig(bad).errors.some(e => e.includes('below the android floor 48x48')));
});

test('rules: 46pt control passes iOS, fails Android 48dp floor', () => {
  const cfg = resolveConfig(snapscore);
  const t = [box(0, 'Continue', 40, 300, 46, 46)];
  const ios = cfg.devices.find(d => d.id === 'iphone-se-3'), android = cfg.devices.find(d => d.id === 'android-compact-360');
  assert.deepEqual(evaluateSnapshot(snap(ios.id, 'new-contest', t), ios, cfg.rules), []);
  assert.deepEqual(evaluateSnapshot(snap(android.id, 'new-contest', t), android, cfg.rules).map(f => f.rule), ['target-size']);
});

test('rules: target-spacing flags <8pt sibling gap (switch vs label control), not overlaps or nested', () => {
  const cfg = resolveConfig(snapscore);
  const dev = cfg.devices.find(d => d.id === 'iphone-16-pro');
  const s = snap(dev.id, 'new-contest', [
    box(0, 'Multi-day switch', 300, 200, 51, 44),
    box(1, 'Multi-day row', 20, 200, 276, 44),        // 4pt to the switch -> tight
    box(2, 'Team Mode switch', 300, 252, 51, 44),     // 8pt below -> ok
    box(3, 'Chip', 20, 400, 60, 44), box(4, 'Chip x', 62, 400, 44, 44, {parentId: 3}), // nested -> ignored
  ]);
  const f = evaluateSnapshot(s, dev, cfg.rules);
  assert.deepEqual(f.map(x => `${x.rule}:${x.subject}`), ['target-spacing:Multi-day switch x Multi-day row']);
  assert.equal(f[0].geometry.gap, 4);
  assert.deepEqual(findTightTargets([box(0, 'a', 0, 0, 44, 44), box(1, 'b', 30, 30, 44, 44)]), [], 'overlap is control-overlap\'s job');
  assert.equal(PLATFORM_MIN_TARGET.android.width, 48);
});

test('gate: observed viewport that disagrees with the declared device is INVALID (never trust profile names)', () => {
  const s = {...snap('iphone-16-pro', 'home', [box(0, 'ok', 20, 100, 60, 60)]), viewport: {width: 393, height: 852}};
  const r = gate({config: {...snapscore, screens: [{id: 'home', devices: ['iphone-16-pro']}]}, snapshots: [s]});
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.invalid[0].errors.join(), /observed viewport 393x852 does not match declared iphone-16-pro 402x874/);
  const ok = gate({config: {...snapscore, screens: [{id: 'home', devices: ['iphone-16-pro']}]}, snapshots: [{...s, viewport: {width: 402, height: 874}}]});
  assert.equal(ok.verdict, 'PASS', JSON.stringify(ok.invalid));
});

test('gate: missing platform evidence cannot be waived', () => {
  const cfg = {...snapscore, screens: [{id: 'home', devices: ['iphone-se-3', 'android-compact-360']}]};
  const waiver = {id: 'w', rule: 'missing', subject: 'android-compact-360', ticket: 'AUG-1381', reason: 'no emulator today', approvedBy: 'x', expires: '2099-01-01'};
  const shots = [snap('iphone-se-3', 'home', [box(0, 'ok', 20, 100, 60, 60)])];
  // AUG-1384: a coverage waiver is rejected outright, not silently ignored.
  assert.throws(() => gate({config: cfg, snapshots: shots, waivers: {schema: WAIVER_SCHEMA, waivers: [waiver]}}), /missing-platform evidence can never be waived/);
  assert.throws(() => gate({config: cfg, snapshots: shots, waivers: {schema: WAIVER_SCHEMA, waivers: [{...waiver, rule: 'target-size', reason: 'missing android emulator evidence'}]}}), /never be waived/);
  const r = gate({config: cfg, snapshots: shots});
  assert.equal(r.verdict, 'FAIL');
  assert.deepEqual(r.missing, [{device: 'android-compact-360', screen: 'home'}]);
});

const SHA = 'b'.repeat(40);
const review = (over = {}) => ({schema: 'device-layout/vision-review/v1', sourceSha: SHA, buildHash: 'build-1', artifactHash: 'sha256:' + 'c'.repeat(64),
  device: 'iphone-16-pro', flow: 'new-contest', checkpoint: 'step-2', reviewer: {provider: 'openai', model: 'codex', effort: 'high'}, findings: [], verdict: 'pass', ...over});
const neg = name => review({fixture: 'negative', checkpoint: name, findings: [{rule: 1, severity: 'major', bbox: [0, 0, 10, 10], reason: 'switch over label'}], verdict: 'fail'});
const required = [{device: 'iphone-16-pro', flow: 'new-contest', checkpoint: 'step-2'}];

test('vision: clean review + both negative fixtures caught -> PASS; minor finding is a non-blocking follow-up', () => {
  const r = evaluateVision({reviews: [neg('multi-day.png'), neg('team-mode.png'), review({findings: [{rule: 4, severity: 'minor', bbox: [1, 2, 3, 4], reason: 'loose gap'}]})], required, builderProvider: 'anthropic', sourceSha: SHA});
  assert.equal(r.verdict, 'PASS', JSON.stringify(r));
  assert.equal(r.followUps.length, 1);
});

test('vision: major finding, missing checkpoint, self-review, Grok, wrong head, bad record, rubric drift all FAIL', () => {
  const base = {required, builderProvider: 'anthropic', sourceSha: SHA};
  const fixtures = [neg('multi-day.png'), neg('team-mode.png')];
  const v = reviews => evaluateVision({...base, reviews: [...fixtures, ...reviews]});
  assert.equal(v([review({findings: [{rule: 7, severity: 'major', bbox: [0, 0, 1, 1], reason: 'black pill switch'}], verdict: 'fail'})]).blocking.length, 1);
  assert.deepEqual(v([]).missing, ['iphone-16-pro::new-contest::step-2']);
  assert.match(v([review({reviewer: {provider: 'anthropic', model: 'opus', effort: 'high'}})]).invalid[0].errors.join(), /no self-review/);
  assert.match(v([review({reviewer: {provider: 'xai', model: 'grok', effort: 'high'}})]).invalid[0].errors.join(), /not allowed/);
  assert.match(v([review({sourceSha: 'd'.repeat(40)})]).invalid[0].errors.join(), /not the gated head/);
  assert.match(v([review({artifactHash: 'nope', reviewer: {provider: 'openai', model: 'codex', effort: 'low'}})]).invalid[0].errors.join(), /artifactHash.*effort/);
  for (const r of [v([review({findings: [], verdict: 'fail'})])]) assert.equal(r.verdict, 'FAIL');
  const drift = evaluateVision({...base, reviews: [review({fixture: 'negative', checkpoint: 'team-mode.png', findings: [{rule: 7, severity: 'minor', bbox: [0, 0, 1, 1], reason: 'meh'}]}), review()]});
  assert.equal(drift.verdict, 'FAIL');
  assert.match(drift.drift[0].reason, /negative fixture returned no major/);
  assert.equal(evaluateVision({...base, reviews: [review()]}).verdict, 'FAIL', 'a run with no negative fixture cannot pass');
  assert.equal(evaluateVision({...base, reviews: [...fixtures, review(), review({fixture: 'positive', checkpoint: 'fixed.png', verdict: 'fail', findings: [{rule: 1, severity: 'major', bbox: [0, 0, 1, 1], reason: 'x'}]})]}).verdict, 'FAIL', 'over-rejection of a positive fixture');
  assert.throws(() => evaluateVision({reviews: []}), /builderProvider/);
  assert.equal(validateVisionReview(review()).length, 0);
});

test('vision-review JSON schema required keys match the validator', () => {
  const schema = readJson('schema/vision-review.v1.schema.json');
  for (const k of schema.required) { const r = review(); delete r[k]; assert.ok(validateVisionReview(r).length > 0, `missing ${k} not caught`); }
});

// --- AUG-1384: one reconciled v1 contract (PR #341 package + PR #342 behaviour) ---
import {fromMaestroHierarchy, parseBounds} from '../adapters/rn-maestro.mjs';
import {requiredCheckpoints} from '../src/vision.mjs';

test('contract: config must declare adapter, provenance, flows, reviewer policy, fixtures, retention', () => {
  const {ok, errors} = validateConfig({...snapscore, adapter: 'flutter', provenance: {required: ['sourceSha']}, flows: [], reviewerPolicy: {builder: 'anthropic', reviewer: {provider: 'anthropic', model: 'x', effort: 'low'}}, fixtures: {negative: []}, retention: {passDays: 7, failDays: 1}});
  assert.equal(ok, false);
  for (const re of [/\$\.adapter/, /provenance\.required/, /\$\.flows/, /must differ from the builder/, /effort/, /negative fixture/, /retention/]) assert.ok(errors.some(e => re.test(e)), `${re} not reported: ${errors.join(' | ')}`);
  const noKeys = {...snapscore}; for (const k of ['adapter', 'provenance', 'flows', 'reviewerPolicy', 'fixtures', 'retention']) delete noKeys[k];
  assert.ok(validateConfig(noKeys).errors.length >= 6);
  const badFixture = {...snapscore, fixtures: {negative: [{image: 'a.png', artifactHash: null, expectDefect: 'x'}]}};
  assert.ok(validateConfig(badFixture).errors.some(e => /pendingTicket/.test(e)), 'uncommitted fixture needs a ticket');
});

test('provenance: snapshot and receipt share {sourceSha, buildHash, configHash}; stale or missing hashes are INVALID', () => {
  const cfg = {...snapscore, screens: [{id: 'home', devices: ['iphone-se-3']}]};
  const good = {...snap('iphone-se-3', 'home', [box(0, 'ok', 10, 30, 50, 50)]), provenance: {...RUN, configHash: configHash(cfg)}};
  const ok = runGate({config: cfg, snapshots: [good], provenance: RUN});
  assert.equal(ok.verdict, 'PASS', JSON.stringify(ok.invalid));
  assert.deepEqual({s: ok.provenance.sourceSha, b: ok.provenance.buildHash, c: ok.provenance.configHash}, {s: good.provenance.sourceSha, b: good.provenance.buildHash, c: good.provenance.configHash});
  assert.equal(ok.configDigest, ok.provenance.configHash);
  const cases = {
    sourceSha: {...good, provenance: {...good.provenance, sourceSha: 'f'.repeat(40)}},
    buildHash: {...good, provenance: {...good.provenance, buildHash: 'build-41'}},
    configHash: {...good, provenance: {...good.provenance, configHash: configHash({...cfg, product: 'edited'})}},
  };
  for (const [k, s] of Object.entries(cases)) {
    const r = runGate({config: cfg, snapshots: [s], provenance: RUN});
    assert.equal(r.verdict, 'FAIL'); assert.match(r.invalid[0].errors.join(), new RegExp(`stale ${k}`));
  }
  const bare = {...good}; delete bare.provenance;
  assert.match(runGate({config: cfg, snapshots: [bare], provenance: RUN}).invalid[0].errors.join(), /provenance missing/);
  const noRun = runGate({config: cfg, snapshots: [good]});
  assert.equal(noRun.verdict, 'FAIL', 'a run without its own provenance can never pass');
  assert.ok(noRun.provenance.errors.length >= 2);
});

test('geometry: invalid geometry (non-finite, negative extent) is INVALID, never evaluated', () => {
  const r = gate({config: snapscore, snapshots: [snap('iphone-se-3', 'home', [box(0, 'nan', NaN, 0, 50, 50), {id: 1, name: 'inv', left: 50, top: 50, right: 10, bottom: 60}])]});
  assert.equal(r.verdict, 'FAIL');
  assert.match(r.invalid[0].errors.join(), /finite.*negative extent/);
});

test('rn-maestro adapter (ported from PR #342): bounds/density, nesting, text owners; fixture transform only', () => {
  assert.deepEqual(parseBounds('[0,0][90,30]', 3), {left: 0, top: 0, right: 30, bottom: 10});
  assert.equal(parseBounds('garbage'), null);
  const tree = {attributes: {bounds: '[0,0][1080,2400]'}, children: [
    {attributes: {'resource-id': 'start-button', bounds: '[60,300][1020,450]', clickable: 'true'}, children: [{attributes: {text: 'Start', bounds: '[400,330][680,420]'}}]},
    {attributes: {'resource-id': 'teams-switch', bounds: '[60,500][150,560]'}},
    {attributes: {text: 'Team Mode', bounds: '[120,500][600,560]'}},
  ]};
  const s = fromMaestroHierarchy(tree, {device: 'android-compact-360', screen: 'home', density: 3, viewport: {width: 360, height: 800}, provenance: {...RUN, configHash: configHash(snapscore)}});
  assert.equal(s.targets.length, 2);
  assert.deepEqual(s.texts.find(t => t.name === 'Start').owners, [0]);
  const r = runGate({config: snapscore, snapshots: [s], provenance: RUN});
  const rules = r.results[0].failures.map(f => f.rule);
  assert.ok(rules.includes('target-size'), '30x20dp switch fails the 48dp floor');
  assert.ok(rules.includes('text-over-control'), 'Team Mode label collides with the switch');
  assert.throws(() => fromMaestroHierarchy(null, {device: 'x', screen: 'y'}), /must be an object/);
});

test('vision: config reviewerPolicy + declared fixtures drive the cross-company and rubric-drift checks', () => {
  const policy = snapscore.reviewerPolicy;
  const H1 = 'sha256:' + '1'.repeat(64), H2 = 'sha256:' + '2'.repeat(64);
  const fixtures = {negative: [{image: 'multi-day.png', artifactHash: H1, expectDefect: 'x'}, {image: 'team-mode.png', artifactHash: H2, expectDefect: 'y'}]};
  const reviewer = {provider: 'openai', model: 'gpt-6-astra', effort: 'high'};
  const negs = [review({...neg('multi-day.png'), artifactHash: H1, reviewer}), review({...neg('team-mode.png'), artifactHash: H2, reviewer})];
  const base = {required, sourceSha: SHA, policy, fixtures};
  assert.equal(evaluateVision({...base, reviews: [...negs, review({reviewer})]}).verdict, 'PASS');
  // Policy names openai; an unlisted third provider is rejected even though it is not the builder.
  assert.match(evaluateVision({...base, reviews: [...negs, review({reviewer: {...reviewer, provider: 'google'}})]}).invalid[0].errors.join(), /not the policy reviewer/);
  assert.match(evaluateVision({...base, reviews: [...negs, review({reviewer: {...reviewer, provider: 'anthropic'}})]}).invalid[0].errors.join(), /no self-review/);
  assert.match(evaluateVision({...base, reviews: [...negs, review({reviewer: {...reviewer, provider: 'grok'}})]}).invalid[0].errors.join(), /not allowed/);
  // A declared negative fixture that was skipped, or one not yet committed, is rubric drift.
  assert.match(evaluateVision({...base, reviews: [negs[0], review({reviewer})]}).drift.map(d => d.reason).join(), /team-mode.png was not reviewed/);
  const shipped = evaluateVision({...base, fixtures: snapscore.fixtures, reviews: [...negs, review({reviewer})]});
  assert.equal(shipped.verdict, 'FAIL', 'shipped fixtures are pending until AUG-1385 commits them');
  assert.match(shipped.drift.map(d => d.reason).join(), /not committed yet \(AUG-1385\)/);
});

test('requiredCheckpoints expands devices x flows x checkpoints from the config', () => {
  const cps = requiredCheckpoints(snapscore);
  const perDevice = snapscore.flows.reduce((n, f) => n + f.checkpoints.length, 0);
  assert.equal(cps.length, snapscore.devices.length * perDevice);
  assert.deepEqual(cps[0], {device: snapscore.devices[0].id, flow: snapscore.flows[0].id, checkpoint: snapscore.flows[0].checkpoints[0]});
});

// --- AUG-1384 round 2: close the three checker FAILING-CHECK lines ---

test('gate (AUG-1384): a config with no declared screens fails closed; a declared matrix rejects missing coverage', () => {
  // snapscore declares 6 devices + 3 flows but no screens. A single valid snapshot
  // must NOT certify the whole matrix (the pre-fix bug: PASS with missing=[]).
  const r = gate({config: snapscore, snapshots: [snap('iphone-se-3', 'home', [box(0, 'ok', 10, 30, 50, 50)])]});
  assert.equal(r.verdict, 'FAIL', 'no capture contract -> fail closed, not PASS');
  assert.ok(r.missing.length > 0, 'missing coverage must be reported, not an empty missing[]');
  assert.deepEqual(r.missing, [{device: '*', screen: '*'}]);
  // Once a screens coverage contract exists, every declared device must be covered.
  const cfg = {...snapscore, screens: [{id: 'home', devices: ['iphone-se-3', 'iphone-16']}]};
  const partial = gate({config: cfg, snapshots: [snap('iphone-se-3', 'home', [box(0, 'ok', 10, 30, 50, 50)])]});
  assert.equal(partial.verdict, 'FAIL');
  assert.deepEqual(partial.missing, [{device: 'iphone-16', screen: 'home'}]);
});

test('geometry (AUG-1384): a target whose declared size is empty/non-finite is INVALID, not silently sized', () => {
  const cfg = {...snapscore, screens: [{id: 'home', devices: ['iphone-se-3']}]};
  // 1x1 control that previously PASSed only because size:{} hid its true geometry.
  const bad = gate({config: cfg, snapshots: [snap('iphone-se-3', 'home', [box(0, 'pill', 10, 30, 1, 1, {size: {}})])]});
  assert.equal(bad.verdict, 'FAIL');
  assert.match(bad.invalid[0].errors.join(), /size must have finite positive/);
  assert.match(gate({config: cfg, snapshots: [snap('iphone-se-3', 'home', [box(0, 'pill', 10, 30, 60, 60, {size: {width: 0, height: 44}})])]}).invalid[0].errors.join(), /size must have finite positive/);
  // The same 1x1 control with no size field is a target-size FAILURE (evaluated), not INVALID.
  const noSize = gate({config: cfg, snapshots: [snap('iphone-se-3', 'home', [box(0, 'pill', 10, 30, 1, 1)])]});
  assert.equal(noSize.invalid.length, 0);
  assert.ok(noSize.results[0].failures.some(f => f.rule === 'target-size'));
});

test('vision (AUG-1384): reviewer model, the gated buildHash and the captured artifactHash are bound, not just provider', () => {
  const policy = snapscore.reviewerPolicy; // reviewer openai / gpt-6-astra / high
  const reviewer = {provider: 'openai', model: 'gpt-6-astra', effort: 'high'};
  const H1 = 'sha256:' + '1'.repeat(64);
  const fixtures = {negative: [{image: 'm.png', artifactHash: H1, expectDefect: 'x'}]};
  const negHit = review({...neg('m.png'), artifactHash: H1, reviewer});
  const BUILD = 'build-candidate', ART = 'sha256:' + 'a'.repeat(64);
  const cp = {device: 'iphone-16-pro', flow: 'new-contest', checkpoint: 'step-2'};
  const artifacts = {[`${cp.device}::${cp.flow}::${cp.checkpoint}`]: ART};
  const base = {required: [cp], sourceSha: SHA, policy, fixtures, buildHash: BUILD, artifacts};
  // A candidate bound to the gated build + captured artifact + policy model -> PASS.
  assert.equal(evaluateVision({...base, reviews: [negHit, review({reviewer, buildHash: BUILD, artifactHash: ART})]}).verdict, 'PASS');
  // Right provider, cheaper/weaker model -> off-policy, INVALID.
  assert.match(evaluateVision({...base, reviews: [negHit, review({reviewer: {provider: 'openai', model: 'gpt-6.1-sol', effort: 'high'}, buildHash: BUILD, artifactHash: ART})]}).invalid[0].errors.join(), /is not the policy reviewer model/);
  // Current sourceSha paired with a stale build -> INVALID.
  assert.match(evaluateVision({...base, reviews: [negHit, review({reviewer, buildHash: 'build-stale', artifactHash: ART})]}).invalid[0].errors.join(), /not the gated build/);
  // An arbitrary screenshot artifactHash that is not the captured one -> INVALID.
  assert.match(evaluateVision({...base, reviews: [negHit, review({reviewer, buildHash: BUILD, artifactHash: 'sha256:' + 'f'.repeat(64)})]}).invalid[0].errors.join(), /not the captured artifact/);
  // A checkpoint with no captured artifact bound cannot pass on an asserted hash.
  assert.match(evaluateVision({...base, reviews: [negHit, review({reviewer, buildHash: BUILD, artifactHash: ART, checkpoint: 'ghost'})]}).invalid[0].errors.join(), /no captured artifact bound/);
});
