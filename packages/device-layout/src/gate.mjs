import {createHash} from 'node:crypto';
import {resolveConfig, CHECKS} from './config.mjs';
import {evaluateSnapshot, validateSnapshot, viewportMismatch} from './rules.mjs';

export const WAIVER_SCHEMA = 'device-layout/waiver/v1';
export const RECEIPT_SCHEMA = 'device-layout/receipt/v1';

// Waiver: one known, ticketed, expiring exception. A waiver without a ticket,
// reason, approver or expiry is rejected, and an expired waiver fails the gate
// rather than silently stopping to apply.
export function validateWaivers(doc) {
  const errors = [];
  if (doc?.schema !== WAIVER_SCHEMA) errors.push(`schema must be "${WAIVER_SCHEMA}"`);
  if (!Array.isArray(doc?.waivers)) { errors.push('waivers must be an array'); return errors; }
  const seen = new Set();
  doc.waivers.forEach((w, i) => {
    const p = `waivers[${i}]`;
    if (typeof w?.id !== 'string' || !w.id) errors.push(`${p}.id required`);
    else if (seen.has(w.id)) errors.push(`${p}.id duplicate "${w.id}"`);
    seen.add(w?.id);
    if (typeof w?.rule !== 'string') errors.push(`${p}.rule required`);
    // Coverage is not a rule: missing-platform/device/screen evidence can never be
    // waived (ported from PR #342 policy.waiverErrors).
    else if (!CHECKS.includes(w.rule)) errors.push(`${p}.rule "${w.rule}" is not a waivable check (missing-platform evidence can never be waived)`);
    if (/\bmissing\b.*\b(platform|evidence|ios|android|device)\b|\bno (ios|android|emulator|simulator)\b/i.test(`${w?.reason ?? ''} ${w?.evidence ?? ''}`)) errors.push(`${p}: missing-platform evidence can never be waived`);
    if (typeof w?.subject !== 'string' || !w.subject) errors.push(`${p}.subject required (exact failure subject)`);
    if (!/^AUG-\d+$/.test(w?.ticket ?? '')) errors.push(`${p}.ticket must be AUG-<n>`);
    if (typeof w?.reason !== 'string' || w.reason.length < 10) errors.push(`${p}.reason must explain the exception`);
    if (typeof w?.approvedBy !== 'string' || !w.approvedBy) errors.push(`${p}.approvedBy required`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w?.expires ?? '')) errors.push(`${p}.expires must be YYYY-MM-DD`);
  });
  return errors;
}

// configHash: the provenance hash a snapshot must carry for this exact config.
export const configHash = config => 'sha256:' + createHash('sha256').update(JSON.stringify(config)).digest('hex');

// Snapshot provenance must equal the gated run's {sourceSha, buildHash, configHash}.
// Anything else is stale evidence (old build, other head, edited config) -> INVALID.
function provenanceErrors(snap, run) {
  const p = snap?.provenance;
  if (!p || typeof p !== 'object') return ['snapshot provenance missing (sourceSha, buildHash, configHash)'];
  return ['sourceSha', 'buildHash', 'configHash'].filter(k => p[k] !== run[k]).map(k => `stale ${k}: snapshot ${p[k] ?? 'none'} != run ${run[k]}`);
}

const scoped = (value, actual) => value === undefined || value === '*' || value === actual;
const matches = (w, device, screen, f) =>
  w.rule === f.rule && w.subject === f.subject && scoped(w.device, device) && scoped(w.screen, screen);

// snapshots: normalized device-layout/snapshot/v1 objects (from an adapter).
export function runGate({config, snapshots, waivers = {schema: WAIVER_SCHEMA, waivers: []}, provenance = null, sha = null, today = new Date().toISOString().slice(0, 10)}) {
  const cfg = resolveConfig(config);
  const waiverErrors = validateWaivers(waivers);
  if (waiverErrors.length) throw new Error(`invalid waivers:\n  ${waiverErrors.join('\n  ')}`);
  const deviceById = new Map(cfg.devices.map(d => [d.id, d]));
  const active = waivers.waivers.filter(w => w.expires >= today);
  const expired = waivers.waivers.filter(w => w.expires < today).map(w => ({id: w.id, ticket: w.ticket, expires: w.expires}));
  const used = new Set();
  const results = [], invalid = [];
  const run = {sourceSha: provenance?.sourceSha ?? sha, buildHash: provenance?.buildHash ?? null, configHash: configHash(config)};
  const provenanceGaps = [];
  if (!/^[0-9a-f]{40}$/.test(run.sourceSha ?? '')) provenanceGaps.push('run sourceSha must be a 40-hex commit');
  if (typeof run.buildHash !== 'string' || !run.buildHash) provenanceGaps.push('run buildHash required');

  for (const snap of snapshots) {
    const errors = validateSnapshot(snap);
    const device = deviceById.get(snap?.device);
    if (!device) errors.push(`unknown device "${snap?.device}"`);
    else if (!errors.length) { const m = viewportMismatch(snap, device); if (m) errors.push(m); }
    if (cfg.screens.length && !cfg.screens.some(s => s.id === snap?.screen)) errors.push(`unknown screen "${snap?.screen}"`);
    if (!provenanceGaps.length) errors.push(...provenanceErrors(snap, run));
    if (errors.length) { invalid.push({device: snap?.device ?? null, screen: snap?.screen ?? null, errors}); continue; }
    const failures = [], waived = [];
    for (const f of evaluateSnapshot(snap, device, cfg.rules)) {
      const w = active.find(x => matches(x, snap.device, snap.screen, f));
      if (w) { used.add(w.id); waived.push({...f, waiver: w.id, ticket: w.ticket}); } else failures.push(f);
    }
    results.push({device: snap.device, screen: snap.screen, screenshot: snap.screenshot ?? null, targets: snap.targets.length, texts: snap.texts.length, failures, waived});
  }

  const covered = new Set(results.map(r => `${r.device}::${r.screen}`));
  const missing = [];
  for (const s of cfg.screens) if (s.required) for (const d of s.devices) if (!covered.has(`${d}::${s.id}`)) missing.push({device: d, screen: s.id});
  if (!cfg.screens.length && results.length === 0) missing.push({device: '*', screen: '*'});

  const failureCount = results.reduce((n, r) => n + r.failures.length, 0);
  const verdict = failureCount === 0 && missing.length === 0 && invalid.length === 0 && expired.length === 0 && provenanceGaps.length === 0 ? 'PASS' : 'FAIL';
  return {
    schema: RECEIPT_SCHEMA,
    product: cfg.product,
    sha: run.sourceSha,
    adapter: cfg.adapter,
    provenance: {...run, errors: provenanceGaps},
    reviewerPolicy: cfg.reviewerPolicy,
    retention: cfg.retention,
    generatedAt: new Date().toISOString(),
    configDigest: run.configHash,
    units: cfg.units,
    devices: cfg.devices.map(d => ({id: d.id, platform: d.platform, orientation: d.orientation, width: d.width, height: d.height, safeArea: d.safeArea, minTarget: d.minTarget})),
    rules: cfg.rules,
    counts: {snapshots: results.length, failures: failureCount, waived: results.reduce((n, r) => n + r.waived.length, 0), missing: missing.length, invalid: invalid.length, expiredWaivers: expired.length},
    results,
    missing,
    invalid,
    expiredWaivers: expired,
    unusedWaivers: active.filter(w => !used.has(w.id)).map(w => w.id),
    // Geometry is necessary, not sufficient: the vision rubric (rubric/vision-rubric.v1.md)
    // is scored by a separate checker against the screenshots referenced above.
    vision: {rubric: 'device-layout/vision-rubric/v1', status: 'pending-independent-checker'},
    verdict,
  };
}

export function summarize(receipt) {
  const lines = [`device-layout/v1 ${receipt.product} ${receipt.verdict} — ${receipt.counts.snapshots} snapshot(s), ${receipt.counts.failures} failure(s), ${receipt.counts.waived} waived, ${receipt.counts.missing} missing, ${receipt.counts.invalid} invalid, ${receipt.counts.expiredWaivers} expired waiver(s)`];
  for (const r of receipt.results) for (const f of r.failures) lines.push(`  FAIL ${r.device} / ${r.screen}: ${f.rule} — ${f.subject}`);
  for (const m of receipt.missing) lines.push(`  MISSING ${m.device} / ${m.screen}`);
  for (const i of receipt.invalid) lines.push(`  INVALID ${i.device} / ${i.screen}: ${i.errors.join('; ')}`);
  for (const e of receipt.provenance?.errors ?? []) lines.push(`  PROVENANCE ${e}`);
  for (const w of receipt.expiredWaivers) lines.push(`  EXPIRED waiver ${w.id} (${w.ticket}, ${w.expires})`);
  return lines.join('\n');
}
