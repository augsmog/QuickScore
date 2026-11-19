import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { loadConfig } from './validate-capture.mjs';
import { consume, verifyManifest, pngSize, configSha256 } from './consume-capture.mjs';

function png(w, h, salt = 0) { // minimal valid-header PNG; IHDR dims are what the consumer reads
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b.writeUInt32BE(salt, 29);
  return Buffer.concat([b, deflateSync(Buffer.from([salt]))]);
}
const prov = { buildId: 'b1', sourceSha: 'a'.repeat(40), simulatorRuntime: 'iOS 26', capturedAt: '2026-11-18T00:00:00Z' };
function fixture(mut) {
  const dir = mkdtempSync(join(tmpdir(), 'cap-'));
  const c = loadConfig(); let i = 0;
  for (const t of c.targets) for (const f of c.frames) writeFileSync(join(dir, `${t.id}-${f.n}.png`), png(t.width, t.height, i++));
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
