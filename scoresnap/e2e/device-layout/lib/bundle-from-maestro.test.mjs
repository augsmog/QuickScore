import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBundle, loadCaptureManifest, resourceMetaFor, densityFor, profileById, contextForCheckpoint,
} from '../scripts/bundle-from-maestro.mjs';
import { runBundle } from '../run-geometry.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(__dir, '../config/device-layout.config.json'), 'utf8'));

// A raw Maestro hierarchy node.
const node = (bounds, attrs = {}, children = []) => ({ attributes: { bounds, ...attrs }, children });

// Write a capture dir with the given per-checkpoint raw hierarchy roots.
function writeCapture(manifest, hierByFile) {
  const dir = mkdtempSync(join(tmpdir(), 'dl-cap-'));
  for (const [file, root] of Object.entries(hierByFile)) {
    writeFileSync(join(dir, file), JSON.stringify(root));
  }
  writeFileSync(join(dir, 'capture-manifest.json'), JSON.stringify(manifest));
  return dir;
}

test('densityFor: iOS=1, Android=dpi/160', () => {
  assert.equal(densityFor(profileById(config, 'iphone-16-pro')), 1);
  assert.equal(densityFor(profileById(config, 'android-compact')), 3); // 480/160
});

test('resourceMetaFor maps real SnapScore testIDs (exact + prefix)', () => {
  assert.equal(resourceMetaFor('tournament-toggle').meta.isSwitch, true);
  assert.equal(resourceMetaFor('team-mode').meta.isSwitch, true);
  assert.equal(resourceMetaFor('rounds-3').meta.rowGroup, 'rounds');
  assert.equal(resourceMetaFor('player-handicap-Ava').meta.control, 'handicap');
  assert.equal(resourceMetaFor('game-mode-skins').meta.tappable, true);
  assert.equal(resourceMetaFor('totally-unknown-id'), null);
});

test('buildBundle: iOS profile, normalized nodes, viewport + safeArea context', () => {
  const root = node('[0,0][402,874]', {}, [
    node('[16,120][386,160]', { 'resource-id': 'home-new-contest', text: 'New Contest' }),
    node('[300,200][360,240]', { 'resource-id': 'tournament-toggle', checked: 'true' }),
  ]);
  const manifest = {
    flow: 'new-contest', profile: 'iphone-16-pro', platform: 'ios', sourceSha: 'abc123',
    checkpoints: [{ checkpoint: 'empty wizard', screen: 'New Contest', hierarchy: 'c0.json' }],
  };
  const dir = writeCapture(manifest, { 'c0.json': root });
  const bundle = buildBundle(loadCaptureManifest(dir), { platform: 'ios', profileId: 'iphone-16-pro', config });
  assert.equal(bundle.checkpoints.length, 1);
  const cp = bundle.checkpoints[0];
  assert.equal(cp.deviceId, 'iphone-16-pro');
  assert.equal(cp.platform, 'ios');
  assert.deepEqual(cp.context.viewport, { width: 402, height: 874 });
  assert.deepEqual(cp.context.safeArea, { top: 59, bottom: 34, left: 0, right: 0 });
  // iOS density 1 → bounds unchanged; switch recognised as a control via SNAPSCORE_META.
  const sw = cp.nodes.find((n) => n.id === 'tournament-toggle');
  assert.equal(sw.role, 'control');
  assert.equal(sw.meta.isSwitch, true);
  assert.deepEqual(sw.bbox, { left: 300, top: 200, right: 360, bottom: 240 });
});

test('buildBundle: Android px bounds scaled by density', () => {
  const root = node('[0,0][1080,2400]', {}, [
    node('[48,300][1032,420]', { 'resource-id': 'home-new-contest', text: 'New Contest' }),
  ]);
  const manifest = {
    flow: 'new-contest', profile: 'android-compact', platform: 'android',
    checkpoints: [{ checkpoint: 'empty wizard', hierarchy: 'c0.json' }],
  };
  const dir = writeCapture(manifest, { 'c0.json': root });
  const bundle = buildBundle(loadCaptureManifest(dir), { platform: 'android', profileId: 'android-compact', config });
  const btn = bundle.checkpoints[0].nodes.find((n) => n.id === 'home-new-contest');
  // 48px / 3 = 16dp, 1032/3 = 344dp.
  assert.deepEqual(btn.bbox, { left: 16, top: 100, right: 344, bottom: 140 });
});

test('buildBundle derives sticky footer from a footer node (rule 2 activates)', () => {
  const nodes = [
    { id: 'new-contest-footer', role: 'container', text: '', bbox: { left: 0, top: 820, right: 402, bottom: 874 }, meta: { footer: true } },
  ];
  const ctx = contextForCheckpoint(profileById(config, 'iphone-16-pro'), { checkpoint: 'x' }, nodes);
  assert.deepEqual(ctx.footer, { left: 0, top: 820, right: 402, bottom: 874 });
});

test('footer synthesized from the CTA anchor; a player row behind it fails rule 2', () => {
  const root = node('[0,0][402,874]', {}, [
    // last player row straddles the sticky bottom bar (CTA top at 792) → half behind it
    node('[16,768][386,812]', { 'resource-id': 'player-handicap-Dee', text: '0' }),
    node('[16,792][386,836]', { 'resource-id': 'contest-continue', text: 'Continue' }),
  ]);
  const manifest = {
    flow: 'new-contest', profile: 'iphone-16-pro', platform: 'ios',
    sourceSha: 'a'.repeat(40), buildHash: 'app-sha256:1',
    checkpoints: [{ checkpoint: 'last player above footer', hierarchy: 'c0.json' }],
  };
  const dir = writeCapture(manifest, { 'c0.json': root });
  const bundle = buildBundle(loadCaptureManifest(dir), { profileId: 'iphone-16-pro', config });
  assert.deepEqual(bundle.checkpoints[0].context.footer, { left: 0, top: 792, right: 402, bottom: 874 });
  const r = runBundle(bundle, { waivers: [] });
  assert.equal(r.ok, false); // player-handicap row is clipped behind the footer

  // Same screen but the row clears the bar (ends at 782, bar top at 792) → clean.
  const ok = node('[0,0][402,874]', {}, [
    node('[16,738][386,782]', { 'resource-id': 'player-handicap-Dee', text: '0' }),
    node('[16,792][386,836]', { 'resource-id': 'contest-continue', text: 'Continue' }),
  ]);
  const dir2 = writeCapture(manifest, { 'c0.json': ok });
  const bundle2 = buildBundle(loadCaptureManifest(dir2), { profileId: 'iphone-16-pro', config });
  assert.equal(runBundle(bundle2, { waivers: [] }).ok, true);
});

test('bundle feeds run-geometry: clean passes, clipped fails', () => {
  const clean = node('[0,0][402,874]', {}, [
    node('[16,120][386,170]', { 'resource-id': 'home-new-contest', text: 'New Contest' }),
  ]);
  const manifest = {
    flow: 'new-contest', profile: 'iphone-16-pro', platform: 'ios',
    sourceSha: 'a'.repeat(40), buildHash: 'app-sha256:1',
    checkpoints: [{ checkpoint: 'empty wizard', hierarchy: 'c0.json' }],
  };
  const dir = writeCapture(manifest, { 'c0.json': clean });
  const bundle = buildBundle(loadCaptureManifest(dir), { profileId: 'iphone-16-pro', config });
  assert.equal(runBundle(bundle, { waivers: [] }).ok, true);

  // A control whose bottom runs past the home indicator → rule 2 safe-area violation.
  const clipped = node('[0,0][402,874]', {}, [
    node('[16,850][386,872]', { 'resource-id': 'home-new-contest', text: 'Start' }),
  ]);
  const dir2 = writeCapture(manifest, { 'c0.json': clipped });
  const bad = buildBundle(loadCaptureManifest(dir2), { profileId: 'iphone-16-pro', config });
  const r = runBundle(bad, { waivers: [] });
  assert.equal(r.ok, false);
  assert.equal(r.keptCount >= 1, true);
});

test('buildBundle rejects platform/profile mismatch and unknown profile', () => {
  const manifest = { flow: 'x', profile: 'iphone-16-pro', platform: 'ios', checkpoints: [] };
  const dir = writeCapture(manifest, {});
  assert.throws(() => buildBundle(loadCaptureManifest(dir), { platform: 'android', profileId: 'iphone-16-pro', config }), /is ios/);
  assert.throws(() => profileById(config, 'nope'), /unknown profile/);
});

test('loadCaptureManifest errors when a hierarchy file is missing', () => {
  const manifest = {
    flow: 'x', profile: 'iphone-16-pro', platform: 'ios',
    checkpoints: [{ checkpoint: 'c', hierarchy: 'does-not-exist.json' }],
  };
  const dir = writeCapture(manifest, {});
  assert.throws(() => buildBundle(loadCaptureManifest(dir), { profileId: 'iphone-16-pro', config }), /missing hierarchy/);
});
