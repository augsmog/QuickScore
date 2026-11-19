// Layer-2 candidate acceptance (Codex check on 7116885, finding 3): the vision reviewer must
// judge the CANDIDATE's own native screenshots, not only the committed calibration reviews.
//
// For every checkpoint of a candidate-bound capture bundle (see run-geometry.mjs validateBundle):
//   - the screenshot must exist and its sha256 must equal checkpoint.screenshotSha256;
//   - the reviewer is invoked on that exact file; reviewer unavailable/throws => FAIL;
//   - the review must validate against the schema and be bound to the same artifact hash,
//     sourceSha, buildHash, flow and checkpoint;
//   - the review must have verdict "pass" with no major/critical finding.
// Pure apart from the injected `readFile` and `review` functions, so it is unit-testable.

import { createHash } from 'node:crypto';
import { validateReview, hasMajor, majorRules } from './vision-schema.mjs';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function reviewCandidate(bundle, { readFile, review }) {
  const results = [];
  const errors = [];
  if (typeof review !== 'function') {
    return { ok: false, results, errors: ['vision reviewer unavailable — candidate screenshots not reviewed (fail closed)'] };
  }
  const cps = Array.isArray(bundle?.checkpoints) ? bundle.checkpoints : [];
  if (cps.length === 0) errors.push('no checkpoints — no candidate screenshots to review');
  for (const cp of cps) {
    const id = `${cp.flow}/${cp.checkpoint} (${cp.deviceId})`;
    const errs = [];
    let rev = null;
    if (typeof cp.screenshot !== 'string' || !cp.screenshot) errs.push('missing screenshot');
    if (typeof cp.screenshotSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(cp.screenshotSha256)) errs.push('missing screenshotSha256');
    let buf = null;
    if (!errs.length) {
      try { buf = readFile(cp.screenshot); } catch (e) { errs.push(`screenshot unreadable: ${e.message}`); }
    }
    if (buf && sha256(buf) !== cp.screenshotSha256) errs.push('screenshot hash mismatch (stale or swapped artifact)');
    if (!errs.length) {
      const meta = {
        sourceSha: bundle.sourceSha, buildHash: bundle.buildHash, artifactHash: cp.screenshotSha256,
        device: cp.deviceId, platform: cp.platform, flow: cp.flow, checkpoint: cp.checkpoint,
      };
      try { rev = review(cp.screenshot, meta); } catch (e) { errs.push(`vision reviewer unavailable: ${e.message}`); }
      if (rev) {
        const v = validateReview(rev);
        if (!v.ok) errs.push(`invalid review: ${v.errors.join('; ')}`);
        for (const k of ['sourceSha', 'buildHash', 'artifactHash', 'flow', 'checkpoint']) {
          if (rev[k] !== meta[k]) errs.push(`review ${k} "${rev[k]}" not bound to candidate "${meta[k]}"`);
        }
        if (rev.verdict !== 'pass' || hasMajor(rev)) {
          errs.push(`vision verdict ${rev.verdict}; major rules [${majorRules(rev).join(',')}]`);
        }
      } else if (!errs.length) {
        errs.push('reviewer returned no review');
      }
    }
    results.push({ id, ok: errs.length === 0, errors: errs, review: rev });
  }
  const ok = errors.length === 0 && results.length > 0 && results.every((r) => r.ok);
  return { ok, results, errors };
}
