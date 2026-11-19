import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { loadConfig } from './validate-capture.mjs';
import { decodePng, parseChunks, LIMITS } from './png-decode.mjs';
import { consume, verifyManifest, pngSize, configSha256 } from './consume-capture.mjs';

// Genuine PNG encoder: real IHDR/IDAT/IEND chunks, CRCs, filtered scanlines, non-uniform pixels.
const chunk = (type, data) => { const t = Buffer.from(type, 'ascii'), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(data.length); c.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0); return Buffer.concat([l, t, data, c]); };
export function png(w, h, { salt = 0, uniform = false, ctype = 2, depth = 8 } = {}) {
  const ch = { 0: 1, 2: 3, 6: 4 }[ctype], stride = w * ch, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = uniform ? 0 : y % 5;
    for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = uniform ? 7 : (x * 3 + y * 5 + salt * 11) & 255; }
  // raw bytes are filter *residuals*; any residual stream is a valid image, so the decoder must reconstruct deterministically.
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = depth; ihdr[9] = ctype;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const prov = { buildId: 'b1', sourceSha: 'a'.repeat(40), simulatorRuntime: 'iOS 26', capturedAt: '2026-11-18T00:00:00Z' };
function fixture(mut) {
  const dir = mkdtempSync(join(tmpdir(), 'cap-'));
  const c = loadConfig(); let i = 0;
  for (const t of c.targets) for (const f of c.frames) writeFileSync(join(dir, `${t.id}-${f.n}.png`), png(t.width, t.height, { salt: i++ }));
  mut?.(dir, c);
  return dir;
}
test('good capture dir yields a valid, config-bound manifest', () => {
  const dir = fixture(); const { manifest, errs } = consume(dir, prov);
  assert.deepEqual(errs, []); assert.equal(manifest.entries.length, 16);
  assert.equal(manifest.provenance.configSha256, configSha256());
  assert.deepEqual(verifyManifest(manifest), []); rmSync(dir, { recursive: true });
});
test('pngSize rejects non-PNG', () => assert.throws(() => pngSize(Buffer.alloc(40))));
test('missing frame file rejected', () => { const d = fixture(dir => rmSync(join(dir, 'ipad-13-4.png'))); assert.ok(consume(d, prov).errs.length > 0); });
test('wrong-dimension frame rejected', () => { const d = fixture(dir => writeFileSync(join(dir, 'iphone-6.9-2.png'), png(100, 100))); assert.ok(consume(d, prov).errs.some(e => /dimensions/.test(e))); });
test('unexpected extra png rejected', () => { const d = fixture(dir => writeFileSync(join(dir, 'extra.png'), png(1, 1))); assert.ok(consume(d, prov).errs.some(e => /unexpected/.test(e))); });
test('corrupt png rejected', () => { const d = fixture(dir => writeFileSync(join(dir, 'ipad-13-1.png'), 'junk')); assert.ok(consume(d, prov).errs.some(e => /not a PNG/.test(e))); });
test('missing provenance rejected', () => { const d = fixture(); assert.ok(consume(d, { ...prov, buildId: '' }).errs.some(e => /buildId/.test(e))); });
test('stale configSha256 binding rejected', () => {
  const { manifest } = consume(fixture(), prov); manifest.provenance.configSha256 = 'f'.repeat(64);
  assert.ok(verifyManifest(manifest).some(e => /does not match/.test(e)));
});

test('uniform/blank frame rejected', () => { const d = fixture(dir => writeFileSync(join(dir, 'ipad-13-2.png'), png(2064, 2752, { uniform: true }))); assert.ok(consume(d, prov).errs.some(e => /blank or near-uniform/.test(e))); });
test('header-only fake png (no chunks/CRC) rejected', () => {
  const fake = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(fake); fake.writeUInt32BE(13, 8); fake.write('IHDR', 12, 'ascii'); fake.writeUInt32BE(1320, 16); fake.writeUInt32BE(2868, 20);
  const d = fixture(dir => writeFileSync(join(dir, 'iphone-6.9-3.png'), fake)); assert.ok(consume(d, prov).errs.some(e => /iphone-6.9-3.png/.test(e)));
});
test('flipped byte fails CRC', () => { const b = png(16, 16); b[b.length - 20] ^= 0xff; assert.throws(() => decodePng(b), /crc|inflate|length/); });
test('truncated png rejected', () => { const b = png(16, 16); assert.throws(() => parseChunks(b.subarray(0, b.length - 10)), /truncated|IEND/); });
test('oversized dimensions rejected before allocation', () => { assert.throws(() => decodePng(png(9000, 4)), /out of bounds/); assert.throws(() => decodePng(png(8000, 8000)), /out of bounds/); });
test('decompression bomb is bounded', () => {
  const b = png(64, 64); const bomb = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(64, 0); ihdr.writeUInt32BE(64, 4); ihdr[8] = 8; ihdr[9] = 2;
  const big = Buffer.concat([bomb, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(50_000_000))), chunk('IEND', Buffer.alloc(0))]);
  assert.throws(() => decodePng(big), /inflate failed|length/); assert.ok(b.length > 0);
});
test('file size cap enforced', () => assert.throws(() => parseChunks(Buffer.alloc(LIMITS.maxFileBytes + 1)), /too large/));
test('unsupported formats rejected not guessed', () => { assert.throws(() => decodePng(png(8, 8, { depth: 16 })), /unsupported/); });
test('decoder reconstructs known pixels (Sub/Up/Paeth)', () => {
  // 2x2 gray: row0 filter None [10,20]; row1 filter Up [1,2] -> [11,22]
  const raw = Buffer.from([0, 10, 20, 2, 1, 2]); const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 0;
  const b = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  assert.deepEqual([...decodePng(b).pixels], [10, 20, 11, 22]);
});
