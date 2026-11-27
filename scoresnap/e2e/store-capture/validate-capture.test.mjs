import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  loadConfig, loadListing, listingFrames, validateConfig, validateManifest,
  validateManifestFiles, verifyScreenAnchorsExist, SCREEN_ANCHORS,
  MIN_REQUIRED_PROVENANCE, MIN_REQUIRED_ENTRY_FIELDS,
  loadAcceptedRelease, validateAcceptedRelease, validateAcceptedReleaseBinding,
  loadOverlayManifest, validateOverlayBinding, decodePngDimensions,
} from './validate-capture.mjs';

const fresh = () => structuredClone(loadConfig());
const hex = (c, n) => c.repeat(n);
const realConfigSha256 = () => createHash('sha256').update(readFileSync(fileURLToPath(new URL('./capture-config.json', import.meta.url)))).digest('hex');
const ACCEPTED_FIXTURE = { buildId: 'b1', sourceSha: hex('a', 40), simulatorRuntime: 'iOS 26' };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}
// Synthetic, genuinely decodable non-interlaced 8-bit RGBA pixels; no creative asset.
function fakePng(width, height, options = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = options.depth ?? 8; ihdr[9] = options.color ?? 6; ihdr[10] = options.compression ?? 0; ihdr[11] = options.filterMethod ?? 0; ihdr[12] = options.interlace ?? 0;
  const raw = options.raw ?? Buffer.alloc((width * 4 + 1) * height);
  if (options.marker) raw[1] = options.marker;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', options.idat ?? zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
// The old header-only shape the checker flagged: signature + an IHDR-looking tag/length/dims with
// no CRC and no IDAT/IEND -- must now be rejected as "not decodable", not accepted as a PNG.
function truncatedHeaderOnlyPng(width, height) {
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
  'no target': c => { c.targets.pop(); },
  'wrong iphone size': c => { c.targets[0].width = 1290; },
  'ipad target added back': c => { c.targets.push({ id: 'ipad-13', family: 'iPad', displayInches: 13, width: 2064, height: 2752 }); },
  'iphone target relabelled as ipad': c => { c.targets[0].family = 'iPad'; },
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
    const textBytes = Buffer.from('not a PNG; one identical unrelated file for all captures');
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

test('decodePngDimensions rejects a header-only buffer with no CRC, IDAT or IEND', () => {
  // Same byte shape the checker's probe used: a signature + length-shaped IHDR tag/dims is not,
  // on its own, a decodable image -- it must have a complete chunk stream (CRC, pixel data, end).
  assert.equal(decodePngDimensions(truncatedHeaderOnlyPng(1320, 2868)), null);
});

test('validateManifestFiles rejects a header-only fake PNG the same way it rejects a plain text file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aug1279-capture-'));
  try {
    const bytes = truncatedHeaderOnlyPng(1320, 2868);
    writeFileSync(join(dir, 'truncated.png'), bytes);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const m = { entries: [{ target: 'iphone-6.9', frame: 1, file: 'truncated.png', width: 1320, height: 2868, sha256: hash }] };
    assert.ok(validateManifestFiles(m, dir).some(e => e.includes('is not a PNG')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadAcceptedRelease returns null in the shipped repo (no build has been accepted yet)', () => {
  assert.equal(loadAcceptedRelease(), null);
});

test('validateAcceptedRelease rejects a present-but-incomplete accepted-release record', () => {
  assert.ok(validateAcceptedRelease(null).length > 0);
  assert.ok(validateAcceptedRelease({}).some(e => e.includes('buildId')));
  assert.ok(validateAcceptedRelease({ buildId: 'b1', sourceSha: hex('a', 40) }).some(e => e.includes('simulatorRuntime')));
  assert.ok(validateAcceptedRelease({ buildId: 'b1', simulatorRuntime: 'iOS 26' }).some(e => e.includes('sourceSha')));
  assert.deepEqual(validateAcceptedRelease(ACCEPTED_FIXTURE), []);
});

test('validateAcceptedReleaseBinding', () => {
  assert.ok(validateAcceptedReleaseBinding({ provenance: {} }, null).length > 0);
  assert.ok(validateAcceptedReleaseBinding({ provenance: {} }, {}).some(e => e.includes('buildId')));
  const m = goodManifest();
  assert.deepEqual(validateAcceptedReleaseBinding(m, ACCEPTED_FIXTURE), []);
  assert.ok(validateAcceptedReleaseBinding({ provenance: { ...m.provenance, buildId: 'invented-build-not-accepted' } }, ACCEPTED_FIXTURE).some(e => e.includes('buildId')));
  assert.ok(validateAcceptedReleaseBinding({ provenance: { ...m.provenance, sourceSha: hex('0', 40) } }, ACCEPTED_FIXTURE).some(e => e.includes('sourceSha')));
  assert.ok(validateAcceptedReleaseBinding({ provenance: { ...m.provenance, simulatorRuntime: 'iOS 99' } }, ACCEPTED_FIXTURE).some(e => e.includes('simulatorRuntime')));
  // A fully-accepted record that itself lacks simulatorRuntime must not make runtime binding
  // optional -- this is the gap the checker named ("accepted-release lacking simulatorRuntime
  // accepts manifest iOS 99").
  assert.ok(validateAcceptedReleaseBinding({ provenance: { ...m.provenance, simulatorRuntime: 'iOS 99' } }, { buildId: 'b1', sourceSha: hex('a', 40) }).some(e => e.includes('simulatorRuntime')));
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

// These CRC-valid containers passed the previous header/chunk-only decoder.
test('PNG decoder rejects corrupt compressed pixels and wrong decoded length', () => {
  for (const options of [
    { idat: Buffer.from('not-a-zlib-stream') },
    { raw: Buffer.alloc(5) },
    { raw: Buffer.alloc(2 * (2 * 4 + 1) + 1) },
    { raw: Buffer.alloc(2 * (2 * 4 + 1), 5) },
    { idat: Buffer.concat([zlib.deflateSync(Buffer.alloc(18)), Buffer.from('trailing')]) },
  ]) assert.equal(decodePngDimensions(fakePng(2, 2, options)), null);
  assert.equal(decodePngDimensions(fakePng(1320, 2868, { raw: Buffer.alloc(5) })), null);
});

test('PNG decoder rejects unsupported modes and unsafe dimensions before decoding', () => {
  for (const options of [
    { depth: 16 }, { color: 3 }, { color: 0 }, { color: 5 },
    { compression: 1 }, { filterMethod: 1 }, { interlace: 1 },
  ]) assert.equal(decodePngDimensions(fakePng(1, 1, options)), null);
  for (const [w, h] of [[0, 1], [1, 0], [0xffffffff, 1], [8192, 8192]])
    assert.equal(decodePngDimensions(fakePng(w, h, { raw: Buffer.alloc(5) })), null);
  // Expands far beyond the one pixel declared: maxOutputLength must bound inflation.
  assert.equal(decodePngDimensions(fakePng(1, 1, { raw: Buffer.alloc(1024 * 1024) })), null);
});

test('PNG decoder enforces chunk ordering and terminal structure', () => {
  const p = fakePng(1, 1);
  const header = p.subarray(8, 33), data = p.subarray(33, -12), end = p.subarray(-12);
  const joinChunks = (...chunks) => Buffer.concat([PNG_SIGNATURE, ...chunks]);
  for (const bytes of [
    joinChunks(data, header, end),
    joinChunks(header, data, pngChunk('IEND', Buffer.from('x'))),
    Buffer.concat([p, Buffer.from('trailing')]),
    joinChunks(header, pngChunk('ABCD', Buffer.alloc(0)), data, end),
    joinChunks(header, data, pngChunk('tEXt', Buffer.from('x')), data, end),
    joinChunks(header, data, pngChunk('PLTE', Buffer.from([0, 0, 0])), end),
    joinChunks(header, pngChunk('PLTE', Buffer.from([0])), data, end),
  ]) assert.equal(decodePngDimensions(bytes), null);
  assert.deepEqual(decodePngDimensions(p), { width: 1, height: 1 });
});

test('manifest pipeline rejects every CRC-valid corrupt IDAT file (one per target x frame) and accepts real pixels', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aug1303-pixels-'));
  try {
    for (const mode of ['corrupt', 'short', 'valid']) {
      const m = goodManifest();
      m.entries.forEach((e, i) => {
        const options = mode === 'corrupt' ? { idat: Buffer.from(`not-a-zlib-stream-${e.target}-${e.frame}`) }
          : mode === 'short' ? { raw: Buffer.from([0, i, 0, 0, 0]) } : { marker: i + 1 };
        const bytes = fakePng(e.width, e.height, options);
        writeFileSync(join(dir, e.file), bytes);
        e.sha256 = createHash('sha256').update(bytes).digest('hex');
      });
      // Metadata is intentionally valid; file validation must still fail closed.
      assert.deepEqual(validateManifestAccepted(m), []);
      const errors = validateManifestFiles(m, dir);
      if (mode === 'valid') assert.deepEqual(errors, []);
      else { assert.equal(m.entries.length, 8); assert.equal(errors.filter(e => e.includes('is not a PNG')).length, m.entries.length); }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('PNG decoder accepts supported RGB/RGBA filters and contiguous split IDAT', () => {
  for (const color of [2, 6]) for (let filter = 0; filter <= 4; filter++) {
    const row = Buffer.alloc((color === 6 ? 4 : 3) + 1, 123);
    row[0] = filter;
    const p = fakePng(1, 1, { color, raw: row });
    assert.deepEqual(decodePngDimensions(p), { width: 1, height: 1 });
    const compressed = zlib.deflateSync(row);
    const split = Buffer.concat([p.subarray(0, 33),
      pngChunk('IDAT', compressed.subarray(0, 3)), pngChunk('IDAT', Buffer.alloc(0)),
      pngChunk('IDAT', compressed.subarray(3)), p.subarray(-12)]);
    assert.deepEqual(decodePngDimensions(split), { width: 1, height: 1 });
  }
});

test('PNG decoder bounds compressed input, chunk count and on-disk reads', () => {
  const tooLarge = Buffer.alloc(64 * 1024 * 1024 + 1);
  PNG_SIGNATURE.copy(tooLarge);
  assert.equal(decodePngDimensions(tooLarge), null);
  const p = fakePng(1, 1);
  assert.equal(decodePngDimensions(Buffer.concat([p.subarray(0, 33),
    ...Array.from({ length: 4096 }, () => pngChunk('teSt', Buffer.alloc(0))), p.subarray(33)])), null);
  const dir = mkdtempSync(join(tmpdir(), 'aug1303-limit-'));
  try {
    const file = join(dir, 'oversized.png');
    writeFileSync(file, Buffer.alloc(0));
    truncateSync(file, tooLarge.length); // sparse, no large disk output
    assert.match(validateManifestFiles({ entries: [{ file: 'oversized.png' }] }, dir)[0], /byte limit/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
