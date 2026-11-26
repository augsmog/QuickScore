// Fuzz-style regression for Codex AUG-1400: a malformed measured numeric geometry leaf must never
// let a violating control slip through the gate. For a COMPLETE, source/config/build-bound
// 17-checkpoint per-PR Android bundle whose every control is a genuine rule-5 violation (46×46 dp <
// 48 dp Android min), replacing any numeric leaf the evaluator reads with a malformed value must
// either be REJECTED by validateBundle or still produce a FAIL verdict — never GEOMETRY GATE: PASS.
// The named escape (hitRegion = {}) is covered both at the API and CLI level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { runBundle, validateBundle, expectedFlows, configSha256 } from '../run-geometry.mjs';
import { rectOf, finiteRect, evaluateCheckpoint } from './geometry-rules.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const RUN_GEOMETRY = resolve(__dir, '../run-geometry.mjs');
const CFG_PATH = resolve(__dir, '../config/device-layout.config.json');
const CFG_TEXT = readFileSync(CFG_PATH, 'utf8');
const CONFIG = JSON.parse(CFG_TEXT);
const CFG_SHA = configSha256(CFG_TEXT);
const SHA = 'a'.repeat(40);
const EMPTY_WAIVERS = { waivers: [] };
const FLOWS = expectedFlows(CONFIG, 'per-pr');
const EXPECT = { config: CONFIG, configSha256: CFG_SHA, flows: FLOWS };
// The complete per-PR bundle covers every checkpoint of every per-PR flow. Derive the count from
// the config (do NOT hardcode it) so the fuzz contract stays bound to whatever the real per-PR
// checkpoint list is — each checkpoint must still reject its malformed geometry / FAIL the gate.
const N = FLOWS.reduce((s, f) => s + f.checkpoints.length, 0);

// A 46×46 Android control: a real rule-5 violation (< 48 dp) in every checkpoint, so the complete
// bundle is a genuine FAIL. Each fuzz mutation must keep it from silently turning into a PASS.
const VIOLATING_BOX = { left: 20, top: 100, right: 66, bottom: 146 };
const baseNode = () => ({
  id: 'ctl', role: 'control', text: 'ctl', bbox: { ...VIOLATING_BOX }, hitRegion: { ...VIOLATING_BOX },
  enabled: true, parentId: null, meta: { required: true, tappable: true },
});
const baseCtx = () => ({ viewport: { width: 360, height: 800 }, safeArea: { top: 20, bottom: 0, left: 0, right: 0 } });

// Build a fresh, structurally complete 17-checkpoint per-PR Android bundle. `mutate(node, ctx)` may
// edit the (deep-cloned) node/context of every checkpoint before it is attached.
function completeBundle(mutate = () => {}) {
  const checkpoints = [];
  for (const f of FLOWS) {
    for (const c of f.checkpoints) {
      const node = baseNode();
      const ctx = baseCtx();
      mutate(node, ctx);
      checkpoints.push({ flow: f.id, checkpoint: c, screen: f.id, deviceId: 'android-compact',
        platform: 'android', context: ctx, nodes: [node] });
    }
  }
  return { sourceSha: SHA, buildHash: 'apk-sha256:1', profile: 'android-compact', platform: 'android',
    configSha256: CFG_SHA, checkpoints };
}

const result = (bundle) => {
  const errors = validateBundle(bundle, EXPECT);
  return { rejected: errors.length > 0, errors, run: errors.length ? null : runBundle(bundle, EMPTY_WAIVERS, new Date(), EXPECT) };
};
// Reject OR FAIL — the gate must never report PASS while a violating control is present.
const neverPass = (bundle, label) => {
  const r = result(bundle);
  const passed = !r.rejected && r.run && r.run.ok === true;
  assert.equal(passed, false, `${label}: gate reported PASS with a violating control present`);
};

test('baseline: the complete per-PR bundle is structurally valid but FAILS (one rule-5 per checkpoint)', () => {
  const b = completeBundle();
  assert.equal(b.checkpoints.length, N);
  assert.deepEqual(validateBundle(b, EXPECT), []);
  const r = runBundle(b, EMPTY_WAIVERS, new Date(), EXPECT);
  assert.equal(r.ok, false);
  assert.equal(r.keptCount, N);
});

// Malformed *rect* values (a non-null hitRegion / a bbox) must be rejected outright.
const BAD_RECTS = [
  { label: '{}', v: {} },
  { label: 'partial', v: { left: 46 } },
  { label: 'NaN edges', v: { left: NaN, top: NaN, right: NaN, bottom: NaN } },
  { label: 'Infinity edges', v: { left: 0, top: 0, right: Infinity, bottom: Infinity } },
  { label: 'negative area', v: { left: 66, top: 146, right: 20, bottom: 100 } },
  { label: 'zero area', v: { left: 20, top: 100, right: 20, bottom: 100 } },
  { label: 'string', v: 'oops' },
  { label: 'number', v: 5 },
];

test('named defect: malformed hitRegion={} / partial / non-finite is rejected (API)', () => {
  for (const { label, v } of BAD_RECTS) {
    const b = completeBundle((node) => { node.hitRegion = v; });
    const errs = validateBundle(b, EXPECT);
    assert.ok(errs.length >= N, `hitRegion ${label}: expected rejection of all ${N} checkpoints`);
    assert.match(errs.join('; '), /malformed hitRegion/, `hitRegion ${label}`);
    neverPass(b, `hitRegion ${label}`);
  }
  // null / undefined hitRegion are LEGAL (fall back to bbox) — but the 46×46 bbox still FAILS rule 5.
  for (const v of [null, undefined]) {
    const b = completeBundle((node) => { node.hitRegion = v; });
    assert.deepEqual(validateBundle(b, EXPECT), []);
    assert.equal(runBundle(b, EMPTY_WAIVERS, new Date(), EXPECT).ok, false);
    neverPass(b, `hitRegion ${v}`);
  }
});

// Every measured numeric geometry leaf the evaluator reads, with the canonical malformed value that
// MUST be rejected and the error substring that must name it.
const LEAF_REJECTS = [
  { name: 'bbox', bad: {}, re: /finite measured bbox/, apply: (n) => { n.bbox = {}; } },
  { name: 'viewport.width', bad: NaN, re: /context\.viewport/, apply: (n, c) => { c.viewport.width = NaN; } },
  { name: 'viewport.height', bad: Infinity, re: /context\.viewport/, apply: (n, c) => { c.viewport.height = Infinity; } },
  { name: 'viewport.width<=0', bad: 0, re: /context\.viewport/, apply: (n, c) => { c.viewport.width = 0; } },
  { name: 'safeArea.top', bad: NaN, re: /context\.safeArea/, apply: (n, c) => { c.safeArea.top = NaN; } },
  { name: 'safeArea.bottom<0', bad: -1, re: /context\.safeArea/, apply: (n, c) => { c.safeArea.bottom = -1; } },
  { name: 'footer', bad: {}, re: /context\.footer/, apply: (n, c) => { c.footer = {}; } },
  { name: 'header.bbox', bad: {}, re: /context\.header\.bbox/, apply: (n, c) => { c.header = { id: 'h', bbox: {} }; } },
  { name: 'modalOrigin', bad: NaN, re: /context\.modalOrigin/, apply: (n, c) => { c.modalOrigin = NaN; } },
  { name: 'fontScale', bad: NaN, re: /context\.fontScale/, apply: (n, c) => { c.fontScale = NaN; } },
  { name: 'fontScale<=0', bad: -1, re: /context\.fontScale/, apply: (n, c) => { c.fontScale = -1; } },
  { name: 'minSwitchContrast', bad: Infinity, re: /context\.minSwitchContrast/, apply: (n, c) => { c.minSwitchContrast = Infinity; } },
  { name: 'meta.sectionGrid', bad: NaN, re: /meta\.sectionGrid/, apply: (n) => { n.meta.sectionGrid = NaN; } },
  { name: 'meta.thumbColor', bad: [NaN, 0, 0], re: /meta\.thumbColor/, apply: (n) => { n.meta.isSwitch = true; n.meta.thumbColor = [NaN, 0, 0]; n.meta.trackColor = [255, 255, 255]; } },
  { name: 'meta.trackColor', bad: 'x', re: /meta\.trackColor/, apply: (n) => { n.meta.isSwitch = true; n.meta.thumbColor = [0, 0, 0]; n.meta.trackColor = 'x'; } },
];

test('every measured numeric leaf: a malformed value is rejected and named', () => {
  for (const leaf of LEAF_REJECTS) {
    const b = completeBundle((n, c) => leaf.apply(n, c));
    const errs = validateBundle(b, EXPECT);
    assert.ok(errs.length > 0, `${leaf.name}: expected rejection`);
    assert.match(errs.join('; '), leaf.re, `${leaf.name}: error must name the leaf`);
    neverPass(b, leaf.name);
  }
});

// Broad never-PASS sweep: every leaf × every malformed value — the gate must never report PASS.
const BAD_VALUES = [NaN, Infinity, -Infinity, null, undefined, 'x', -5, {}, { left: 1 }];
const LEAVES = [
  ['hitRegion', (n, c, v) => { n.hitRegion = v; }],
  ['bbox', (n, c, v) => { n.bbox = v; }],
  ['viewport.width', (n, c, v) => { c.viewport.width = v; }],
  ['viewport.height', (n, c, v) => { c.viewport.height = v; }],
  ['safeArea.top', (n, c, v) => { c.safeArea.top = v; }],
  ['safeArea.bottom', (n, c, v) => { c.safeArea.bottom = v; }],
  ['safeArea.left', (n, c, v) => { c.safeArea.left = v; }],
  ['safeArea.right', (n, c, v) => { c.safeArea.right = v; }],
  ['footer', (n, c, v) => { c.footer = v; }],
  ['header.bbox', (n, c, v) => { c.header = { id: 'h', bbox: v }; }],
  ['modalOrigin', (n, c, v) => { c.modalOrigin = v; }],
  ['fontScale', (n, c, v) => { c.fontScale = v; }],
  ['minSwitchContrast', (n, c, v) => { c.minSwitchContrast = v; }],
  ['meta.sectionGrid', (n, c, v) => { n.meta.sectionGrid = v; }],
  ['meta.thumbColor', (n, c, v) => { n.meta.isSwitch = true; n.meta.thumbColor = v; n.meta.trackColor = [255, 255, 255]; }],
];

test('fuzz sweep: no malformed numeric leaf ever yields GEOMETRY GATE: PASS', () => {
  for (const [name, apply] of LEAVES) {
    for (const v of BAD_VALUES) {
      const b = completeBundle((n, c) => apply(n, c, v));
      neverPass(b, `${name} = ${String(v)}`);
    }
  }
});

test('rectOf / evaluateCheckpoint fail closed on a malformed hitRegion (no NaN pass)', () => {
  assert.equal(finiteRect({ left: 0, top: 0, right: 10, bottom: 10 }), true);
  for (const r of [{}, { left: 1 }, { left: NaN, top: 0, right: 10, bottom: 10 }, { left: 10, top: 10, right: 0, bottom: 0 }, 'x']) {
    assert.equal(finiteRect(r), false);
  }
  // A present-but-malformed hitRegion throws rather than yielding NaN dimensions.
  assert.throws(() => rectOf({ id: 'z', bbox: { left: 0, top: 0, right: 46, bottom: 46 }, hitRegion: {} }), /malformed effective rect/);
  // null hitRegion falls back to the (valid) bbox.
  assert.deepEqual(rectOf({ id: 'z', bbox: { left: 0, top: 0, right: 46, bottom: 46 }, hitRegion: null }),
    { left: 0, top: 0, right: 46, bottom: 46 });
  assert.throws(() => evaluateCheckpoint(
    [{ id: 'c', role: 'control', text: 'c', bbox: { left: 0, top: 0, right: 46, bottom: 46 }, hitRegion: {}, meta: {} }],
    { platform: 'android' }), /fails closed/);
});

test('CLI regression: hitRegion={} on a complete bundle exits non-zero (not PASS)', () => {
  const b = completeBundle((node) => { node.hitRegion = {}; });
  const dir = mkdtempSync(join(tmpdir(), 'dl-fuzz-'));
  const file = join(dir, 'bundle.json');
  writeFileSync(file, JSON.stringify(b));
  const r = spawnSync('node', [RUN_GEOMETRY, file, '--profile', 'android-compact'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /GEOMETRY GATE: PASS/);
  assert.match(r.stderr, /malformed hitRegion/);
});
