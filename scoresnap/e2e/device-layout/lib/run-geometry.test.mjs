import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBundle } from '../run-geometry.mjs';

const EMPTY_WAIVERS = { waivers: [] };
const cp = (nodes, context = {}) => ({
  flow: 'new-contest', checkpoint: 'c', screen: 'New Contest', deviceId: 'android-compact',
  platform: 'android', context, nodes,
});
const ctrl = (id, box, meta = {}) =>
  ({ id, role: 'control', text: id, bbox: box, hitRegion: box, enabled: true, parentId: null, meta });

test('runBundle fails an empty bundle (missing flow evidence)', () => {
  const r = runBundle({ checkpoints: [] }, EMPTY_WAIVERS);
  assert.equal(r.ok, false);
  assert.match(r.error, /missing flow evidence/);
  const r2 = runBundle({}, EMPTY_WAIVERS);
  assert.equal(r2.ok, false);
});

test('runBundle passes a clean checkpoint and fails a clipped one', () => {
  const clean = runBundle({ checkpoints: [cp([ctrl('b', { left: 20, top: 100, right: 340, bottom: 160 }, { required: true })])] }, EMPTY_WAIVERS);
  assert.equal(clean.ok, true);
  const clipped = runBundle({ checkpoints: [cp(
    [ctrl('card', { left: 20, top: 720, right: 340, bottom: 790 }, { required: true })],
    { footer: { left: 0, top: 760, right: 360, bottom: 800 } },
  )] }, EMPTY_WAIVERS);
  assert.equal(clipped.ok, false);
  assert.equal(clipped.keptCount, 1);
});
