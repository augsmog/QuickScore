// device-layout/v1 — enforcement policy that sits above structural validation:
// the cross-company reviewer rule, waiver validity, the aggregate fail threshold,
// and negative-fixture rubric-drift self-check. Reconciled §B / §E (owner t1547u).

import { validate, RECEIPT_SCHEMA, WAIVER_SCHEMA } from './schema.mjs';

// Cross-company rule (t1374): Claude-built work is reviewed by a non-Anthropic
// model; OpenAI-built work is reviewed by Claude; never Grok. Returns the required
// reviewer company for a given builder.
const BANNED_PROVIDERS = new Set(['grok', 'xai', 'x.ai']);
export function requiredReviewerCompany(builder) {
  if (builder === 'anthropic') return 'openai';
  if (builder === 'openai') return 'anthropic';
  throw new Error(`unknown builder company: ${builder}`);
}
function reviewerCompany(provider) {
  const p = String(provider).toLowerCase();
  if (p.includes('anthropic') || p.includes('claude')) return 'anthropic';
  if (p.includes('openai') || p.includes('codex') || p.includes('gpt')) return 'openai';
  if (BANNED_PROVIDERS.has(p) || p.includes('grok')) return 'grok';
  return p;
}

// Validate that a receipt's reviewer satisfies the cross-company policy for `builder`.
export function checkReviewer(reviewer, builder) {
  const errors = [];
  const company = reviewerCompany(reviewer.provider);
  if (company === 'grok') errors.push('reviewer must never be Grok/xAI');
  else if (company !== requiredReviewerCompany(builder)) {
    errors.push(`${builder}-built work must be reviewed cross-company by ${requiredReviewerCompany(builder)}, got ${company}`);
  }
  if (reviewer.effort !== 'high') errors.push('vision review must run at high effort');
  return errors;
}

// A waiver is valid only when it is structurally complete, attributed to a named
// independent approver with a ticket + evidence, and not expired. Missing-platform
// evidence can never be waived (§B).
export function waiverErrors(waiver, { now } = {}) {
  const reference = now instanceof Date ? now : new Date(now);
  const errors = validate(WAIVER_SCHEMA, waiver).errors.map((e) => `${e.path} ${e.message}`);
  if (errors.length) return errors;
  const expires = Date.parse(waiver.expires);
  if (!Number.isFinite(expires)) errors.push('expires is not a parseable date');
  else if (expires < reference.getTime()) errors.push(`waiver expired ${waiver.expires}`);
  if (/\bmissing\b.*\b(platform|evidence|ios|android)\b|\bno (ios|android) evidence\b/i.test(`${waiver.reason} ${waiver.evidence}`)) {
    errors.push('missing-platform evidence can never be waived');
  }
  return errors;
}

// Aggregate fail threshold (§B): the gate FAILS on any deterministic violation, any
// critical/major (P0/P1) visual finding, a missing checkpoint, an invalid review, or
// an unavailable reviewer. Minor/P2 findings are non-blocking follow-ups. Each receipt
// must carry a reviewer that satisfies the cross-company rule for `builder`.
//
// receipts: array of receipt objects. geometryFindings: deterministic findings keyed
// by `${device}|${flow}|${checkpoint}`. requiredCheckpoints: array of the same keys
// that must each have a receipt. activeWaivers: already-validated waivers suppress a
// matching rule/screen/device finding.
export function evaluateGate({ receipts = [], geometryFindings = {}, requiredCheckpoints = [], builder, activeWaivers = [], now } = {}) {
  const blocking = [];
  const annotations = [];
  const seen = new Set();

  const waived = (finding, device) =>
    activeWaivers.some((w) => w.ruleId === finding.rule && (!w.deviceId || w.deviceId === device));

  for (const receipt of receipts) {
    const key = `${receipt.device}|${receipt.flow}|${receipt.checkpoint}`;
    seen.add(key);
    const structural = validate(RECEIPT_SCHEMA, receipt).errors;
    if (structural.length) { blocking.push({ key, reason: `invalid receipt: ${structural.map((e) => `${e.path} ${e.message}`).join('; ')}` }); continue; }
    const reviewerErr = checkReviewer(receipt.reviewer, builder);
    if (reviewerErr.length) { blocking.push({ key, reason: `invalid review: ${reviewerErr.join('; ')}` }); }
    const allFindings = [...(receipt.findings || []), ...(geometryFindings[key] || [])];
    for (const f of allFindings) {
      if (f.severity === 'minor') { annotations.push({ key, finding: f }); continue; }
      if (waived(f, receipt.device)) { annotations.push({ key, finding: f, waived: true }); continue; }
      blocking.push({ key, reason: `rule ${f.rule} ${f.severity}: ${f.reason}` });
    }
    // a receipt may self-declare fail even without a listed finding (e.g. reviewer unavailable)
    if (receipt.verdict === 'fail' && allFindings.every((f) => f.severity === 'minor')) {
      blocking.push({ key, reason: 'receipt verdict=fail with no blocking finding recorded' });
    }
  }
  for (const key of requiredCheckpoints) {
    if (!seen.has(key)) blocking.push({ key, reason: 'missing checkpoint receipt' });
  }
  return { verdict: blocking.length ? 'fail' : 'pass', blocking, annotations };
}

// Rubric-drift self-check (§B): every committed negative fixture must be sent through
// the vision step first and must return ≥1 major-or-worse finding, else the gate fails
// itself. `fixtureResults`: [{image, findings:[...]}].
export function rubricDriftErrors(fixtureResults) {
  const errors = [];
  for (const { image, findings = [] } of fixtureResults) {
    const major = findings.filter((f) => f.severity === 'major' || f.severity === 'critical');
    if (major.length === 0) errors.push(`rubric drift: negative fixture ${image} produced no major finding`);
  }
  return errors;
}
