import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig, SCREEN_ANCHORS } from './validate-capture.mjs';
import { buildCapturePlan, runCapture } from './capture-runner.mjs';

const ACCEPTED = { buildId: 'b1', sourceSha: 'a'.repeat(40), simulatorRuntime: 'iOS 26' };

function stageOverlays(dir) {
  const overlayManifest = {};
  for (const f of loadConfig().frames) {
    const bytes = Buffer.from(`stub-overlay-bytes-${f.id}`);
    writeFileSync(join(dir, `${f.id}.svg`), bytes);
    overlayManifest[f.id] = { path: `${f.id}.svg`, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  return overlayManifest;
}

test('buildCapturePlan consumes the full sequence, in order, bound to real anchors/overlays/accepted release', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aug1279-runner-'));
  try {
    const overlayManifest = stageOverlays(dir);
    const config = loadConfig();
    const plan = buildCapturePlan({ config, overlayManifest, overlaysBaseDir: dir, accepted: ACCEPTED });
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.steps.length, config.targets.length * config.frames.length);
    // Sequence order: target-major, frame-minor, matching capture-config.json's declared order.
    let i = 0;
    for (const target of config.targets) {
      for (const frame of config.frames) {
        const step = plan.steps[i++];
        assert.equal(step.target, target.id);
        assert.equal(step.frame, frame.n);
        assert.equal(step.id, frame.id);
        assert.equal(step.testID, SCREEN_ANCHORS[frame.id].testID);
        assert.equal(step.overlayPath, overlayManifest[frame.id].path);
        assert.equal(step.overlaySha256, overlayManifest[frame.id].sha256);
        assert.equal(step.acceptedBuildId, ACCEPTED.buildId);
        assert.equal(step.acceptedSourceSha, ACCEPTED.sourceSha);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buildCapturePlan refuses to bind frames with no staged overlay entry', () => {
  const config = loadConfig();
  const partialOverlays = stageOverlaysInMemory(config);
  delete partialOverlays[config.frames[0].id];
  const plan = buildCapturePlan({ config, overlayManifest: partialOverlays, overlaysBaseDir: '.', accepted: ACCEPTED });
  assert.ok(plan.errors.some(e => e.includes('no staged overlay entry')));
  assert.ok(!plan.steps.some(s => s.id === config.frames[0].id));
});

test('buildCapturePlan refuses to bind with no accepted-release record', () => {
  const config = loadConfig();
  const plan = buildCapturePlan({ config, overlayManifest: stageOverlaysInMemory(config), overlaysBaseDir: '.', accepted: null });
  assert.ok(plan.errors.some(e => e.includes('no accepted-release record staged')));
  assert.equal(plan.steps.length, 0);
});

test('buildCapturePlan refuses to bind an unknown frame id', () => {
  const config = loadConfig();
  config.frames = [{ ...config.frames[0], id: 'unrelated-screen-1' }];
  const plan = buildCapturePlan({ config, anchors: SCREEN_ANCHORS, overlayManifest: {}, overlaysBaseDir: '.', accepted: ACCEPTED });
  assert.ok(plan.errors.some(e => e.includes('has no screen anchor')));
});

test('runCapture drives a stub provider through every planned step and produces manifest entries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aug1279-runner-'));
  try {
    const overlayManifest = stageOverlays(dir);
    const config = loadConfig();
    const calls = [];
    const provider = {
      async capture(step) {
        calls.push(step);
        const bytes = Buffer.from(`capture-${step.target}-${step.frame}`);
        return { file: `${step.target}-${step.frame}.png`, width: step.width, height: step.height, sha256: createHash('sha256').update(bytes).digest('hex') };
      },
    };
    const manifest = await runCapture(provider, { config, overlayManifest, overlaysBaseDir: dir, accepted: ACCEPTED });
    assert.equal(calls.length, config.targets.length * config.frames.length);
    assert.equal(manifest.entries.length, calls.length);
    assert.equal(manifest.provenance.buildId, ACCEPTED.buildId);
    assert.equal(manifest.provenance.sourceSha, ACCEPTED.sourceSha);
    assert.equal(new Set(manifest.entries.map(e => e.sha256)).size, manifest.entries.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runCapture refuses to run (never calls the provider) when the plan has unresolved bindings', async () => {
  const config = loadConfig();
  let called = false;
  const provider = { async capture() { called = true; return { file: 'x', width: 1, height: 1, sha256: 'a'.repeat(64) }; } };
  await assert.rejects(() => runCapture(provider, { config, overlayManifest: {}, overlaysBaseDir: '.', accepted: ACCEPTED }));
  assert.equal(called, false);
});

test('buildCapturePlan refuses an accepted-release record that is present but incomplete', () => {
  const config = loadConfig();
  const plan = buildCapturePlan({ config, overlayManifest: stageOverlaysInMemory(config), overlaysBaseDir: '.', accepted: {} });
  assert.ok(plan.errors.some(e => e.includes('missing buildId')));
  assert.equal(plan.steps.length, 0);
});

test('runCapture refuses to run (never calls the provider) when two frame ids are swapped with captions left in place', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aug1279-runner-'));
  try {
    const overlayManifest = stageOverlays(dir);
    const config = loadConfig();
    // Swap two ids between frame slots while leaving every frame's `caption` where it is -- each
    // id still resolves to a real anchor and a real staged overlay individually, so only the
    // config-level canonical-caption-per-id check (validateConfig) can see the mismatch.
    [config.frames[0].id, config.frames[7].id] = [config.frames[7].id, config.frames[0].id];
    let calls = 0;
    const provider = { async capture() { calls++; return { file: 'x', width: 1, height: 1, sha256: 'a'.repeat(64) }; } };
    await assert.rejects(() => runCapture(provider, { config, overlayManifest, overlaysBaseDir: dir, accepted: ACCEPTED }));
    assert.equal(calls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runCapture rejects caller-supplied provenance that conflicts with the accepted release', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aug1279-runner-'));
  try {
    const overlayManifest = stageOverlays(dir);
    const config = loadConfig();
    let calls = 0;
    const provider = { async capture() { calls++; return { file: 'x', width: 1, height: 1, sha256: 'a'.repeat(64) }; } };
    await assert.rejects(
      () => runCapture(provider, { config, overlayManifest, overlaysBaseDir: dir, accepted: ACCEPTED, provenance: { buildId: 'invented-build-not-accepted', sourceSha: 'f'.repeat(40) } }),
      /conflicts with the accepted release/,
    );
    assert.equal(calls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function stageOverlaysInMemory(config) {
  const m = {};
  for (const f of config.frames) m[f.id] = { path: `${f.id}.svg`, sha256: 'a'.repeat(64) };
  return m;
}
