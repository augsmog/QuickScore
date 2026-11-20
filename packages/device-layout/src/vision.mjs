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
// Required checkpoints for a config: every device x flow x checkpoint.
export function requiredCheckpoints(config) {
  return config.devices.flatMap(d => config.flows.flatMap(f => f.checkpoints.map(checkpoint => ({device: d.id, flow: f.id, checkpoint}))));
}

// policy: the config's reviewerPolicy ({builder, reviewer:{provider, model, effort}, banned}).
// fixtures: the config's fixtures ({negative:[{image, artifactHash}], positive}); every
// declared negative must come back reviewed (matched by artifactHash) with a major finding.
// buildHash: the gated run's build hash. Every candidate review must carry it, or it
// is evidence from another build (stale), the same failure class as a stale sourceSha.
// artifacts: optional {`device::flow::checkpoint` -> sha256} of the screenshots actually
// captured this run. A candidate review's artifactHash must equal the captured one, so a
// reviewer cannot pass by scoring an arbitrary/foreign screenshot.
export function evaluateVision({reviews, required = [], builderProvider, bannedProviders = ['xai', 'grok'], sourceSha = null, buildHash = null, policy = null, fixtures = null, artifacts = null}) {
  if (policy) { builderProvider = policy.builder; bannedProviders = policy.banned ?? bannedProviders; }
  if (!builderProvider) throw new Error('builderProvider required: the gate must know who built the change');
  const requiredProvider = policy?.reviewer?.provider?.toLowerCase() ?? null;
  const requiredModel = policy?.reviewer?.model ?? null;
  const blocking = [], followUps = [], invalid = [], drift = [];
  const seen = new Set();
  reviews.forEach((r, i) => {
    const errors = validateVisionReview(r);
    const provider = String(r?.reviewer?.provider ?? '').toLowerCase();
    if (provider && provider === String(builderProvider).toLowerCase()) errors.push(`reviewer provider "${provider}" built the change (no self-review)`);
    if (bannedProviders.includes(provider)) errors.push(`reviewer provider "${provider}" is not allowed`);
    else if (requiredProvider && provider && provider !== requiredProvider) errors.push(`reviewer provider "${provider}" is not the policy reviewer "${requiredProvider}"`);
    // Policy binds the exact reviewer model, not just the provider: a cheaper/weaker
    // model from the right company is still off-policy (AUG-1384).
    if (requiredModel && r?.reviewer?.model !== requiredModel) errors.push(`reviewer model "${r?.reviewer?.model ?? ''}" is not the policy reviewer model "${requiredModel}"`);
    if (sourceSha && r?.sourceSha !== sourceSha && r?.fixture === undefined) errors.push(`review is for ${r?.sourceSha}, not the gated head ${sourceSha}`);
    // Bind build + captured artifact for candidate (non-fixture) reviews. Calibration
    // fixtures reference committed baseline images, so they are exempt (like sourceSha).
    if (r && r.fixture === undefined) {
      if (buildHash && r.buildHash !== buildHash) errors.push(`review build "${r.buildHash ?? ''}" is not the gated build "${buildHash}"`);
      if (artifacts) {
        const expected = artifacts[key(r)];
        if (!expected) errors.push(`no captured artifact bound for checkpoint ${key(r)}`);
        else if (r.artifactHash !== expected) errors.push(`artifactHash ${r.artifactHash ?? 'none'} is not the captured artifact ${expected} for ${key(r)}`);
      }
    }
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
  for (const f of fixtures?.negative ?? []) {
    if (f.artifactHash === null) { drift.push({checkpoint: f.image, reason: `negative fixture ${f.image} not committed yet (${f.pendingTicket})`}); continue; }
    const hit = reviews.find(r => r?.fixture === 'negative' && r.artifactHash === f.artifactHash);
    if (!hit) drift.push({checkpoint: f.image, reason: `declared negative fixture ${f.image} was not reviewed this run`});
  }
  const negatives = reviews.filter(r => r?.fixture === 'negative').length;
  if (negatives === 0) drift.push({checkpoint: null, reason: 'no negative fixture reviewed this run (rubric-drift check skipped)'});
  const verdict = blocking.length || invalid.length || missing.length || drift.length ? 'FAIL' : 'PASS';
  return {schema: 'device-layout/vision-result/v1', verdict, blocking, followUps, invalid, missing, drift};
}
