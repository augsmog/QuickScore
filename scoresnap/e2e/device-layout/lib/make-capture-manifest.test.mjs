import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleManifest } from '../scripts/make-capture-manifest.mjs';

function capture(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'dl-mk-'));
  for (const e of entries) {
    writeFileSync(join(dir, `${e.base}.ctx.json`), JSON.stringify(e.ctx));
    if (e.hier !== false) writeFileSync(join(dir, `${e.base}.hierarchy.json`), JSON.stringify({ attributes: {}, children: [] }));
    if (e.png) writeFileSync(join(dir, `${e.base}.png`), 'x');
  }
  return dir;
}

test('assembleManifest sorts by order prefix and links hierarchy + screenshot', () => {
  const dir = capture([
    { base: '02-new-contest-multi-day-on', ctx: { flow: 'new-contest', checkpoint: 'multi-day on', screen: 'New Contest' }, png: true },
    { base: '00-new-contest-empty-wizard', ctx: { flow: 'new-contest', checkpoint: 'empty wizard', screen: 'New Contest' }, png: true },
    { base: '01-new-contest-name-entry', ctx: { flow: 'new-contest', checkpoint: 'name entry' } },
  ]);
  const m = assembleManifest(dir, { profile: 'iphone-16-pro', platform: 'ios', sourceSha: 'deadbeef' });
  assert.equal(m.checkpoints.length, 3);
  assert.deepEqual(m.checkpoints.map((c) => c.checkpoint), ['empty wizard', 'name entry', 'multi-day on']);
  assert.equal(m.checkpoints[0].hierarchy, '00-new-contest-empty-wizard.hierarchy.json');
  assert.equal(m.checkpoints[0].screenshot, '00-new-contest-empty-wizard.png');
  assert.equal(m.checkpoints[1].screenshot, null); // no png written
  assert.equal(m.checkpoints[1].screen, 'name entry'); // screen defaults to checkpoint
  assert.equal(m.profile, 'iphone-16-pro');
  assert.equal(m.sourceSha, 'deadbeef');
});

test('assembleManifest carries fontScale and throws on an orphan ctx', () => {
  const ok = capture([{ base: '00-paywall-tier-td', ctx: { flow: 'paywall', checkpoint: 'tier td', fontScale: 1.3 } }]);
  const m = assembleManifest(ok, { fontScale: 1.3 });
  assert.equal(m.checkpoints[0].fontScale, 1.3);
  assert.equal(m.fontScale, 1.3);

  const bad = capture([{ base: '00-x', ctx: { flow: 'x', checkpoint: 'x' }, hier: false }]);
  assert.throws(() => assembleManifest(bad), /no sibling hierarchy/);
});
