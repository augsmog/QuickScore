import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig, SCREEN_ANCHORS, FRAMES_SAME_WITHOUT_ML_KIT, FRAMES_NEEDING_ML_KIT, validateBuildForStoreCapture } from './validate-capture.mjs';
import { readFileSync } from 'node:fs';
import { buildCapturePlan, runCapture } from './capture-runner.mjs';

const ACCEPTED = { buildId: 'b1', sourceSha: 'a'.repeat(40), simulatorRuntime: 'iOS 26', buildVariables: { EXPO_PUBLIC_PRO_ENABLED: 'false' } };
const ENV = {};

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
    const plan = buildCapturePlan({ config, overlayManifest, overlaysBaseDir: dir, accepted: ACCEPTED, env: ENV });
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
  const plan = buildCapturePlan({ config, overlayManifest: partialOverlays, overlaysBaseDir: '.', accepted: ACCEPTED, env: ENV });
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
  const plan = buildCapturePlan({ config, anchors: SCREEN_ANCHORS, overlayManifest: {}, overlaysBaseDir: '.', accepted: ACCEPTED, env: ENV });
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
        return { file: `${step.target}-${step.frame}.png`, width: step.width, height: step.height, sha256: createHash('sha256').update(bytes).digest('hex'), visibleText: [step.caption, step.testID] };
      },
    };
    const manifest = await runCapture(provider, { config, overlayManifest, overlaysBaseDir: dir, accepted: ACCEPTED, env: ENV });
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
  await assert.rejects(() => runCapture(provider, { config, overlayManifest: {}, overlaysBaseDir: '.', accepted: ACCEPTED, env: ENV }));
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
    await assert.rejects(() => runCapture(provider, { config, overlayManifest, overlaysBaseDir: dir, accepted: ACCEPTED, env: ENV }));
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

// AUG-399: no store screenshot from a build without ML Kit.
const goodProvider = (calls = []) => ({
  async capture(step) {
    calls.push(step.id);
    return { file: `${step.target}-${step.frame}.png`, width: step.width, height: step.height, sha256: createHash('sha256').update(`c-${step.frame}`).digest('hex'), visibleText: [step.caption, step.testID] };
  },
});
const withOverlays = async (run) => {
  const dir = mkdtempSync(join(tmpdir(), 'aug399-mlkit-'));
  try { return await run({ config: loadConfig(), overlayManifest: stageOverlays(dir), overlaysBaseDir: dir }); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('a build made with EXPO_PUBLIC_SIMULATOR_NO_MLKIT is refused before any frame is captured', async () => {
  await withOverlays(async (base) => {
    for (const value of ['1', '0', '']) {
      const calls = [];
      const accepted = { ...ACCEPTED, buildVariables: { ...ACCEPTED.buildVariables, EXPO_PUBLIC_SIMULATOR_NO_MLKIT: value } };
      await assert.rejects(() => runCapture(goodProvider(calls), { ...base, accepted, env: ENV }), /may not come from a build without ML Kit \(frame 8 would show "Scanning is unavailable in simulator builds"\)/);
      assert.equal(calls.length, 0);
    }
  });
});

test('an accepted build that does not list its build variables is refused', async () => {
  await withOverlays(async (base) => {
    const calls = [];
    const { buildVariables, ...silent } = ACCEPTED;
    await assert.rejects(() => runCapture(goodProvider(calls), { ...base, accepted: silent, env: ENV }), /must list buildVariables/);
    await assert.rejects(() => runCapture(goodProvider(calls), { ...base, accepted: { ...ACCEPTED, buildVariables: [] }, env: ENV }), /must list buildVariables/);
    assert.equal(calls.length, 0);
  });
});

test('a capture started from a shell that has the variable set is refused', async () => {
  await withOverlays(async (base) => {
    const calls = [];
    await assert.rejects(() => runCapture(goodProvider(calls), { ...base, accepted: ACCEPTED, env: { EXPO_PUBLIC_SIMULATOR_NO_MLKIT: '1' } }), /is set in this environment/);
    assert.equal(calls.length, 0);
    assert.deepEqual(validateBuildForStoreCapture(ACCEPTED, {}), []);
  });
});

test('the run stops at the frame whose screen shows the simulator-only sentence, and at a frame that does not report its screen', async () => {
  await withOverlays(async (base) => {
    // The build record looked clean, but the screen says otherwise: by sentence, and by testID.
    for (const leak of ['Scanning is unavailable in simulator builds. Enter the scorecard as text instead.', 'scan-unavailable-simulator']) {
      const calls = [];
      const provider = goodProvider(calls);
      const real = provider.capture;
      provider.capture = async (step) => { const r = await real(step); if (step.id === 'scan-card') r.visibleText.push(leak); return r; };
      await assert.rejects(() => runCapture(provider, { ...base, accepted: ACCEPTED, env: ENV }), /frame 8 \("scan-card"\): the screen shows ".*"; this build has no ML Kit/);
      assert.equal(calls.length, 8);
    }
    const mute = { async capture(step) { return { file: 'x.png', width: step.width, height: step.height, sha256: 'a'.repeat(64) }; } };
    await assert.rejects(() => runCapture(mute, { ...base, accepted: ACCEPTED, env: ENV }), /frame 1 \("setup-round"\): the capture must report visibleText/);
    const manifest = await runCapture(goodProvider(), { ...base, accepted: ACCEPTED, env: ENV });
    assert.equal(manifest.entries.length, 8);
  });
});

test('which frames differ without ML Kit: only scan-card, and the app source still says so', () => {
  const ids = loadConfig().frames.map(f => f.id);
  assert.deepEqual([...FRAMES_SAME_WITHOUT_ML_KIT, ...FRAMES_NEEDING_ML_KIT].sort(), [...ids].sort());
  assert.deepEqual(FRAMES_NEEDING_ML_KIT, ['scan-card']);
  const src = (id) => readFileSync(new URL(SCREEN_ANCHORS[id].file, import.meta.url), 'utf8');
  // The scan screen is the one that branches on the switch and shows the sentence's testID.
  assert.match(src('scan-card'), /NATIVE_OCR_DISABLED/);
  assert.match(src('scan-card'), /testID="scan-unavailable-simulator"/);
  assert.match(readFileSync(new URL('../../src/config/native-ocr.ts', import.meta.url), 'utf8'), /Scanning is unavailable in simulator builds/);
  // None of the other seven screens reads the switch.
  for (const id of FRAMES_SAME_WITHOUT_ML_KIT) assert.doesNotMatch(src(id), /NATIVE_OCR_DISABLED|SIMULATOR_NO_MLKIT/, id);
});
