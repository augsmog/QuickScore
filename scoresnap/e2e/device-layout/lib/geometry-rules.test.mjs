import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCheckpoint, indexTree, ruleOverlap, ruleClipping, ruleTruncation,
  ruleSpacing, ruleTapTargets, ruleAlignment, ruleStateLegibility, contrastRatio,
} from './geometry-rules.mjs';

// --- Synthetic rule-exercising fixtures. These are hand-built normalized trees (NOT captured
// hierarchy, NOT derived from the owner PNGs) that isolate each rule's logic. -------------

const bb = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });
const ctrl = (id, box, meta = {}, parentId = null) =>
  ({ id, role: 'control', text: id, bbox: box, hitRegion: box, enabled: true, parentId, meta });
const txt = (id, box, text, meta = {}, parentId = null) =>
  ({ id, role: 'text', text, bbox: box, parentId, meta });

test('rule 1: overlapping controls flagged, nested child ignored', () => {
  const tree = indexTree([
    ctrl('a', bb(0, 0, 50, 50)),
    ctrl('b', bb(40, 40, 90, 90)),
  ]);
  assert.equal(ruleOverlap(tree).length, 1);
  // Nested: b inside a → not an ambiguous sibling.
  const nested = indexTree([ctrl('a', bb(0, 0, 100, 100)), ctrl('b', bb(10, 10, 60, 60), {}, 'a')]);
  assert.equal(ruleOverlap(nested).length, 0);
});

test('rule 1: switch overlapping its own label (un-owned text over control)', () => {
  const tree = indexTree([
    ctrl('switch', bb(0, 0, 60, 30), { isSwitch: true }),
    txt('label', bb(55, 5, 200, 28), 'Multi-Day Tournament', { owners: [] }),
  ]);
  const f = ruleOverlap(tree);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 1);
});

test('rule 1: label owned by its control is not an overlap', () => {
  const tree = indexTree([
    ctrl('btn', bb(0, 0, 100, 44)),
    txt('cap', bb(10, 10, 90, 34), 'Continue', { owners: ['btn'] }),
  ]);
  assert.equal(ruleOverlap(tree).length, 0);
});

test('rule 2: control hard-clipped by sticky footer (the run-1 miss)', () => {
  const nodes = [ctrl('card', bb(20, 760, 380, 900), { required: true })];
  const ctx = { footer: bb(0, 820, 402, 874), viewport: { width: 402, height: 874 } };
  const f = ruleClipping(indexTree(nodes), ctx);
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 2);
  assert.match(f[0].reason, /sticky footer/);
});

test('rule 2: control fully above footer is clean', () => {
  const nodes = [ctrl('ok', bb(20, 100, 380, 160), { required: true })];
  const ctx = { footer: bb(0, 820, 402, 874), viewport: { width: 402, height: 874 } };
  assert.equal(ruleClipping(indexTree(nodes), ctx).length, 0);
});

test('rule 2: content outside safe area flagged', () => {
  const nodes = [ctrl('x', bb(20, 2, 380, 60), { required: true })];
  const ctx = { safeArea: { top: 59, bottom: 34, left: 0, right: 0 }, viewport: { width: 402, height: 874 } };
  assert.equal(ruleClipping(indexTree(nodes), ctx).length, 1);
});

test('rule 2: content outside the HORIZONTAL safe area / viewport flagged', () => {
  // bbox extends past the right edge of a 402-wide viewport.
  const nodes = [ctrl('x', bb(380, 100, 440, 160), { required: true })];
  const ctx = { safeArea: { top: 0, bottom: 0, left: 0, right: 0 }, viewport: { width: 402, height: 874 } };
  const f = ruleClipping(indexTree(nodes), ctx);
  assert.equal(f.length, 1);
  assert.match(f[0].reason, /right>/);
});

test('rule 3: essential label truncation at AX1', () => {
  const nodes = [txt('lbl', bb(0, 0, 120, 20), 'Number of…',
    { essential: true, expectedText: 'Number of Rounds', ellipsized: true })];
  assert.equal(ruleTruncation(indexTree(nodes), { fontScale: 1.0 }).length, 1);
  // Above AX1 the truncation is tolerated.
  assert.equal(ruleTruncation(indexTree(nodes), { fontScale: 2.0 }).length, 0);
});

test('rule 4: header too far below modal origin', () => {
  const header = ctrl('hdr', bb(0, 220, 402, 280));
  const f = ruleSpacing(indexTree([header]), { modalOrigin: 146, header });
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 4);
});

test('rule 4: switch to label gap below 8pt', () => {
  const tree = indexTree([
    ctrl('sw', bb(0, 0, 60, 30), { isSwitch: true, labelId: 'lbl' }),
    txt('lbl', bb(62, 5, 200, 28), 'Multi-Day'),
  ]);
  assert.equal(ruleSpacing(tree, {}).length, 1);
});

test('rule 5: undersized tap target and crowded siblings', () => {
  const small = ctrl('chipA', bb(0, 0, 30, 30));
  assert.equal(ruleTapTargets(indexTree([small]), { platform: 'ios' }).length, 1);
  // Two 44pt chips only 3pt apart in a row.
  const tree = indexTree([ctrl('A', bb(0, 0, 44, 44)), ctrl('B', bb(47, 0, 91, 44))]);
  const f = ruleTapTargets(tree, { platform: 'ios' });
  assert.ok(f.some((x) => /edge gap/.test(x.reason)));
});

test('rule 5: android uses 48dp minimum', () => {
  const t = ctrl('t', bb(0, 0, 44, 44));
  assert.equal(ruleTapTargets(indexTree([t]), { platform: 'android' }).length, 1);
  assert.equal(ruleTapTargets(indexTree([t]), { platform: 'ios' }).length, 0);
});

test('rule 6: section child indented beyond grid', () => {
  const nodes = [
    ctrl('rounds', bb(48, 100, 120, 140), { sectionGrid: 0 }),
  ];
  const f = ruleAlignment(indexTree(nodes));
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 6);
});

test('rule 7: dark-pill switch (low thumb/track contrast)', () => {
  const sw = ctrl('team', bb(0, 0, 60, 30),
    { isSwitch: true, thumbColor: [20, 20, 20], trackColor: [30, 45, 35] });
  assert.equal(ruleStateLegibility(indexTree([sw]), {}).length, 1);
  // A white thumb on green track is distinct.
  const ok = ctrl('md', bb(0, 0, 60, 30),
    { isSwitch: true, thumbColor: [255, 255, 255], trackColor: [16, 94, 54] });
  assert.equal(ruleStateLegibility(indexTree([ok]), {}).length, 0);
});

test('contrastRatio: white/black ~= 21', () => {
  assert.ok(Math.abs(contrastRatio([255, 255, 255], [0, 0, 0]) - 21) < 0.5);
});

test('evaluateCheckpoint: clean screen passes, broken screen fails', () => {
  const clean = [ctrl('btn', bb(20, 100, 380, 160), { required: true })];
  assert.equal(evaluateCheckpoint(clean, { platform: 'ios' }).verdict, 'pass');
  const broken = [
    ctrl('a', bb(0, 0, 50, 50)), ctrl('b', bb(40, 40, 90, 90)),
  ];
  assert.equal(evaluateCheckpoint(broken, { platform: 'ios' }).verdict, 'fail');
});
