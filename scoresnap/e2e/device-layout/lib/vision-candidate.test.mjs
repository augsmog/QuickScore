import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewCandidate, sha256, reviewerPolicyErrors } from './vision-candidate.mjs';

const policy = { provider: 'openai', model: 'gpt-6-astra', effort: 'high' };

const IMG = Buffer.from('png-bytes');
const H = sha256(IMG);
const bundle = (over = {}) => ({
  sourceSha: 'a'.repeat(40), buildHash: 'b1', profile: 'iphone-se-3', platform: 'ios',
  checkpoints: [{ flow: 'new-contest', checkpoint: 'Start', deviceId: 'iphone-se-3', platform: 'ios',
    nodes: [{}], screenshot: 'shots/1.png', screenshotSha256: H }],
  ...over,
});
const goodReview = (meta, over = {}) => ({
  sourceSha: meta.sourceSha, buildHash: meta.buildHash, artifactHash: meta.artifactHash,
  device: meta.device, flow: meta.flow, checkpoint: meta.checkpoint,
  reviewer: { provider: 'openai', model: 'gpt-6-astra', effort: 'high' },
  findings: [], verdict: 'pass', ...over,
});
const readFile = () => IMG;

test('candidate vision: reviewer unavailable fails closed', () => {
  assert.equal(reviewCandidate(bundle(), { readFile }).ok, false);
  const thrown = reviewCandidate(bundle(), { readFile, review: () => { throw new Error('no login'); } });
  assert.equal(thrown.ok, false);
  assert.match(thrown.results[0].errors.join(), /reviewer unavailable/);
});

test('candidate vision: clean hash-bound review passes', () => {
  assert.equal(reviewCandidate(bundle(), { readFile, policy, review: (_p, m) => goodReview(m) }).ok, true);
});

test('candidate vision: major finding, stale hash, unbound review, missing screenshot all fail', () => {
  const major = reviewCandidate(bundle(), { readFile, review: (_p, m) => goodReview(m, {
    findings: [{ rule: 2, severity: 'major', bbox: [0, 0, 1, 1], reason: 'footer clip' }], verdict: 'fail' }) });
  assert.equal(major.ok, false);
  const stale = reviewCandidate(bundle(), { readFile: () => Buffer.from('other'), review: (_p, m) => goodReview(m) });
  assert.match(stale.results[0].errors.join(), /hash mismatch/);
  const unbound = reviewCandidate(bundle(), { readFile, review: (_p, m) => goodReview(m, { sourceSha: 'old' }) });
  assert.match(unbound.results[0].errors.join(), /not bound/);
  const b = bundle(); delete b.checkpoints[0].screenshot;
  assert.match(reviewCandidate(b, { readFile, review: (_p, m) => goodReview(m) }).results[0].errors.join(), /missing screenshot/);
  assert.equal(reviewCandidate(bundle({ checkpoints: [] }), { readFile, review: (_p, m) => goodReview(m) }).ok, false);
});

// Codex check on 79a87a2: wrong device and a Grok/low-effort reviewer were accepted.
test('candidate vision: reviewer policy and device binding are enforced', () => {
  const wrong = reviewCandidate(bundle(), { readFile, policy, review: (_p, m) => goodReview(m, {
    device: 'wrong-device', reviewer: { provider: 'xai', model: 'grok', effort: 'low' } }) });
  assert.equal(wrong.ok, false);
  const e = wrong.results[0].errors.join();
  assert.match(e, /Grok/);
  assert.match(e, /device/);
  assert.match(e, /effort/);
  assert.equal(reviewCandidate(bundle(), { readFile, review: (_p, m) => goodReview(m) }).ok, false, 'no policy => fail closed');
  assert.match(reviewerPolicyErrors(goodReview({}, { reviewer: { provider: 'openai', model: 'gpt-6-luna', effort: 'high' } }), policy).join(), /model/);
});
