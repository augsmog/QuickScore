import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  loadConfig, loadListing, listingFrames, validateConfig, validateManifest,
  validateManifestFiles, verifyScreenAnchorsExist, SCREEN_ANCHORS,
  MIN_REQUIRED_PROVENANCE, MIN_REQUIRED_ENTRY_FIELDS,
} from './validate-capture.mjs';

const fresh = () => structuredClone(loadConfig());
const hex = (c, n) => c.repeat(n);
const realConfigSha256 = () => createHash('sha256').update(readFileSync(fileURLToPath(new URL('./capture-config.json', import.meta.url)))).digest('hex');
function goodManifest(c = loadConfig()) {
  return {
    provenance: { buildId: 'b1', sourceSha: hex('a', 40), configSha256: realConfigSha256(), simulatorRuntime: 'iOS 26', capturedAt: '2026-11-18T00:00:00Z' },
    entries: c.targets.flatMap(t => c.frames.map(f => ({ target: t.id, frame: f.n, file: `${t.id}-${f.n}.png`, width: t.width, height: t.height, sha256: hex('c', 64) }))),
  };
}
test('shipped config is valid', () => assert.deepEqual(validateConfig(loadConfig()), []));
test('listing defines eight frames', () => assert.equal(listingFrames(loadListing()).length, 8));
test('every frame id has a screen anchor', () => {
  for (const f of loadConfig().frames) assert.ok(SCREEN_ANCHORS[f.id], `no anchor for ${f.id}`);
});
test('screen anchors exist in the live app source', () => assert.deepEqual(verifyScreenAnchorsExist(), []));
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
  'unwired frame id': c => { c.frames[0].id = 'unrelated-screen-1'; },
  'weakened required provenance': c => { c.manifest.requiredProvenance = []; },
  'weakened required entry fields': c => { c.manifest.requiredEntryFields = []; },
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
  'not a runtime': m => { m.provenance.simulatorRuntime = 'nonexistent-runtime'; },
  'not a date': m => { m.provenance.capturedAt = 'not-a-date'; },
  'config hash does not match real file': m => { m.provenance.configSha256 = hex('b', 64); },
};
for (const [n, m] of Object.entries(mm)) test(`manifest rejects: ${n}`, () => { const x = goodManifest(); m(x); assert.ok(validateManifest(x).length > 0); });
test('manifest ignores a config that tries to shrink the required-field baseline', () => {
  const weakened = fresh();
  weakened.manifest.requiredProvenance = [];
  weakened.manifest.requiredEntryFields = [];
  const m = goodManifest(weakened);
  delete m.provenance.buildId;
  assert.ok(validateManifest(m, weakened).some(e => e.includes('buildId')));
});
test('MIN_REQUIRED baselines are non-empty and shipped config declares a superset', () => {
  assert.ok(MIN_REQUIRED_PROVENANCE.length > 0);
  assert.ok(MIN_REQUIRED_ENTRY_FIELDS.length > 0);
  const c = loadConfig();
  for (const k of MIN_REQUIRED_PROVENANCE) assert.ok(c.manifest.requiredProvenance.includes(k));
  for (const k of MIN_REQUIRED_ENTRY_FIELDS) assert.ok(c.manifest.requiredEntryFields.includes(k));
});

test('validateManifestFiles binds entries to real files on disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aug1279-capture-'));
  try {
    const realFile = join(dir, 'iphone-6.9-1.png');
    writeFileSync(realFile, 'fake-png-bytes');
    const realHash = createHash('sha256').update(readFileSync(realFile)).digest('hex');
    const ok = { entries: [{ target: 'iphone-6.9', frame: 1, file: 'iphone-6.9-1.png', sha256: realHash }] };
    assert.deepEqual(validateManifestFiles(ok, dir), []);

    const missing = { entries: [{ target: 'iphone-6.9', frame: 1, file: 'nonexistent.png', sha256: realHash }] };
    assert.ok(validateManifestFiles(missing, dir).some(e => e.includes('not found')));

    const tampered = { entries: [{ target: 'iphone-6.9', frame: 1, file: 'iphone-6.9-1.png', sha256: hex('c', 64) }] };
    assert.ok(validateManifestFiles(tampered, dir).some(e => e.includes('mismatch')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
