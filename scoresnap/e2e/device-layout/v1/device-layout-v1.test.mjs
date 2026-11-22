import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  VERSION, validate, validateElementTree, CONFIG_SCHEMA,
  TOLERANCES, intersectRect, rectArea, overlapsBeyond, checkOverlap, checkTapTargets, checkReachability,
  requiredReviewerCompany, checkReviewer, waiverErrors, evaluateGate, rubricDriftErrors,
  rnMaestroToTree, parseBounds, godotControlToTree, normalizerFor,
} from './index.mjs';

// ---- fixtures -------------------------------------------------------------
const sha = 'a1b2c3d';
function validConfig(over = {}) {
  return {
    schema: VERSION,
    product: 'snapscore',
    adapter: 'rn-maestro',
    provenance: { sourceSha: sha, buildHash: sha, configHash: sha },
    devices: [{ id: 'se3', platform: 'ios', profile: 'iphone-se-3', logical: { width: 375, height: 667 }, density: 2, os: 18.5, fontScale: 1, runner: 'mac-mini', cadence: 'pr' }],
    flows: [{ id: 'new-contest', states: ['empty', 'named'], checkpoints: ['entry', 'scroll-end'] }],
    rules: [{ id: 1, name: 'overlap', layer: 'both', contract: { tolerancePt: 1 } }],
    reviewerPolicy: { builder: 'anthropic', provider: 'openai', model: 'gpt-6-astra', effort: 'high' },
    waivers: [],
    fixtures: { negative: [{ image: 'multi-day.png', sha256: 'deadbeef', expectDefect: 'switch/label collision' }], positive: [] },
    retention: { passDays: 7, failDays: 14 },
    ...over,
  };
}
function receipt(over = {}) {
  return {
    sourceSha: sha, buildHash: sha, artifactHash: sha,
    device: 'se3', flow: 'new-contest', checkpoint: 'entry',
    reviewer: { provider: 'openai', model: 'gpt-6-astra', effort: 'high' },
    findings: [], verdict: 'pass', ...over,
  };
}

// ---- schema / validator ---------------------------------------------------
test('VERSION is device-layout/v1', () => assert.equal(VERSION, 'device-layout/v1'));

test('a complete config validates', () => {
  const r = validate(CONFIG_SCHEMA, validConfig());
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);
});

test('committed example.config.json validates against the schema', () => {
  const path = fileURLToPath(new URL('./example.config.json', import.meta.url));
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  const r = validate(CONFIG_SCHEMA, cfg);
  assert.deepEqual(r.errors, []);
});

test('config rejects wrong schema id, missing provenance, empty devices, bad adapter', () => {
  assert.ok(!validate(CONFIG_SCHEMA, validConfig({ schema: 'aos-visual-gate/v1' })).valid);
  const noProv = validConfig(); delete noProv.provenance;
  assert.ok(!validate(CONFIG_SCHEMA, noProv).valid);
  assert.ok(!validate(CONFIG_SCHEMA, validConfig({ devices: [] })).valid);
  assert.ok(!validate(CONFIG_SCHEMA, validConfig({ adapter: 'detox' })).valid);
});

test('integer vs number and enum/pattern are enforced', () => {
  assert.ok(!validate(CONFIG_SCHEMA, validConfig({ retention: { passDays: 7.5, failDays: 14 } })).valid, 'passDays must be integer');
  assert.ok(!validate(CONFIG_SCHEMA, validConfig({ provenance: { sourceSha: 'ZZZ', buildHash: sha, configHash: sha } })).valid, 'sha pattern');
});

test('element tree validates recursively and flags a missing bbox in a child', () => {
  const good = { id: 'root', role: 'container', bbox: { x: 0, y: 0, width: 10, height: 10 }, children: [{ id: 'c', role: 'text', text: 'hi', bbox: { x: 0, y: 0, width: 4, height: 4 } }] };
  assert.ok(validateElementTree(good).valid);
  const bad = { id: 'root', role: 'container', bbox: { x: 0, y: 0, width: 10, height: 10 }, children: [{ id: 'c', role: 'text' }] };
  const r = validateElementTree(bad);
  assert.ok(!r.valid);
  assert.ok(r.errors.some((e) => e.path.includes('children[0]') && /bbox/.test(e.path)));
});

// ---- geometry -------------------------------------------------------------
test('rect helpers match the metrics.mjs engine semantics', () => {
  assert.deepEqual(intersectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 2, y: 3, width: 4, height: 20 }), { x: 2, y: 3, width: 4, height: 7 });
  assert.equal(rectArea(intersectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 0, width: 10, height: 10 })), 50);
  assert.equal(intersectRect({ x: 0, y: 0, width: 10, height: 10 }, null), null);
});

test('overlapsBeyond ignores a sub-tolerance shared edge but catches a real overlap', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(overlapsBeyond(a, { x: 9.5, y: 0, width: 10, height: 10 }, TOLERANCES.OVERLAP_PT), false, '0.5pt shared edge within tolerance');
  assert.equal(overlapsBeyond(a, { x: 5, y: 5, width: 10, height: 10 }, TOLERANCES.OVERLAP_PT), true);
});

test('checkOverlap flags overlapping independent controls but not a label inside its control', () => {
  const tree = {
    id: 'root', role: 'container', bbox: { x: 0, y: 0, width: 200, height: 200 },
    children: [
      { id: 'btnA', role: 'button', bbox: { x: 0, y: 0, width: 60, height: 44 }, hitRegion: { x: 0, y: 0, width: 60, height: 44 }, children: [
        { id: 'labelA', role: 'text', text: 'Go', bbox: { x: 8, y: 12, width: 20, height: 20 } }, // no hitRegion -> non-interactive
      ] },
      { id: 'btnB', role: 'button', bbox: { x: 40, y: 0, width: 60, height: 44 }, hitRegion: { x: 40, y: 0, width: 60, height: 44 } },
    ],
  };
  const f = checkOverlap(tree);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 1);
  assert.match(f[0].reason, /btnA \/ btnB/);
});

test('checkTapTargets flags undersized iOS target and a sub-8pt gap, honoring clip', () => {
  const tree = {
    id: 'root', role: 'container', bbox: { x: 0, y: 0, width: 300, height: 300 },
    children: [
      { id: 'tiny', role: 'button', bbox: { x: 0, y: 0, width: 30, height: 30 }, hitRegion: { x: 0, y: 0, width: 30, height: 30 } },
      { id: 'ok', role: 'button', bbox: { x: 0, y: 100, width: 60, height: 60 }, hitRegion: { x: 0, y: 100, width: 60, height: 60 } },
      { id: 'clipped', role: 'button', bbox: { x: 0, y: 200, width: 60, height: 60 }, hitRegion: { x: 0, y: 200, width: 60, height: 60 }, clip: { x: 0, y: 200, width: 60, height: 20 } },
    ],
  };
  const f = checkTapTargets(tree, 'ios');
  assert.ok(f.some((x) => x.rule === 5 && /tiny/.test(x.reason)), 'undersized flagged');
  assert.ok(f.some((x) => /clipped/.test(x.reason)), 'clip reduces effective size below 44');
  assert.throws(() => checkTapTargets(tree, 'web'), /unknown platform/);
});

test('android minimum is 48dp', () => {
  const tree = { id: 'r', role: 'container', bbox: { x: 0, y: 0, width: 100, height: 100 }, children: [{ id: 'b', role: 'button', bbox: { x: 0, y: 0, width: 46, height: 46 }, hitRegion: { x: 0, y: 0, width: 46, height: 46 } }] };
  assert.ok(checkTapTargets(tree, 'android').some((f) => /b below 48/.test(f.reason)));
  assert.equal(checkTapTargets(tree, 'ios').filter((f) => f.rule === 5 && /below/.test(f.reason)).length, 0, '46 passes 44 on iOS');
});

test('checkReachability flags a required control clipped by the footer', () => {
  const tree = { id: 'r', role: 'container', bbox: { x: 0, y: 0, width: 300, height: 600 }, children: [
    { id: 'lastPlayer', role: 'row', bbox: { x: 0, y: 560, width: 300, height: 60 }, hitRegion: { x: 0, y: 560, width: 300, height: 60 }, clip: { x: 0, y: 0, width: 300, height: 580 } },
  ] };
  const f = checkReachability(tree, { requiredIds: ['lastPlayer'] });
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 2);
});

// ---- policy ---------------------------------------------------------------
test('cross-company reviewer rule', () => {
  assert.equal(requiredReviewerCompany('anthropic'), 'openai');
  assert.equal(requiredReviewerCompany('openai'), 'anthropic');
  assert.throws(() => requiredReviewerCompany('xai'), /unknown builder/);
  assert.deepEqual(checkReviewer({ provider: 'openai', model: 'gpt-6-astra', effort: 'high' }, 'anthropic'), []);
  assert.ok(checkReviewer({ provider: 'anthropic', model: 'opus', effort: 'high' }, 'anthropic').length, 'same-company blocked');
  assert.ok(checkReviewer({ provider: 'grok', model: 'grok-4', effort: 'high' }, 'anthropic').some((e) => /Grok/.test(e)));
  assert.ok(checkReviewer({ provider: 'openai', model: 'gpt', effort: 'low' }, 'anthropic').some((e) => /high effort/.test(e)));
});

test('waiver validity: complete + unexpired passes; expired, missing-platform, unattributed fail', () => {
  const now = new Date('2026-11-19T00:00:00Z');
  const good = { ruleId: 4, screen: 'new-contest', deviceId: 'se3', state: null, reason: 'cosmetic indent', evidence: 'https://x/ev', approvedBy: 'Astra/high', ticket: 'AUG-1373', expires: '2026-11-26' };
  assert.deepEqual(waiverErrors(good, { now }), []);
  assert.ok(waiverErrors({ ...good, expires: '2026-11-18' }, { now }).some((e) => /expired/.test(e)));
  assert.ok(waiverErrors({ ...good, reason: 'missing android evidence' }, { now }).some((e) => /never be waived/.test(e)));
  const noApprover = { ...good }; delete noApprover.approvedBy;
  assert.ok(waiverErrors(noApprover, { now }).length);
  assert.ok(waiverErrors({ ...good, ticket: 'nope' }, { now }).length, 'ticket must be AUG-n');
});

test('evaluateGate passes a clean full set and fails on major finding / missing checkpoint / bad reviewer', () => {
  const required = ['se3|new-contest|entry', 'se3|new-contest|scroll-end'];
  const pass = evaluateGate({ builder: 'anthropic', requiredCheckpoints: required, receipts: [receipt(), receipt({ checkpoint: 'scroll-end' })] });
  assert.equal(pass.verdict, 'pass', JSON.stringify(pass.blocking));

  const major = evaluateGate({ builder: 'anthropic', requiredCheckpoints: ['se3|new-contest|entry'], receipts: [receipt({ findings: [{ rule: 7, severity: 'major', bbox: null, reason: 'black-pill switch' }], verdict: 'fail' })] });
  assert.equal(major.verdict, 'fail');

  const missing = evaluateGate({ builder: 'anthropic', requiredCheckpoints: required, receipts: [receipt()] });
  assert.ok(missing.blocking.some((b) => /missing checkpoint/.test(b.reason)));

  const badReviewer = evaluateGate({ builder: 'anthropic', requiredCheckpoints: ['se3|new-contest|entry'], receipts: [receipt({ reviewer: { provider: 'anthropic', model: 'opus', effort: 'high' } })] });
  assert.ok(badReviewer.blocking.some((b) => /invalid review/.test(b.reason)));
});

test('evaluateGate: minor findings are non-blocking annotations; a valid waiver suppresses a major', () => {
  const minorOnly = evaluateGate({ builder: 'anthropic', requiredCheckpoints: ['se3|new-contest|entry'], receipts: [receipt({ findings: [{ rule: 4, severity: 'minor', bbox: null, reason: 'tiny dead space' }] })] });
  assert.equal(minorOnly.verdict, 'pass');
  assert.equal(minorOnly.annotations.length, 1);

  const waived = evaluateGate({
    builder: 'anthropic', requiredCheckpoints: ['se3|new-contest|entry'],
    receipts: [receipt({ findings: [{ rule: 4, severity: 'major', bbox: null, reason: 'indent' }] })],
    activeWaivers: [{ ruleId: 4, deviceId: 'se3' }],
  });
  assert.equal(waived.verdict, 'pass');
  assert.ok(waived.annotations.some((a) => a.waived));
});

test('evaluateGate folds in deterministic geometry findings by checkpoint key', () => {
  const r = evaluateGate({
    builder: 'anthropic', requiredCheckpoints: ['se3|new-contest|entry'],
    receipts: [receipt()],
    geometryFindings: { 'se3|new-contest|entry': [{ rule: 1, severity: 'critical', bbox: null, reason: 'overlap' }] },
  });
  assert.equal(r.verdict, 'fail');
});

test('rubricDriftErrors fails when a negative fixture yields no major finding', () => {
  assert.deepEqual(rubricDriftErrors([{ image: 'multi-day.png', findings: [{ rule: 1, severity: 'major' }] }]), []);
  assert.ok(rubricDriftErrors([{ image: 'team-mode.png', findings: [{ rule: 7, severity: 'minor' }] }]).length);
  assert.ok(rubricDriftErrors([{ image: 'team-mode.png', findings: [] }]).length);
});

// ---- adapters -------------------------------------------------------------
test('parseBounds parses Maestro bounds and scales by density', () => {
  assert.deepEqual(parseBounds('[0,0][100,44]'), { x: 0, y: 0, width: 100, height: 44 });
  assert.deepEqual(parseBounds('[0,0][96,96]', 2), { x: 0, y: 0, width: 48, height: 48 });
  assert.equal(parseBounds('garbage'), null);
});

test('rnMaestroToTree produces a schema-valid normalized tree with interactive hit regions', () => {
  const hierarchy = {
    attributes: { bounds: '[0,0][375,667]', className: 'ScrollView', scrollable: true },
    children: [
      { attributes: { 'resource-id': 'team-switch', className: 'RNSwitch', bounds: '[300,20][344,44]' } },
      { attributes: { className: 'RCTText', text: 'Team Mode', bounds: '[20,24][120,40]' } },
    ],
  };
  const tree = rnMaestroToTree(hierarchy);
  assert.ok(validateElementTree(tree).valid, JSON.stringify(validateElementTree(tree).errors));
  const sw = tree.children.find((c) => c.id.includes('team-switch'));
  assert.equal(sw.role, 'switch');
  assert.ok(sw.hitRegion, 'switch is interactive');
  const label = tree.children.find((c) => c.text === 'Team Mode');
  assert.equal(label.hitRegion, null, 'static text has no hit region');
  assert.ok(tree.scrollState.scrollable);
});

test('godotControlToTree accumulates relative rects to absolute and marks interactivity', () => {
  const snapshot = {
    name: 'Root', class: 'Control', visible: true, rect: { position: { x: 0, y: 0 }, size: { x: 1280, y: 720 } },
    children: [
      { name: 'HUD', class: 'Control', rect: { position: { x: 100, y: 50 }, size: { x: 400, y: 200 } }, children: [
        { name: 'StartBtn', class: 'Button', text: 'Start', mouse_filter: 0, rect: { position: { x: 10, y: 10 }, size: { x: 120, y: 48 } } },
        { name: 'IgnoredLabel', class: 'Label', text: 'Wave 1', mouse_filter: 2, rect: { position: { x: 10, y: 70 }, size: { x: 100, y: 24 } } },
        { name: 'Hidden', class: 'Button', visible: false, rect: { position: { x: 0, y: 0 }, size: { x: 50, y: 50 } } },
      ] },
    ],
  };
  const tree = godotControlToTree(snapshot);
  assert.ok(validateElementTree(tree).valid, JSON.stringify(validateElementTree(tree).errors));
  const btn = tree.children[0].children.find((c) => c.id.includes('StartBtn'));
  assert.deepEqual(btn.bbox, { x: 110, y: 60, width: 120, height: 48 }, 'absolute = 100+10, 50+10');
  assert.ok(btn.hitRegion);
  const label = tree.children[0].children.find((c) => c.id.includes('IgnoredLabel'));
  assert.equal(label.hitRegion, null, 'mouse_filter=IGNORE is non-interactive');
  assert.ok(!JSON.stringify(tree).includes('Hidden'), 'invisible nodes are dropped');
});

test('normalizerFor resolves each registered adapter and rejects unknown', async () => {
  assert.equal(typeof (await normalizerFor('rn-maestro')), 'function');
  assert.equal(typeof (await normalizerFor('godot-control')), 'function');
  await assert.rejects(normalizerFor('detox'), /no device-layout\/v1 adapter/);
});
