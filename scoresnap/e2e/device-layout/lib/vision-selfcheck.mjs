// Rubric-drift self-check (RECONCILED-PLAN section B, "Negative fixtures").
//
// Before trusting the vision layer on real PR screenshots, every CI run first sends the
// committed owner negative fixtures (multi-day.png, team-mode.png) through the SAME vision
// step. Each image's review must:
//   (a) validate against the schema,
//   (b) return ≥1 major/critical finding (the gate fails itself if it can't flag a
//       known-broken screen — drift detection), and
//   (c) cover the owner-confirmed REQUIRED rules for that image (the defects run 1 missed:
//       rule 2 footer-clipping and rule 4 player-card HCP/badge imbalance).
// Corrected positive fixtures must come back with verdict "pass" (over-rejection detection).
//
// This module is pure: it takes already-produced reviews keyed by artifactHash plus the
// fixtures' expected.json manifests, and returns a pass/fail with reasons. The reviewer is
// invoked by run-vision.mjs; keeping the judgement pure makes it unit-testable offline.

import { validateReview, majorRules } from './vision-schema.mjs';

// requiredRuleGroups: array of acceptable-rule-id arrays. At least one rule in each group
// must appear as a major/critical finding. Using groups (not brittle exact ids) absorbs the
// vision model's rule-4↔6 alignment-family overlap while still enforcing that the
// owner-confirmed defects — notably rule 2 footer-clipping, its own group — are caught. A flat
// `requiredRules` list is accepted as shorthand (each id becomes a singleton group).
export function requiredGroups(expected) {
  if (Array.isArray(expected.requiredRuleGroups)) return expected.requiredRuleGroups;
  return (expected.requiredRules || []).map((r) => [r]);
}

export function selfCheckNegative(expected, review) {
  const errors = [];
  const v = validateReview(review);
  if (!v.ok) errors.push(`invalid review: ${v.errors.join('; ')}`);
  if (review?.verdict !== 'fail') errors.push(`verdict must be "fail" for negative fixture, got "${review?.verdict}"`);
  const majors = majorRules(review);
  if (majors.length < 1) errors.push('no major/critical finding — rubric drift (gate fails itself)');
  for (const group of requiredGroups(expected)) {
    if (!group.some((rule) => majors.includes(rule))) {
      const label = group.map((r) => expected.ruleLabels?.[r]).filter(Boolean).join(' / ') || 'owner-confirmed defect';
      errors.push(`missing required major finding for rule${group.length > 1 ? 's' : ''} [${group.join(',')}] (${label})`);
    }
  }
  return { ok: errors.length === 0, errors, majorRules: majors };
}

export function selfCheckPositive(expected, review) {
  const errors = [];
  const v = validateReview(review);
  if (!v.ok) errors.push(`invalid review: ${v.errors.join('; ')}`);
  if (review?.verdict !== 'pass') {
    errors.push(`corrected positive fixture must pass, got "${review?.verdict}" with findings for rules [${majorRules(review).join(',')}] — over-rejection`);
  }
  return { ok: errors.length === 0, errors };
}

// Run the whole self-check over a set of fixtures. `reviews` is a map artifactHash -> review.
export function runSelfCheck(fixtures, reviews) {
  const results = [];
  let ok = true;
  for (const fx of fixtures) {
    const review = reviews[fx.artifactHash] || reviews[fx.file];
    if (!review) {
      results.push({ file: fx.file, ok: false, errors: ['no review produced for this fixture'] });
      ok = false;
      continue;
    }
    const r = fx.kind === 'positive'
      ? selfCheckPositive(fx, review)
      : selfCheckNegative(fx, review);
    results.push({ file: fx.file, kind: fx.kind, ...r });
    if (!r.ok) ok = false;
  }
  return { ok, results };
}
