// Vision layer (AUG-1373 section B). The gate never calls a model: an independent
// reviewer (cross-company — Claude-built work is reviewed by a non-Anthropic
// provider, never Grok) writes device-layout/vision-review/v1 records, and this
// module decides whether they block.
//
// Blocks on: an invalid record, a missing review for a required checkpoint, a
// reviewer from the builder's provider or a banned provider, any critical/major
// finding, a self-reported "fail", or a negative calibration fixture that came back
// without at least one major/critical finding (rubric drift: the reviewer stopped
// seeing known defects, so its passes cannot be trusted). Minor findings are
// returned as non-blocking follow-ups.

export const VISION_SCHEMA = 'device-layout/vision-review/v1';
const SEVERITIES = ['critical', 'major', 'minor'];
const BLOCKING = new Set(['critical', 'major']);
const key = r => `${r.device}::${r.flow}::${r.checkpoint}`;

export function validateVisionReview(r) {
  const errors = [];
  if (r?.schema !== VISION_SCHEMA) errors.push(`schema must be "${VISION_SCHEMA}"`);
  if (!/^[0-9a-f]{40}$/.test(r?.sourceSha ?? '')) errors.push('sourceSha must be a 40-hex commit');
  if (typeof r?.buildHash !== 'string' || !r.buildHash) errors.push('buildHash required');
  if (!/^sha256:[0-9a-f]{64}$/.test(r?.artifactHash ?? '')) errors.push('artifactHash must be sha256:<64 hex> of the screenshot');
  for (const k of ['device', 'flow', 'checkpoint']) if (typeof r?.[k] !== 'string' || !r[k]) errors.push(`${k} required`);
  for (const k of ['provider', 'model']) if (typeof r?.reviewer?.[k] !== 'string' || !r.reviewer[k]) errors.push(`reviewer.${k} required`);
  if (r?.reviewer?.effort !== 'high') errors.push('reviewer.effort must be "high"');
  if (r?.fixture !== undefined && !['negative', 'positive'].includes(r.fixture)) errors.push('fixture must be negative or positive');
  if (!Array.isArray(r?.findings)) errors.push('findings must be an array');
  else r.findings.forEach((f, i) => {
    if (!(Number.isInteger(f?.rule) && f.rule >= 1 && f.rule <= 8)) errors.push(`findings[${i}].rule must be 1..8`);
    if (!SEVERITIES.includes(f?.severity)) errors.push(`findings[${i}].severity must be ${SEVERITIES.join('|')}`);
    if (!(Array.isArray(f?.bbox) && f.bbox.length === 4 && f.bbox.every(Number.isFinite))) errors.push(`findings[${i}].bbox must be 4 numbers`);
    if (typeof f?.reason !== 'string' || !f.reason) errors.push(`findings[${i}].reason required`);
  });
  if (!['pass', 'fail'].includes(r?.verdict)) errors.push('verdict must be pass or fail');
  return errors;
}

// reviews: vision-review/v1 records. required: [{device, flow, checkpoint}] that must
// be reviewed. builderProvider: who built the change (reviewer must differ).
export function evaluateVision({reviews, required = [], builderProvider, bannedProviders = ['xai', 'grok'], sourceSha = null}) {
  if (!builderProvider) throw new Error('builderProvider required: the gate must know who built the change');
  const blocking = [], followUps = [], invalid = [], drift = [];
  const seen = new Set();
  reviews.forEach((r, i) => {
    const errors = validateVisionReview(r);
    const provider = String(r?.reviewer?.provider ?? '').toLowerCase();
    if (provider && provider === String(builderProvider).toLowerCase()) errors.push(`reviewer provider "${provider}" built the change (no self-review)`);
    if (bannedProviders.includes(provider)) errors.push(`reviewer provider "${provider}" is not allowed`);
    if (sourceSha && r?.sourceSha !== sourceSha && r?.fixture === undefined) errors.push(`review is for ${r?.sourceSha}, not the gated head ${sourceSha}`);
    if (errors.length) { invalid.push({index: i, checkpoint: r ? key(r) : null, errors}); return; }
    const major = r.findings.filter(f => BLOCKING.has(f.severity));
    if (r.fixture === 'negative') {
      if (major.length === 0) drift.push({checkpoint: key(r), reason: 'negative fixture returned no major/critical finding'});
      return;
    }
    if (r.fixture === 'positive') {
      if (major.length || r.verdict === 'fail') drift.push({checkpoint: key(r), reason: 'positive fixture was rejected (over-rejection)'});
      return;
    }
    seen.add(key(r));
    for (const f of major) blocking.push({checkpoint: key(r), ...f});
    if (r.verdict === 'fail' && major.length === 0) blocking.push({checkpoint: key(r), rule: null, severity: 'major', reason: 'reviewer verdict fail'});
    for (const f of r.findings.filter(f => f.severity === 'minor')) followUps.push({checkpoint: key(r), ...f});
  });
  const missing = required.filter(c => !seen.has(key(c))).map(key);
  const negatives = reviews.filter(r => r?.fixture === 'negative').length;
  if (negatives === 0) drift.push({checkpoint: null, reason: 'no negative fixture reviewed this run (rubric-drift check skipped)'});
  const verdict = blocking.length || invalid.length || missing.length || drift.length ? 'FAIL' : 'PASS';
  return {schema: 'device-layout/vision-result/v1', verdict, blocking, followUps, invalid, missing, drift};
}
