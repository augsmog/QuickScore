// Pure geometry rules, lifted from SnapScore's capture-layout audit
// (scoresnap/e2e/journeys/capture-layout.mjs + interactive-target-geometry.mjs)
// so any product can feed it a normalized snapshot.
//
// Snapshot (device-layout/snapshot/v1), all rects in the config's logical units
// (pt / dp / css-px), origin top-left of the device screen:
//   targets: [{id, name, left, top, right, bottom, parentId?, backdrop?, unsupported?, size?:{width,height}}]
//   texts:   [{name, left, top, right, bottom, owners?: [targetId], unsupported?}]
// `size` lets an adapter report the full border box of a target that is only
// partly visible inside a scroll container (SnapScore semantics); default is the rect.

export const SNAPSHOT_SCHEMA = 'device-layout/snapshot/v1';

const overlapOf = (a, b) => ({
  width: Math.min(a.right, b.right) - Math.max(a.left, b.left),
  height: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
});

export function findOverlaps(targets, tolerance = 2) {
  const out = [];
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const a = targets[i], b = targets[j];
    if ((a.parentId != null && a.parentId === b.id) || (b.parentId != null && b.parentId === a.id)) continue;
    const {width, height} = overlapOf(a, b);
    if (width > tolerance && height > tolerance) out.push({first: a.name, second: b.name, width, height});
  }
  return out;
}

export function validateSnapshot(snapshot) {
  const errors = [];
  if (snapshot?.schema !== SNAPSHOT_SCHEMA) errors.push(`schema must be "${SNAPSHOT_SCHEMA}"`);
  if (typeof snapshot?.device !== 'string') errors.push('device id required');
  if (typeof snapshot?.screen !== 'string') errors.push('screen id required');
  for (const key of ['targets', 'texts']) {
    if (!Array.isArray(snapshot?.[key])) { errors.push(`${key} must be an array`); continue; }
    snapshot[key].forEach((r, i) => {
      if (!['left', 'top', 'right', 'bottom'].every(k => Number.isFinite(r?.[k]))) errors.push(`${key}[${i}] needs finite left/top/right/bottom`);
      else if (r.right < r.left || r.bottom < r.top) errors.push(`${key}[${i}] has negative extent`);
    });
  }
  if (Array.isArray(snapshot?.targets) && snapshot.targets.length === 0 && Array.isArray(snapshot?.texts) && snapshot.texts.length === 0) {
    errors.push('snapshot is empty: an adapter that measured nothing must not pass the gate');
  }
  return errors;
}

// Returns [{rule, subject, geometry}] for one snapshot on one resolved device.
export function evaluateSnapshot(snapshot, device, rules) {
  const on = new Set(rules.checks);
  const eps = rules.subpixelEpsilon;
  const sa = device.safeArea;
  const failures = [];
  const fail = (rule, subject, geometry) => failures.push({rule, subject, geometry});
  const placed = snapshot.targets.filter(t => !t.backdrop);
  const band = {left: sa.left, top: sa.top, right: device.width - sa.right, bottom: device.height - sa.bottom};

  for (const item of [...placed, ...snapshot.texts]) {
    if (on.has('unsupported-geometry') && item.unsupported) fail('unsupported-geometry', item.name, item);
    if (on.has('offscreen') && (item.left < -eps || item.top < -eps || item.right > device.width + eps || item.bottom > device.height + eps)) {
      fail('offscreen', item.name, {rect: pick(item), screen: {width: device.width, height: device.height}});
    } else if (on.has('safe-area') && (item.left < band.left - eps || item.top < band.top - eps || item.right > band.right + eps || item.bottom > band.bottom + eps)) {
      fail('safe-area', item.name, {rect: pick(item), safe: band});
    }
  }
  if (on.has('target-size')) for (const t of placed) {
    const size = t.size ?? {width: t.right - t.left, height: t.bottom - t.top};
    if (size.width < device.minTarget.width - eps || size.height < device.minTarget.height - eps) fail('target-size', t.name, {size, min: device.minTarget});
  }
  if (on.has('control-overlap')) for (const o of findOverlaps(placed, rules.overlapTolerance)) fail('control-overlap', `${o.first} x ${o.second}`, o);
  if (on.has('text-over-control')) for (const text of snapshot.texts) for (const t of placed) {
    if ((text.owners ?? []).includes(t.id)) continue;
    const {width, height} = overlapOf(text, t);
    if (width > rules.overlapTolerance && height > rules.overlapTolerance) fail('text-over-control', `${text.name} x ${t.name}`, {width, height});
  }
  return failures;
}

const pick = r => ({left: r.left, top: r.top, right: r.right, bottom: r.bottom});
