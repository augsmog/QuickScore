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
  loadAcceptedRelease, validateAcceptedReleaseBinding,
  loadOverlayManifest, validateOverlayBinding, decodePngDimensions,
} from './validate-capture.mjs';

const fresh = () => structuredClone(loadConfig());
const hex = (c, n) => c.repeat(n);
const realConfigSha256 = () => createHash('sha256').update(readFileSync(fileURLToPath(new URL('./capture-config.json', import.meta.url)))).digest('hex');
const ACCEPTED_FIXTURE = { buildId: 'b1', sourceSha: hex('a', 40), simulatorRuntime: 'iOS 26' };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function fakePng(width, height) {
  const buf = Buffer.alloc(33);
  PNG_SIGNATURE.copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}
function goodManifest(c = loadConfig()) {
  return {
    provenance: { buildId: 'b1', sourceSha: hex('a', 40), configSha256: realConfigSha256(), simulatorRuntime: 'iOS 26', capturedAt: '2026-11-18T00:00:00Z' },
    entries: c.targets.flatMap((t, ti) => c.frames.map((f, fi) => ({ target: t.id, frame: f.n, file: `${t.id}-${f.n}.png`, width: t.width, height: t.height, sha256: (ti * 8 + fi).toString(16).padStart(64, '0') }))),
  };
}
const validateManifestAccepted = (m, c = loadConfig()) => validateManifest(m, c, ACCEPTED_FIXTURE);
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
  'ids swapped, captions left in place': c => { [c.frames[0].id, c.frames[7].id] = [c.frames[7].id, c.frames[0].id]; },
};
for (const [n, m] of Object.entries(cm)) test(`config rejects: ${n}`, () => { const c = fresh(); m(c); assert.ok(validateConfig(c).length > 0); });
test('good manifest passes', () => assert.deepEqual(validateManifestAccepted(goodManifest()), []));
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
  'identical content across two different frames': m => { m.entries[2].sha256 = m.entries[0].sha256; },
};
for (const [n, m] of Object.entries(mm)) test(`manifest rejects: ${n}`, () => { const x = goodManifest(); m(x); assert.ok(validateManifestAccepted(x).length > 0); });
test('manifest ignores a config that tries to shrink the required-field baseline', () => {
  const weakened = fresh();
  weakened.manifest.requiredProvenance = [];
  weakened.manifest.requiredEntryFields = [];
  const m = goodManifest(weakened);
  delete m.provenance.buildId;
  assert.ok(validateManifestAccepted(m, weakened).some(e => e.includes('buildId')));
});
test('MIN_REQUIRED baselines are non-empty and shipped config declares a superset', () => {
  assert.ok(MIN_REQUIRED_PROVENANCE.length > 0);
  assert.ok(MIN_REQUIRED_ENTRY_FIELDS.length > 0);
  const c = loadConfig();
  for (const k of MIN_REQUIRED_PROVENANCE) assert.ok(c.manifest.requiredProvenance.includes(k));
  for (const k of MIN_REQUIRED_ENTRY_FIELDS) assert.ok(c.manifest.requiredEntryFields.includes(k));
});

test('validateManifestFiles binds entries to real files on disk, including decoded PNG dimensions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aug1279-capture-'));
  try {
    const realFile = join(dir, 'iphone-6.9-1.png');
    const pngBytes = fakePng(1320, 2868);
    writeFileSync(realFile, pngBytes);
    const realHash = createHash('sha256').update(pngBytes).digest('hex');
    const ok = { entries: [{ target: 'iphone-6.9', frame: 1, file: 'iphone-6.9-1.png', width: 1320, height: 2868, sha256: realHash }] };
    assert.deepEqual(validateManifestFiles(ok, dir), []);

    const missing = { entries: [{ target: 'iphone-6.9', frame: 1, file: 'nonexistent.png', width: 1320, height: 2868, sha256: realHash }] };
    assert.ok(validateManifestFiles(missing, dir).some(e => e.includes('not found')));

    const tampered = { entries: [{ target: 'iphone-6.9', frame: 1, file: 'iphone-6.9-1.png', width: 1320, height: 2868, sha256: hex('c', 64) }] };
    assert.ok(validateManifestFiles(tampered, dir).some(e => e.includes('mismatch')));

    const wrongDims = { entries: [{ target: 'iphone-6.9', frame: 1, file: 'iphone-6.9-1.png', width: 100, height: 100, sha256: realHash }] };
    assert.ok(validateManifestFiles(wrongDims, dir).some(e => e.includes('decoded PNG')));

    const textFile = join(dir, 'not-a-png.png');
    const textBytes = Buffer.from('not a PNG; one identical unrelated file for all sixteen captures');
    writeFileSync(textFile, textBytes);
    const textHash = createHash('sha256').update(textBytes).digest('hex');
    const fakedAsPng = { entries: [{ target: 'iphone-6.9', frame: 1, file: 'not-a-png.png', width: 1320, height: 2868, sha256: textHash }] };
    assert.ok(validateManifestFiles(fakedAsPng, dir).some(e => e.includes('is not a PNG')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('decodePngDimensions reads real IHDR width/height and rejects non-PNG bytes', () => {
  assert.deepEqual(decodePngDimensions(fakePng(1320, 2868)), { width: 1320, height: 2868 });
  assert.equal(decodePngDimensions(Buffer.from('not a png')), null);
});

test('loadAcceptedRelease returns null in the shipped repo (no build has been accepted yet)', () => {
  assert.equal(loadAcceptedRelease(), null);
});

test('validateAcceptedReleaseBinding', () => {
  assert.ok(validateAcceptedReleaseBinding({ provenance: {} }, null).length > 0);
  const m = goodManifest();
  assert.deepEqual(validateAcceptedReleaseBinding(m, ACCEPTED_FIXTURE), []);
  assert.ok(validateAcceptedReleaseBinding({ provenance: { ...m.provenance, buildId: 'invented-build-not-accepted' } }, ACCEPTED_FIXTURE).some(e => e.includes('buildId')));
  assert.ok(validateAcceptedReleaseBinding({ provenance: { ...m.provenance, sourceSha: hex('0', 40) } }, ACCEPTED_FIXTURE).some(e => e.includes('sourceSha')));
  assert.ok(validateAcceptedReleaseBinding({ provenance: { ...m.provenance, simulatorRuntime: 'iOS 99' } }, ACCEPTED_FIXTURE).some(e => e.includes('simulatorRuntime')));
});

test('loadOverlayManifest returns null in the shipped repo (DotBot has not staged overlays here yet)', () => {
  assert.equal(loadOverlayManifest(), null);
});

test('validateOverlayBinding binds staged overlay paths/digests per frame', () => {
  const c = loadConfig();
  assert.ok(validateOverlayBinding(c, null, '.').some(e => e.includes('no overlay manifest staged')));
  const bad = { ...c, overlays: { provider: 'DotBot', mode: 'regenerate' } };
  assert.ok(validateOverlayBinding(bad, {}, '.').some(e => e.includes('must reuse staged DotBot unchanged')));

  const dir = mkdtempSync(join(tmpdir(), 'aug1279-overlays-'));
  try {
    const overlayManifest = {};
    for (const f of c.frames) {
      const bytes = Buffer.from(`stub-overlay-bytes-${f.id}`);
      writeFileSync(join(dir, `${f.id}.svg`), bytes);
      overlayManifest[f.id] = { path: `${f.id}.svg`, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
    assert.deepEqual(validateOverlayBinding(c, overlayManifest, dir), []);

    const missingEntry = { ...overlayManifest };
    delete missingEntry[c.frames[0].id];
    assert.ok(validateOverlayBinding(c, missingEntry, dir).some(e => e.includes('missing staged path/digest')));

    const tamperedDigest = { ...overlayManifest, [c.frames[0].id]: { ...overlayManifest[c.frames[0].id], sha256: hex('c', 64) } };
    assert.ok(validateOverlayBinding(c, tamperedDigest, dir).some(e => e.includes('sha256 mismatch')));

    const missingFile = { ...overlayManifest, [c.frames[0].id]: { path: 'nonexistent.svg', sha256: hex('c', 64) } };
    assert.ok(validateOverlayBinding(c, missingFile, dir).some(e => e.includes('not found')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
