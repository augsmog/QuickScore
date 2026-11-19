import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateReview, hasMajor, majorRules } from './vision-schema.mjs';
import { selfCheckNegative, selfCheckPositive, runSelfCheck, requiredGroups } from './vision-selfcheck.mjs';
import { validateWaivers, applyWaivers } from './waivers.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const NEG = resolve(__dir, '../fixtures/negative/fixtures.json');

const review = (over = {}) => ({
  sourceSha: '587e88f3', buildHash: '1.0.1(32)', artifactHash: 'multi-day.png',
  device: 'iPhone 16 Pro', flow: 'New Contest', checkpoint: 'Multi-day on',
  reviewer: { provider: 'openai', model: 'gpt-6-astra', effort: 'high' },
  findings: [{ rule: 1, severity: 'major', bbox: [0, 0, 1, 1], reason: 'x' }],
  verdict: 'fail', ...over,
});

test('validateReview: well-formed review passes', () => {
  assert.equal(validateReview(review()).ok, true);
});

test('validateReview: missing fields and inconsistent verdict fail', () => {
  assert.equal(validateReview(review({ sourceSha: '' })).ok, false);
  assert.equal(validateReview(review({ verdict: 'pass' })).ok, false); // major but pass
  assert.equal(validateReview(review({ reviewer: null })).ok, false);
  assert.equal(validateReview(review({ findings: [{ rule: 9, severity: 'major', bbox: [0, 0, 1, 1], reason: 'x' }] })).ok, false);
});

test('majorRules / hasMajor', () => {
  const r = review({ findings: [
    { rule: 2, severity: 'major', bbox: [0, 0, 1, 1], reason: 'a' },
    { rule: 6, severity: 'minor', bbox: [0, 0, 1, 1], reason: 'b' },
  ] });
  assert.equal(hasMajor(r), true);
  assert.deepEqual(majorRules(r), [2]);
});

test('selfCheckNegative requires the owner-confirmed rules (incl. rule 2 + 4)', () => {
  const expected = { requiredRules: [1, 2, 4, 7], ruleLabels: {} };
  const full = review({ findings: [
    { rule: 1, severity: 'major', bbox: [0, 0, 1, 1], reason: 'overlap' },
    { rule: 2, severity: 'major', bbox: [0, 0, 1, 1], reason: 'footer clip' },
    { rule: 4, severity: 'major', bbox: [0, 0, 1, 1], reason: 'dead space' },
    { rule: 7, severity: 'major', bbox: [0, 0, 1, 1], reason: 'dark pill' },
  ] });
  assert.equal(selfCheckNegative(expected, full).ok, true);
  // The run-1 shape (missing rule 2) now fails the self-check — drift caught.
  const missedClip = review({ findings: [
    { rule: 1, severity: 'major', bbox: [0, 0, 1, 1], reason: 'overlap' },
    { rule: 4, severity: 'major', bbox: [0, 0, 1, 1], reason: 'dead space' },
    { rule: 7, severity: 'major', bbox: [0, 0, 1, 1], reason: 'dark pill' },
  ] });
  const r = selfCheckNegative(expected, missedClip);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /\[2\]/.test(e)));
});

test('selfCheckNegative fails when a known-bad image is passed (rubric drift)', () => {
  const expected = { requiredRules: [1], ruleLabels: {} };
  assert.equal(selfCheckNegative(expected, review({ findings: [], verdict: 'pass' })).ok, false);
});

test('requiredRuleGroups: alignment family [4,6] satisfied by EITHER rule', () => {
  const expected = { requiredRuleGroups: [[2], [4, 6]], ruleLabels: {} };
  const viaRule6 = review({ findings: [
    { rule: 2, severity: 'major', bbox: [0, 0, 1, 1], reason: 'clip' },
    { rule: 6, severity: 'major', bbox: [0, 0, 1, 1], reason: 'indent' },
  ] });
  assert.equal(selfCheckNegative(expected, viaRule6).ok, true);
  // Neither 4 nor 6 present → the alignment-family group is unmet.
  const neither = review({ findings: [{ rule: 2, severity: 'major', bbox: [0, 0, 1, 1], reason: 'clip' }] });
  assert.equal(selfCheckNegative(expected, neither).ok, false);
  assert.deepEqual(requiredGroups({ requiredRules: [1, 2] }), [[1], [2]]);
});

test('selfCheckPositive flags over-rejection', () => {
  assert.equal(selfCheckPositive({}, review({ findings: [], verdict: 'pass' })).ok, true);
  assert.equal(selfCheckPositive({}, review({ verdict: 'fail' })).ok, false);
});

test('runSelfCheck over the committed negative fixtures manifest', () => {
  const manifest = JSON.parse(readFileSync(NEG, 'utf8'));
  const fixtures = manifest.fixtures;
  // Simulate a correct reviewer: emit one major finding satisfying each required group.
  const reviews = {};
  for (const fx of fixtures) {
    reviews[fx.artifactHash] = review({
      artifactHash: fx.artifactHash, checkpoint: fx.checkpoint,
      findings: requiredGroups(fx).map((g) => ({ rule: g[0], severity: 'major', bbox: [0, 0, 1, 1], reason: `r${g[0]}` })),
    });
  }
  assert.equal(runSelfCheck(fixtures, reviews).ok, true);
  // Drop one review → self-check fails (missing review).
  delete reviews[fixtures[0].artifactHash];
  assert.equal(runSelfCheck(fixtures, reviews).ok, false);
});

// --- waivers ---------------------------------------------------------------------------
const NOW = new Date('2026-11-19T00:00:00Z');

test('validateWaivers: valid future waiver ok; expired/unattributed fail', () => {
  const good = { waivers: [{ ruleId: 6, screen: 'New Contest', deviceId: 'android-compact', reason: 'known minor indent', evidence: 'AUG-1367', approvedBy: 'Astra', ticket: 'AUG-1380', created: '2026-11-19', expires: '2026-11-26' }] };
  assert.equal(validateWaivers(good, NOW).ok, true);
  const expired = structuredClone(good); expired.waivers[0].expires = '2026-11-01';
  assert.equal(validateWaivers(expired, NOW).ok, false);
  const selfApproved = structuredClone(good); selfApproved.waivers[0].approvedBy = 'Tater';
  assert.equal(validateWaivers(selfApproved, NOW).ok, false);
  const missingPlatform = structuredClone(good);
  missingPlatform.waivers[0].reason = 'missing platform evidence for ios';
  assert.equal(validateWaivers(missingPlatform, NOW).ok, false);
  const tooLong = structuredClone(good); tooLong.waivers[0].expires = '2026-12-20';
  assert.equal(validateWaivers(tooLong, NOW).ok, false);
});

test('applyWaivers suppresses only the matching finding', () => {
  const doc = { waivers: [{ ruleId: 6, screen: 'New Contest', deviceId: 'android-compact', reason: 'minor indent', evidence: 'e', approvedBy: 'Astra', ticket: 'AUG-1380', created: '2026-11-19', expires: '2026-11-26' }] };
  const findings = [
    { rule: 6, severity: 'minor', bbox: [0, 0, 1, 1], reason: 'indent' },
    { rule: 2, severity: 'major', bbox: [0, 0, 1, 1], reason: 'clip' },
  ];
  const r = applyWaivers(findings, doc, { screen: 'New Contest', deviceId: 'android-compact' }, NOW);
  assert.equal(r.kept.length, 1);
  assert.equal(r.kept[0].rule, 2);
  assert.equal(r.waived.length, 1);
});

test('waiver with missing created cannot bypass the 14-day cap', () => {
  const farFuture = { waivers: [{ ruleId: 2, screen: 'New Contest', deviceId: 'android-compact', reason: 'x', evidence: 'e', approvedBy: 'Astra', ticket: 'AUG-1380', expires: '2099-12-31' }] };
  assert.equal(validateWaivers(farFuture, NOW).ok, false);
  // A ≤14-day waiver with no created date is still allowed (measured from now).
  const shortNoCreated = { waivers: [{ ruleId: 2, screen: 'New Contest', deviceId: 'android-compact', reason: 'x', evidence: 'e', approvedBy: 'Astra', ticket: 'AUG-1380', expires: '2026-11-26' }] };
  assert.equal(validateWaivers(shortNoCreated, NOW).ok, true);
});

test('committed waivers.json validates (empty is fine)', () => {
  const doc = JSON.parse(readFileSync(resolve(__dir, '../waivers.json'), 'utf8'));
  assert.equal(validateWaivers(doc, NOW).ok, true);
});
