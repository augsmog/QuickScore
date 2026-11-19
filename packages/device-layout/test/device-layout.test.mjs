import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateConfig, resolveConfig} from '../src/config.mjs';
import {evaluateSnapshot, findOverlaps, SNAPSHOT_SCHEMA} from '../src/rules.mjs';
import {runGate, validateWaivers, WAIVER_SCHEMA} from '../src/gate.mjs';
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
  const device = profileToDevice('iphone-15-pro', {width: 393, height: 852, top: 59, bottom: 34});
  assert.deepEqual(device.safeArea, {top: 59, right: 0, bottom: 34, left: 0});
  const layout = {targets: [{id: 0, name: 'Save', left: 20, top: 100, right: 120, bottom: 140, raw: {}, size: {width: 100, height: 44}, backdrop: false}], texts: [{name: 'Save', left: 30, top: 110, right: 60, bottom: 130, owners: [0]}]};
  const s = fromCaptureAudit(layout, {device: 'iphone-15-pro', screen: 'settings'});
  const r = runGate({config: snapscore, snapshots: [s]});
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.results));
  assert.equal(r.results[0].failures.length, 0);
});

test('gate: missing required screen/device and empty snapshot fail', () => {
  const cfg = resolveConfig(lrd);
  const dev = cfg.devices.find(d => d.id === 'iphone-15-pro-landscape');
  const r = runGate({config: lrd, snapshots: [fromGodotDump(dump, dev), snap('iphone-se-landscape', 'main-menu', [], [])]});
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.invalid.length, 1);
  assert.equal(r.missing.length, 4 * 3 - 1);
  assert.equal(runGate({config: snapscore, snapshots: []}).verdict, 'FAIL', 'zero snapshots can never pass');
});

test('waivers: ticketed waiver moves a failure to waived; expired waiver fails gate; bad waiver rejected', () => {
  const s = snap('iphone-se', 'home', [box(0, 'tiny', 10, 30, 30, 30)]);
  const waiver = {id: 'w1', rule: 'target-size', subject: 'tiny', device: 'iphone-se', ticket: 'AUG-1381', reason: 'fixture exception for test', approvedBy: 'checker', expires: '2099-01-01'};
  const ok = runGate({config: snapscore, snapshots: [s], waivers: {schema: WAIVER_SCHEMA, waivers: [waiver]}});
  assert.equal(ok.verdict, 'PASS');
  assert.equal(ok.results[0].waived[0].ticket, 'AUG-1381');
  const old = runGate({config: snapscore, snapshots: [s], waivers: {schema: WAIVER_SCHEMA, waivers: [{...waiver, expires: '2020-01-01'}]}, today: '2026-11-19'});
  assert.equal(old.verdict, 'FAIL');
  assert.equal(old.results[0].failures.length, 1);
  assert.deepEqual(old.expiredWaivers.map(w => w.id), ['w1']);
  assert.ok(validateWaivers({schema: WAIVER_SCHEMA, waivers: [{...waiver, ticket: 'none', expires: 'soon'}]}).length >= 2);
});

test('receipt carries schema, digest, devices and pending vision rubric', () => {
  const r = runGate({config: snapscore, snapshots: [snap('iphone-se', 'home', [box(0, 'ok', 10, 30, 50, 50)])], sha: 'a'.repeat(40)});
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
  writeFileSync(join(dir, 'dumps', 'a.json'), JSON.stringify(dump));
  const cli = (...a) => spawnSync(process.execPath, [join(pkg, 'bin/device-layout.mjs'), ...a], {encoding: 'utf8'});
  const pass = cli('check', '--config', join(dir, 'one.json'), '--adapter', 'godot', '--snapshots', join(dir, 'dumps'), '--out', join(dir, 'r.json'));
  assert.equal(pass.status, 0, pass.stdout + pass.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')).verdict, 'PASS');
  const fail = cli('check', '--config', join(pkg, 'configs/lrd.device-layout.json'), '--adapter', 'godot', '--snapshots', join(dir, 'dumps'));
  assert.equal(fail.status, 1, fail.stdout + fail.stderr);
  assert.match(fail.stdout, /MISSING ipad-mini-landscape \/ pause-menu/);
  writeFileSync(join(dir, 'bad.json'), '{"schema":"nope"}');
  assert.equal(cli('validate', '--config', join(dir, 'bad.json')).status, 2);
});
