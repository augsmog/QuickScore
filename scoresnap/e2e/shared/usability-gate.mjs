import assert from 'node:assert/strict';
export const required=['join-empty','join-invalid','join-deeplink','create-cancel','review-error'];
export function gate(report, {regression=false}={}) {
  assert.deepEqual([...report.required].sort(),[...required].sort(),'required inventory changed');
  assert.equal(report.results.length,required.length,'missing/extra results');
  assert.deepEqual(report.results.map(r=>r.id).sort(),[...required].sort(),'missing/duplicate required case');
  for(const r of report.results) {
    const expected=regression && r.id==='join-empty'?'failed':'passed';
    assert.equal(r.status,expected,`${r.id}: expected ${expected}; skips and startup errors block green`);
    if(expected==='failed') assert.match(r.error,/Back to home|dismiss/, 'regression must fail on missing dismiss');
  }
}
