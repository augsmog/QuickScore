import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runBundle, validateBundle, expectedFlows, configSha256 } from '../run-geometry.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(resolve(__dir, '../config/device-layout.config.json'), 'utf8'));
const EMPTY_WAIVERS = { waivers: [] };
const SHA = 'a'.repeat(40);
const CTX = { viewport: { width: 360, height: 800 }, safeArea: { top: 24, bottom: 0, left: 0, right: 0 } };
const cp = (nodes, context = {}, over = {}) => ({
  flow: 'new-contest', checkpoint: 'c', screen: 'New Contest', deviceId: 'android-compact',
  platform: 'android', context: { ...CTX, ...context }, nodes, ...over,
});
const bundle = (checkpoints, over = {}) => ({
  sourceSha: SHA, buildHash: 'apk-sha256:1', profile: 'android-compact', platform: 'android',
  checkpoints, ...over,
});
const ctrl = (id, box, meta = {}) =>
  ({ id, role: 'control', text: id, bbox: box, hitRegion: box, enabled: true, parentId: null, meta });
const okNode = () => ctrl('b', { left: 20, top: 100, right: 340, bottom: 160 }, { required: true });

test('runBundle fails an empty bundle (missing flow evidence)', () => {
  const r = runBundle(bundle([]), EMPTY_WAIVERS);
  assert.equal(r.ok, false);
  assert.match(r.error, /missing flow evidence/);
  assert.equal(runBundle({}, EMPTY_WAIVERS).ok, false);
});

test('runBundle passes a clean checkpoint and fails a clipped one', () => {
  assert.equal(runBundle(bundle([cp([okNode()])]), EMPTY_WAIVERS).ok, true);
  const clipped = runBundle(bundle([cp(
    [ctrl('card', { left: 20, top: 720, right: 340, bottom: 790 }, { required: true })],
    { footer: { left: 0, top: 760, right: 360, bottom: 800 } },
  )]), EMPTY_WAIVERS);
  assert.equal(clipped.ok, false);
  assert.equal(clipped.keptCount, 1);
});

// Codex check on 7116885, finding 2: evidence must be candidate-bound and complete.
test('runBundle fails a checkpoint with no nodes and no metadata (Codex repro)', () => {
  const r = runBundle({ checkpoints: [{ nodes: [] }] }, EMPTY_WAIVERS);
  assert.equal(r.ok, false);
  for (const re of [/sourceSha/, /buildHash/, /profile/, /platform/, /"flow"/, /"checkpoint"/, /no captured nodes/]) {
    assert.match(r.error, re);
  }
});

test('validateBundle: stale SHA, wrong profile, cross-device and cross-platform checkpoints fail', () => {
  const b = bundle([cp([okNode()])]);
  assert.deepEqual(validateBundle(b, { sourceSha: SHA, profile: 'android-compact' }), []);
  assert.match(validateBundle(b, { sourceSha: 'b'.repeat(40) }).join(), /stale evidence/);
  assert.match(validateBundle(b, { profile: 'iphone-se-3' }).join(), /profile/);
  assert.match(validateBundle(bundle([cp([okNode()], {}, { deviceId: 'iphone-se-3' })])).join(), /deviceId/);
  assert.match(validateBundle(bundle([cp([okNode()], {}, { platform: 'ios' })])).join(), /platform ios/);
});

test('validateBundle: every expected per-PR checkpoint must be present (rule 8)', () => {
  const flows = expectedFlows(CONFIG, 'per-pr');
  assert.deepEqual(flows.map((f) => f.id).sort(), ['join', 'new-contest', 'paywall']);
  const all = flows.flatMap((f) => f.checkpoints.map((c) => cp([okNode()], {}, { flow: f.id, checkpoint: c })));
  assert.deepEqual(validateBundle(bundle(all), { flows }), []);
  const missingOne = all.filter((x) => !(x.flow === 'paywall' && x.checkpoint === flows.find((f) => f.id === 'paywall').checkpoints[0]));
  const errs = validateBundle(bundle(missingOne), { flows });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /missing checkpoint paywall\//);
  assert.ok(expectedFlows(CONFIG, 'nightly').some((f) => f.id === 'leagues'));
});

// Codex check on 79a87a2: malformed nodes / missing device geometry / unbound provenance escapes.
test('validateBundle: malformed nodes and missing viewport/safeArea context fail (Codex probe)', () => {
  const flows = expectedFlows(CONFIG, 'per-pr');
  const all = (nodes, ctx) => flows.flatMap((f) => f.checkpoints.map((c) => ({
    flow: f.id, checkpoint: c, screen: f.id, deviceId: 'iphone-se-3', platform: 'ios', context: ctx, nodes })));
  const b = (cps) => ({ sourceSha: SHA, buildHash: 'x', profile: 'iphone-se-3', platform: 'ios', checkpoints: cps });
  const malformed = validateBundle(b(all([{}], {})), { flows, config: CONFIG });
  assert.match(malformed.join(), /finite measured bbox/);
  assert.match(malformed.join(), /missing measured context.viewport/);
  assert.match(malformed.join(), /missing measured context.safeArea/);
  // A control at 999..1099 on SE with no context was a PASS; now it needs context, and with the
  // real SE viewport the geometry rules flag it.
  const far = { id: 'x', role: 'control', text: 'x', bbox: { left: 999, top: 999, right: 1099, bottom: 1099 },
    hitRegion: { left: 999, top: 999, right: 1099, bottom: 1099 }, enabled: true, parentId: null, meta: { required: true } };
  assert.equal(runBundle(b(all([far], {})), EMPTY_WAIVERS, new Date(), { flows, config: CONFIG }).ok, false);
  const seCtx = { viewport: { width: 375, height: 667 }, safeArea: { top: 20, bottom: 0, left: 0, right: 0 } };
  const r = runBundle(b(all([far], seCtx)), EMPTY_WAIVERS, new Date(), { flows, config: CONFIG });
  assert.equal(r.ok, false);
  assert.ok(r.keptCount > 0, 'off-viewport control must be a rule 2 finding');
});

test('validateBundle: declared profile viewport, platform, build and config binding', () => {
  const ok = bundle([cp([okNode()])]);
  assert.deepEqual(validateBundle(ok, { config: CONFIG }), []);
  assert.match(validateBundle(bundle([cp([okNode()], { viewport: { width: 393, height: 851 } })]), { config: CONFIG }).join(), /!= declared android-compact 360x800/);
  // Android measured size within 2% passes.
  assert.deepEqual(validateBundle(bundle([cp([okNode()], { viewport: { width: 361.4, height: 803 } })]), { config: CONFIG }), []);
  assert.match(validateBundle(bundle([cp([okNode()])], { profile: 'nope' }), { config: CONFIG }).join(), /not declared/);
  assert.match(validateBundle(ok, { buildHash: 'other' }).join(), /candidate build/);
  const text = readFileSync(resolve(__dir, '../config/device-layout.config.json'), 'utf8');
  assert.match(validateBundle(ok, { configSha256: configSha256(text) }).join(), /configSha256/);
  assert.deepEqual(validateBundle({ ...ok, configSha256: configSha256(text) }, { configSha256: configSha256(text) }), []);
});
