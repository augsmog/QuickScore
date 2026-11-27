// G4 (AUG-1601): the top safe-area check judged the unmasked frame. A row scrolled up out of a
// scroll area that itself starts below the top inset is not drawn above that inset: Maestro just
// reports where it would be. Run 46008363328 reported "Ava" and "Remove Ava" as "top<59" at the two
// scrolled wizard checkpoints for this. The check now uses the top of what is drawn. A control
// that really is drawn above the inset still fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMaestroHierarchy as normalize } from './normalize-maestro.mjs';
import { indexTree, ruleClipping } from './geometry-rules.mjs';

const raw = (box, children = [], extra = {}) => ({ attributes: { bounds: `[${box[0]},${box[1]}][${box[2]},${box[3]}]`, ...extra }, children });
const ctx = { platform: 'ios', viewport: { width: 402, height: 874 }, safeArea: { top: 59, bottom: 34, left: 0, right: 0 } };
const topFindings = (tree) => ruleClipping(indexTree(normalize(tree, { resourceMeta: { 'contest-scroll': { meta: { scrollClip: true } }, row: { role: 'control', meta: { tappable: true } } } })), ctx)
  .filter((f) => /extends outside the safe area/.test(f.reason) && /top</.test(f.reason));
const inScroll = (scrollBox, rowBox) => raw([0, 0, 402, 874], [raw(scrollBox, [raw(rowBox, [], { 'resource-id': 'row', clickable: true })], { 'resource-id': 'contest-scroll', scrollable: true })]);

test('a row scrolled up out of a scroll area that starts below the inset is not "above the safe area"', () => {
  assert.equal(topFindings(inScroll([0, 120, 402, 700], [20, 20, 380, 70])).length, 0, 'wholly scrolled off the top');
  assert.equal(topFindings(inScroll([0, 120, 402, 700], [20, 40, 380, 150])).length, 0, 'partly scrolled off the top');
});

test('a row really drawn above the inset still fails', () => {
  // Not inside any scroll area.
  assert.equal(topFindings(raw([0, 0, 402, 874], [raw([20, 20, 380, 70], [], { 'resource-id': 'row', clickable: true })])).length, 1);
  // Inside a scroll area that itself runs up under the status bar: the row IS drawn there.
  assert.equal(topFindings(inScroll([0, 0, 402, 700], [20, 20, 380, 70])).length, 1);
  assert.equal(topFindings(inScroll([0, 30, 402, 700], [20, 10, 380, 80])).length, 1, 'drawn from 30, above the 59 inset');
});

test('the bottom, left and right checks are untouched by this', () => {
  const all = (tree) => ruleClipping(indexTree(normalize(tree, { resourceMeta: { row: { role: 'control', meta: { tappable: true } } } })), ctx).filter((f) => /extends outside the safe area/.test(f.reason));
  assert.ok(all(raw([0, 0, 402, 874], [raw([20, 820, 380, 870], [], { 'resource-id': 'row', clickable: true })])).some((f) => /bottom>/.test(f.reason)));
  assert.ok(all(raw([0, 0, 402, 874], [raw([-10, 200, 380, 260], [], { 'resource-id': 'row', clickable: true })])).some((f) => /left</.test(f.reason)));
});
