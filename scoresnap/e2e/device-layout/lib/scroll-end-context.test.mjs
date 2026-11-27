// AUG-1601: which checkpoints are "scrolled to the end" comes from the config, per flow, and reaches
// rule 2 as `context.scrollEnd`. Nothing in a capture can set it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isScrollEndCheckpoint, buildBundle } from '../scripts/bundle-from-maestro.mjs';

const config = JSON.parse(readFileSync(new URL('../config/device-layout.config.json', import.meta.url), 'utf8'));

test('the wizard has exactly one scroll-to-end checkpoint, and it is the last-player one', () => {
  const wizard = config.flows.find((f) => f.id === 'new-contest');
  assert.deepEqual(wizard.scrollEnd, ['last player above footer']);
  for (const cp of wizard.checkpoints) assert.equal(isScrollEndCheckpoint(config, 'new-contest', cp), cp === 'last player above footer', cp);
  for (const flow of config.flows.filter((f) => f.id !== 'new-contest')) for (const cp of flow.checkpoints) assert.equal(isScrollEndCheckpoint(config, flow.id, cp), false);
  assert.equal(isScrollEndCheckpoint(config, 'no-such-flow', 'x'), false);
});

test('a scrollEnd list that names a checkpoint the flow does not have is refused', () => {
  const bad = { flows: [{ id: 'f', checkpoints: ['a'], scrollEnd: ['b'] }] };
  assert.throws(() => isScrollEndCheckpoint(bad, 'f', 'a'), /scrollEnd must list checkpoints of that flow/);
  assert.throws(() => isScrollEndCheckpoint({ flows: [{ id: 'f', checkpoints: ['a'], scrollEnd: 'a' }] }, 'f', 'a'), /scrollEnd must list/);
});

test('the bundle carries it, and a capture cannot claim or deny it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dl-scroll-end-'));
  const tree = { attributes: { bounds: '[0,0][402,874]' }, children: [] };
  writeFileSync(join(dir, 'h.json'), JSON.stringify(tree));
  const manifest = { flow: 'new-contest', profile: 'iphone-16-pro', platform: 'ios', sourceSha: 'a'.repeat(40), checkpoints: [
    // The capture's own context tries to deny it at the end checkpoint and claim it at another.
    { flow: 'new-contest', checkpoint: 'last player above footer', hierarchy: 'h.json', context: { scrollEnd: false } },
    { flow: 'new-contest', checkpoint: 'four players', hierarchy: 'h.json', context: { scrollEnd: true }, scrollEnd: true },
  ] };
  const bundle = buildBundle({ manifest, dir }, { platform: 'ios', profileId: 'iphone-16-pro', config, sourceSha: 'a'.repeat(40) });
  const byName = Object.fromEntries(bundle.checkpoints.map((c) => [c.checkpoint, c.context.scrollEnd]));
  assert.deepEqual(byName, { 'last player above footer': true, 'four players': false });
});
