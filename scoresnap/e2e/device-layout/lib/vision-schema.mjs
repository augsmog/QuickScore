// Validator for the vision reviewer's JSON output (device-layout/v1 schema, section B).
// A review that does not validate is treated as "invalid review" → the gate fails (the
// reviewer must be present and produce well-formed, attributed findings).

const SEVERITIES = new Set(['critical', 'major', 'minor']);
const VERDICTS = new Set(['pass', 'fail']);
const MAJOR = new Set(['critical', 'major']);

export function validateReview(review) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };
  req(review && typeof review === 'object', 'review is not an object');
  if (!review || typeof review !== 'object') return { ok: false, errors };
  for (const k of ['sourceSha', 'buildHash', 'artifactHash', 'device', 'flow', 'checkpoint']) {
    req(typeof review[k] === 'string' && review[k].length > 0, `missing/empty "${k}"`);
  }
  const rv = review.reviewer;
  req(rv && typeof rv === 'object', 'missing reviewer');
  if (rv) {
    req(typeof rv.provider === 'string' && rv.provider.length > 0, 'missing reviewer.provider');
    req(typeof rv.model === 'string' && rv.model.length > 0, 'missing reviewer.model');
    req(typeof rv.effort === 'string' && rv.effort.length > 0, 'missing reviewer.effort');
  }
  req(Array.isArray(review.findings), 'findings is not an array');
  if (Array.isArray(review.findings)) {
    review.findings.forEach((f, i) => {
      req(Number.isInteger(f.rule) && f.rule >= 1 && f.rule <= 8, `finding[${i}].rule invalid`);
      req(SEVERITIES.has(f.severity), `finding[${i}].severity invalid`);
      req(Array.isArray(f.bbox) && f.bbox.length === 4 && f.bbox.every((n) => typeof n === 'number'),
        `finding[${i}].bbox must be 4 numbers`);
      req(typeof f.reason === 'string' && f.reason.length > 0, `finding[${i}].reason empty`);
    });
  }
  req(VERDICTS.has(review.verdict), 'verdict must be pass|fail');
  // Self-consistency: a review with a major/critical finding cannot claim pass.
  if (Array.isArray(review.findings) && review.findings.some((f) => MAJOR.has(f.severity))) {
    req(review.verdict === 'fail', 'verdict=pass contradicts a major/critical finding');
  }
  return { ok: errors.length === 0, errors };
}

export function hasMajor(review) {
  return Array.isArray(review?.findings) && review.findings.some((f) => MAJOR.has(f.severity));
}

export function majorRules(review) {
  if (!Array.isArray(review?.findings)) return [];
  return [...new Set(review.findings.filter((f) => MAJOR.has(f.severity)).map((f) => f.rule))];
}
