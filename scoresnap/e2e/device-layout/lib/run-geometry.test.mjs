import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runBundle, validateBundle, expectedFlows } from '../run-geometry.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(resolve(__dir, '../config/device-layout.config.json'), 'utf8'));
const EMPTY_WAIVERS = { waivers: [] };
const SHA = 'a'.repeat(40);
const cp = (nodes, context = {}, over = {}) => ({
  flow: 'new-contest', checkpoint: 'c', screen: 'New Contest', deviceId: 'android-compact',
  platform: 'android', context, nodes, ...over,
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
