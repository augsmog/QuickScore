import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, loadListing, listingFrames, validateConfig, validateManifest } from './validate-capture.mjs';

const fresh = () => structuredClone(loadConfig());
const hex = (c, n) => c.repeat(n);
function goodManifest(c = loadConfig()) {
  return {
    provenance: { buildId: 'b1', sourceSha: hex('a', 40), configSha256: hex('b', 64), simulatorRuntime: 'iOS 26', capturedAt: '2026-11-18T00:00:00Z' },
    entries: c.targets.flatMap(t => c.frames.map(f => ({ target: t.id, frame: f.n, file: `${t.id}-${f.n}.png`, width: t.width, height: t.height, sha256: hex('c', 64) }))),
  };
}
test('shipped config is valid', () => assert.deepEqual(validateConfig(loadConfig()), []));
test('listing defines eight frames', () => assert.equal(listingFrames(loadListing()).length, 8));
const cm = {
  'device execution': c => { c.execution.deviceExecution = true; },
  'asc upload': c => { c.execution.ascUpload = true; },
  'new build': c => { c.execution.newBuild = true; },
  'asset generation': c => { c.execution.assetGeneration = true; },
  'overlay changed': c => { c.overlays.mode = 'regenerate'; },
  'seven frames': c => { c.frames.pop(); },
  'frames reordered': c => { c.frames.reverse(); },
  'caption drift': c => { c.frames[2].caption = '60+ game modes'; },
  'one target': c => { c.targets.pop(); },
  'wrong ipad size': c => { c.targets[1].width = 2048; },
};
for (const [n, m] of Object.entries(cm)) test(`config rejects: ${n}`, () => { const c = fresh(); m(c); assert.ok(validateConfig(c).length > 0); });
test('good manifest passes', () => assert.deepEqual(validateManifest(goodManifest()), []));
const mm = {
  'missing provenance': m => { delete m.provenance.buildId; },
  'bad source sha': m => { m.provenance.sourceSha = 'x'; },
  'dropped entry': m => { m.entries.pop(); },
  'wrong dims': m => { m.entries[0].width = 100; },
  'bad hash': m => { m.entries[3].sha256 = 'zz'; },
  'duplicate entry': m => { m.entries[1] = { ...m.entries[0] }; },
  'unknown target': m => { m.entries[0].target = 'ipad-11'; },
};
for (const [n, m] of Object.entries(mm)) test(`manifest rejects: ${n}`, () => { const x = goodManifest(); m(x); assert.ok(validateManifest(x).length > 0); });
