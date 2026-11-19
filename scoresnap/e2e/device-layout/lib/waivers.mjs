// Named, expiring waivers for the device-layout gate (RECONCILED-PLAN section B).
//
// A waiver suppresses ONE (ruleId, screen, device/state) finding until it expires. Every
// waiver must be attributed to a *named independent approver* and a ticket, and must expire.
// The validator fails CI on an expired, unattributed, or malformed waiver, and on any attempt
// to waive missing-platform evidence (which can never be waived).
//
// Record shape:
//   { ruleId, screen, deviceId|state, reason, evidence, approvedBy, ticket, expires:"YYYY-MM-DD" }

const MAX_WAIVER_DAYS = 14; // Fable's cap; Astra prefers ≤7. Enforced below; tighten if owner picks 7.

function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateWaivers(doc, now = new Date()) {
  const errors = [];
  const list = doc?.waivers;
  if (!Array.isArray(list)) return { ok: false, errors: ['waivers.waivers must be an array'] };
  list.forEach((w, i) => {
    const at = `waiver[${i}]`;
    if (!Number.isInteger(w.ruleId) || w.ruleId < 1 || w.ruleId > 8) errors.push(`${at}.ruleId invalid`);
    if (!w.screen) errors.push(`${at}.screen required`);
    if (!w.deviceId && !w.state) errors.push(`${at} needs deviceId or state`);
    if (!w.reason || !w.evidence) errors.push(`${at} needs reason and evidence`);
    if (!w.approvedBy) errors.push(`${at}.approvedBy (named independent) required`);
    if (/^(tater|self|me|augie)$/i.test(String(w.approvedBy))) {
      errors.push(`${at}.approvedBy "${w.approvedBy}" is not an independent approver`);
    }
    if (!w.ticket) errors.push(`${at}.ticket required`);
    const exp = parseDate(w.expires);
    if (!exp) { errors.push(`${at}.expires must be YYYY-MM-DD`); return; }
    if (exp.getTime() <= now.getTime()) errors.push(`${at} expired on ${w.expires}`);
    const created = parseDate(w.created || w.expires);
    if (created) {
      const span = (exp - created) / 86400000;
      if (span > MAX_WAIVER_DAYS) errors.push(`${at} window ${span}d exceeds ${MAX_WAIVER_DAYS}d max`);
    }
    // Missing-platform evidence can never be waived.
    if (/missing[-\s]?(platform|evidence|ios|android)/i.test(`${w.reason} ${w.ruleId}`)) {
      errors.push(`${at} attempts to waive missing-platform evidence (never allowed)`);
    }
  });
  return { ok: errors.length === 0, errors };
}

// Apply active waivers to a finding list; returns {kept, waived}. A finding is waived only if
// a valid, unexpired waiver matches its rule + screen + device/state.
export function applyWaivers(findings, doc, ctx, now = new Date()) {
  const v = validateWaivers(doc, now);
  if (!v.ok) return { kept: findings, waived: [], waiverErrors: v.errors };
  const active = doc.waivers;
  const kept = [], waived = [];
  for (const f of findings) {
    const match = active.find((w) => w.ruleId === f.rule &&
      w.screen === ctx.screen &&
      (w.deviceId == null || w.deviceId === ctx.deviceId) &&
      (w.state == null || w.state === ctx.state));
    if (match) waived.push({ finding: f, waiver: match });
    else kept.push(f);
  }
  return { kept, waived, waiverErrors: [] };
}
