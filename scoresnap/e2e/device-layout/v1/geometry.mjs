// device-layout/v1 — deterministic geometry layer. Operates purely on the
// normalized element tree (schema.mjs ELEMENT_NODE_SCHEMA) so it is identical for
// RN/Maestro and Godot adapters. Rectangle helpers mirror the proven engine in
// scoresnap/e2e/journeys/metrics.mjs (intersectRect / rectArea); the tolerances are
// the reconciled §B thresholds (owner t1547u), not the superseded ≤120pt dead-space cap.

export const TOLERANCES = {
  OVERLAP_PT: 1,        // rule 1: hit regions must not intersect beyond 1 logical unit
  MIN_SPACING_PT: 8,    // rules 4 & 5: ≥8pt/dp between independent controls
  HEADER_MAX_PT: 32,    // rule 4: New Contest header ≤32pt below modal content origin
  ALIGN_PT: 4,          // rule 4/6: ≤4pt deviation from declared alignment anchors
  ROW_CENTER_PT: 2,     // rule 6: row siblings' vertical centers within 2pt
  TAP_MIN: { ios: 44, android: 48 }, // rule 5: effective tap target minimums
};

export function intersectRect(a, b) {
  if (!a || !b) return null;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
export function rectArea(r) { return r ? Math.max(0, r.width) * Math.max(0, r.height) : 0; }

// Two regions overlap "beyond tolerance" when their intersection exceeds `tol` in
// BOTH axes — a sub-pixel shared edge is not an overlap.
export function overlapsBeyond(a, b, tol) {
  const i = intersectRect(a, b);
  return !!i && i.width > tol && i.height > tol;
}

function flatten(root) {
  const out = [];
  const walk = (n, ancestors) => {
    out.push({ node: n, ancestors });
    for (const c of n.children || []) walk(c, [...ancestors, n]);
  };
  walk(root, []);
  return out;
}
const isAncestor = (a, entry) => entry.ancestors.includes(a.node);
const region = (n) => n.hitRegion || n.bbox;

// Rule 1 — independent hit regions must never overlap beyond 1pt. Elements that are
// ancestors/descendants of each other (a label inside its own control) are excluded.
export function checkOverlap(root, tol = TOLERANCES.OVERLAP_PT) {
  const nodes = flatten(root).filter((e) => e.node.hitRegion); // interactive only
  const findings = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const [a, b] = [nodes[i], nodes[j]];
      if (isAncestor(a, b) || isAncestor(b, a)) continue;
      if (overlapsBeyond(a.node.hitRegion, b.node.hitRegion, tol)) {
        findings.push({ rule: 1, severity: 'critical', bbox: a.node.hitRegion, reason: `hit regions overlap: ${a.node.id} / ${b.node.id}` });
      }
    }
  }
  return findings;
}

// Rule 5 — effective, unclipped usable regions ≥ platform minimum, AND ≥8pt edge gap
// to the nearest sibling target. `clip` (if present) is intersected before measuring.
export function checkTapTargets(root, platform) {
  const min = TOLERANCES.TAP_MIN[platform];
  if (!min) throw new Error(`unknown platform: ${platform}`);
  const nodes = flatten(root).filter((e) => e.node.hitRegion);
  const findings = [];
  for (const { node } of nodes) {
    const effective = node.clip ? intersectRect(node.hitRegion, node.clip) : node.hitRegion;
    if (!effective || effective.width < min || effective.height < min) {
      findings.push({ rule: 5, severity: 'major', bbox: node.hitRegion, reason: `tap target ${node.id} below ${min} (${effective ? `${effective.width}x${effective.height}` : 'fully clipped'})` });
    }
  }
  // edge-gap between every interactive pair that does not overlap
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = region(nodes[i].node), b = region(nodes[j].node);
      if (overlapsBeyond(a, b, 0)) continue;
      if (gap(a, b) < TOLERANCES.MIN_SPACING_PT && adjacent(a, b)) {
        findings.push({ rule: 5, severity: 'major', bbox: a, reason: `targets ${nodes[i].node.id}/${nodes[j].node.id} closer than ${TOLERANCES.MIN_SPACING_PT}pt` });
      }
    }
  }
  return findings;
}

// axis-aligned gap between two non-overlapping rects (0 when they overlap on both axes)
function gap(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  return Math.max(dx, dy);
}
// only enforce the gap for targets that share a row or column band (adjacent),
// so stacked-far controls are not flagged
function adjacent(a, b) {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0;
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;
  return overlapX || overlapY;
}

// Rule 2 — clipping / reachability: after clips, a required control must be fully
// visible. Returns a finding when a required element's visible area is below `minRatio`.
export function checkReachability(root, { requiredIds = [], minRatio = 0.999 } = {}) {
  const findings = [];
  for (const { node } of flatten(root)) {
    if (!requiredIds.includes(node.id)) continue;
    const r = region(node);
    const visible = node.clip ? intersectRect(r, node.clip) : r;
    const ratio = rectArea(visible) / Math.max(1, rectArea(r));
    if (ratio < minRatio) {
      findings.push({ rule: 2, severity: 'critical', bbox: r, reason: `required control ${node.id} clipped (${(ratio * 100).toFixed(1)}% visible)` });
    }
  }
  return findings;
}

// Run every available deterministic rule and return the combined findings list.
export function runGeometry(root, { platform, requiredIds = [] } = {}) {
  const findings = [...checkOverlap(root)];
  if (platform) findings.push(...checkTapTargets(root, platform));
  if (requiredIds.length) findings.push(...checkReachability(root, { requiredIds }));
  return findings;
}
