// device-layout/v1 deterministic geometry checker — rules 1–8 (AUG-1380).
//
// Ported from scoresnap/e2e/journeys/capture-layout.mjs:134-150 (text-over-control /
// control-overlap / safe-area geometry) and extended to the native rule set agreed in
// /workspace/aos-state/reports/2026-11-19-device-gate-t1547u/RECONCILED-PLAN.md (section B).
//
// The engine consumes a *normalized element tree* (the shape every adapter must emit):
//   { id, role, text, bbox:{left,top,right,bottom}, hitRegion:{...}|null,
//     scrollState, enabled, selected, checked, focused, parentId, meta:{...} }
// `meta` carries optional, measured context (switchThumb/track colors, expectedText,
// isSwitch, label associations, sectionGrid). Rules that need context they weren't given
// are *skipped*, never guessed — "never fabricate hierarchy from screenshots".
//
// Each rule returns findings: { rule, severity, bbox:[l,t,r,b], reason, nodes:[ids] }.
// run-geometry.mjs aggregates them and decides pass/fail; any finding fails the gate.

const OVERLAP_TOL = 1; // logical units (1pt/dp) — rule 1 painted-overlap tolerance
const TEXT_OVERLAP_TOL = 2; // retained from capture-layout.mjs text-over-control tolerance
const MIN_SPACING = 8; // rule 4/5 min gap between independent controls (pt/dp)
const ALIGN_TOL = 4; // rule 4/6 max deviation from a declared alignment anchor
const ROW_CENTER_TOL = 2; // rule 6 row-sibling vertical-center tolerance
const HEADER_MAX_OFFSET = 32; // rule 4 header ≤32pt below modal content origin
const IOS_MIN_TARGET = 44; // rule 5
const ANDROID_MIN_TARGET = 48; // rule 5

// A finite, non-degenerate measured rectangle: all four edges finite and positive area. Shared
// by the evaluator and run-geometry's validateBundle so no malformed geometry reaches a rule.
export function finiteRect(r) {
  return !!r && typeof r === 'object' &&
    ['left', 'top', 'right', 'bottom'].every((k) => Number.isFinite(r[k])) &&
    r.right > r.left && r.bottom > r.top;
}

// The effective (tap/paint) rectangle a rule compares: the measured hit region when present,
// else the painted bbox. Fails CLOSED — a present-but-malformed hitRegion (or a bbox that is
// {}/partial/non-finite) throws rather than yielding NaN dimensions that silently pass every
// comparison (Codex AUG-1400: `{}` hitRegion evaded rule 5 on 17 checkpoints).
export function rectOf(node) {
  const r = node.hitRegion != null ? node.hitRegion : node.bbox;
  if (!finiteRect(r)) {
    throw new Error(`node "${node?.id ?? '?'}" has a malformed effective rect ` +
      `(${node.hitRegion != null ? 'hitRegion' : 'bbox'} must have finite left/top/right/bottom ` +
      `with positive width/height); geometry evaluation fails closed`);
  }
  return r;
}

function bboxArr(r) {
  return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
}

function intersect(a, b) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return { width, height };
}

export function isAncestor(tree, ancestorId, nodeId) {
  let cur = tree.byId.get(nodeId);
  while (cur && cur.parentId != null) {
    if (cur.parentId === ancestorId) return true;
    cur = tree.byId.get(cur.parentId);
  }
  return false;
}

// Build fast lookups and collect typed node lists from a flat node array.
export function indexTree(nodes) {
  const byId = new Map();
  for (const n of nodes) byId.set(n.id, n);
  const tree = { nodes, byId };
  tree.controls = nodes.filter((n) => n.role === 'control' && !n.meta?.backdrop);
  tree.texts = nodes.filter((n) => n.role === 'text');
  return tree;
}

// Rule 1 — Overlap. Unrelated painted control/text rectangles must not intersect beyond
// 1pt; a control and an un-owned text label must not collide (switch/label collision).
export function ruleOverlap(tree) {
  const findings = [];
  const controls = tree.controls;
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i];
      const b = controls[j];
      // A control nested inside another (its own handler) is not an ambiguous sibling.
      if (isAncestor(tree, a.id, b.id) || isAncestor(tree, b.id, a.id)) continue;
      const { width, height } = intersect(rectOf(a), rectOf(b));
      if (width > OVERLAP_TOL && height > OVERLAP_TOL) {
        findings.push({
          rule: 1, severity: 'major', bbox: bboxArr(rectOf(a)), nodes: [a.id, b.id],
          reason: `Controls "${a.text || a.id}" and "${b.text || b.id}" overlap by ${width.toFixed(1)}×${height.toFixed(1)}pt (> ${OVERLAP_TOL}pt).`,
        });
      }
    }
  }
  for (const text of tree.texts) {
    for (const control of controls) {
      // A label painted inside its own control is distinguished explicitly.
      if (text.meta?.owners?.includes(control.id)) continue;
      if (isAncestor(tree, control.id, text.id)) continue;
      const { width, height } = intersect(text.bbox, rectOf(control));
      if (width > TEXT_OVERLAP_TOL && height > TEXT_OVERLAP_TOL) {
        findings.push({
          rule: 1, severity: 'major', bbox: bboxArr(text.bbox), nodes: [text.id, control.id],
          reason: `Text "${text.text}" paints over unrelated control "${control.text || control.id}" by ${width.toFixed(1)}×${height.toFixed(1)}pt.`,
        });
      }
    }
  }
  return findings;
}

// Rule 2 — Clipping / reachability. After scroll-to-end every required control and the
// last focusable row must be fully visible and operable above the sticky footer and inside
// the safe area; nothing hard-clipped by the footer, viewport, or safe-area insets.
export function ruleClipping(tree, ctx) {
  const findings = [];
  const footer = ctx.footer; // {left,top,right,bottom} sticky footer, optional
  const safe = ctx.safeArea; // {top,bottom,left,right} insets, optional
  const vp = ctx.viewport; // {width,height}
  const required = tree.nodes.filter((n) => n.meta?.required || n.role === 'control');
  for (const n of required) {
    const r = n.bbox;
    const clip = n.meta?.scrollViewport;
    if (clip && (r.left < clip.left || r.top < clip.top ||
        r.right > clip.right || r.bottom > clip.bottom)) {
      findings.push({ rule: 2, severity: 'major', bbox: bboxArr(r), nodes: [n.id],
        reason: 'Required/control frame is not fully painted within measured scroll ancestors; full visibility and reachability are unproven at this checkpoint.' });
    }
    // Partially behind the sticky footer = clipped / not operable.
    if (footer && r.bottom > footer.top + 1 && r.top < footer.top - 1 &&
        intersect(r, footer).width > 1) {
      findings.push({
        rule: 2, severity: 'major', bbox: bboxArr(r), nodes: [n.id],
        reason: `"${n.text || n.id}" is hard-clipped by the sticky footer (extends ${(r.bottom - footer.top).toFixed(0)}pt behind it).`,
      });
      continue;
    }
    if (footer && r.top >= footer.top - 1 && n.meta?.required) {
      findings.push({
        rule: 2, severity: 'major', bbox: bboxArr(r), nodes: [n.id],
        reason: `Required control "${n.text || n.id}" is entirely concealed under the sticky footer.`,
      });
      continue;
    }
    if (safe && vp) {
      const over = [];
      if (r.top < (safe.top ?? 0) - 1) over.push(`top<${safe.top ?? 0}`);
      if (r.bottom > vp.height - (safe.bottom ?? 0) + 1) over.push(`bottom>${vp.height - (safe.bottom ?? 0)}`);
      if (r.left < (safe.left ?? 0) - 1) over.push(`left<${safe.left ?? 0}`);
      if (r.right > vp.width - (safe.right ?? 0) + 1) over.push(`right>${vp.width - (safe.right ?? 0)}`);
      if (over.length) {
        findings.push({
          rule: 2, severity: 'major', bbox: bboxArr(r), nodes: [n.id],
          reason: `"${n.text || n.id}" extends outside the safe area / viewport (${over.join(', ')}).`,
        });
      }
    }
  }
  return findings;
}

// Rule 3 — Truncation / context. Essential labels cannot truncate (ellipsis) at font scale
// ≤ AX1; where expectedText is supplied, a shorter rendered string flags truncation.
export function ruleTruncation(tree, ctx) {
  const findings = [];
  const ax = ctx.fontScale ?? 1.0;
  for (const n of tree.texts) {
    if (!n.meta?.essential) continue;
    const expected = n.meta.expectedText;
    if (expected && ax <= 1.35 /* ≤ AX1 */) {
      const truncated = n.meta.ellipsized === true ||
        (typeof n.text === 'string' && n.text.replace(/[……]/g, '').trim() !== expected.trim() &&
          expected.startsWith(n.text.replace(/[……]/g, '').trim().slice(0, -1)));
      if (truncated) {
        findings.push({
          rule: 3, severity: 'major', bbox: bboxArr(n.bbox), nodes: [n.id],
          reason: `Essential label truncated at font scale ${ax}: rendered "${n.text}" ≠ expected "${expected}".`,
        });
      }
    }
  }
  return findings;
}

// Rule 4 — Spacing / alignment. ≥8pt between independent controls (and switch↔label);
// ≤4pt deviation from a declared alignment anchor; header ≤32pt below modal content origin.
export function ruleSpacing(tree, ctx) {
  const findings = [];
  // Header-below-modal-origin.
  if (ctx.modalOrigin != null && ctx.header) {
    const offset = ctx.header.bbox.top - ctx.modalOrigin;
    if (offset > HEADER_MAX_OFFSET + 1) {
      findings.push({
        rule: 4, severity: 'major', bbox: bboxArr(ctx.header.bbox), nodes: [ctx.header.id],
        reason: `Header starts ${offset.toFixed(0)}pt below the modal content origin (> ${HEADER_MAX_OFFSET}pt) — excessive dead space.`,
      });
    }
  }
  // Switch ↔ its label need ≥8pt gap and must not collide.
  for (const control of tree.controls) {
    if (!control.meta?.isSwitch || control.meta?.labelId == null) continue;
    const label = tree.byId.get(control.meta.labelId);
    if (!label) continue;
    const gap = horizontalGap(control.bbox, label.bbox);
    if (gap < MIN_SPACING - 0.5) {
      findings.push({
        rule: 4, severity: 'major', bbox: bboxArr(control.bbox), nodes: [control.id, label.id],
        reason: `Switch "${label.text || control.id}" has only ${gap.toFixed(1)}pt to its label (< ${MIN_SPACING}pt).`,
      });
    }
  }
  return findings;
}

function horizontalGap(a, b) {
  if (a.right <= b.left) return b.left - a.right;
  if (b.right <= a.left) return a.left - b.right;
  // Overlapping horizontally — negative gap = overlap depth.
  return -(Math.min(a.right, b.right) - Math.max(a.left, b.left));
}

// Rule 5 — Tap targets. Effective (clipped) usable region ≥44×44pt iOS / ≥48×48dp Android
// AND ≥8pt edge gap to the nearest sibling target.
export function ruleTapTargets(tree, ctx) {
  const findings = [];
  const min = (ctx.platform === 'android') ? ANDROID_MIN_TARGET : IOS_MIN_TARGET;
  const targets = tree.controls.filter((n) => n.meta?.tappable !== false);
  for (const t of targets) {
    const r = rectOf(t);
    const w = r.right - r.left;
    const h = r.bottom - r.top;
    const clip = t.meta?.scrollViewport;
    if (clip) {
      if (!['left', 'top', 'right', 'bottom'].every(k => Number.isFinite(clip[k]))) {
        throw new Error('Malformed measured scroll viewport');
      }
      const paintedW = Math.max(0, Math.min(r.right, clip.right) - Math.max(r.left, clip.left));
      const paintedH = Math.max(0, Math.min(r.bottom, clip.bottom) - Math.max(r.top, clip.top));
      if ((paintedW < min - 0.5 || paintedH < min - 0.5) && w >= min - 0.5 && h >= min - 0.5) {
        findings.push({ rule: 5, severity: 'major', bbox: bboxArr(r), nodes: [t.id],
          reason: 'Measured scroll clipping leaves an undersized painted target; raw size does not prove an operable reachable target.' });
      }
    }
    if (w < min - 0.5 || h < min - 0.5) {
      findings.push({
        rule: 5, severity: 'major', bbox: bboxArr(r), nodes: [t.id],
        reason: `Tap target "${t.text || t.id}" effective size ${w.toFixed(0)}×${h.toFixed(0)} < ${min}×${min}.`,
      });
    }
  }
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i], b = targets[j];
      if (isAncestor(tree, a.id, b.id) || isAncestor(tree, b.id, a.id)) continue;
      const gx = horizontalGap(rectOf(a), rectOf(b));
      const gy = horizontalGap(
        { left: rectOf(a).top, right: rectOf(a).bottom },
        { left: rectOf(b).top, right: rectOf(b).bottom },
      );
      // Edge gap applies only to siblings sharing a row or column.
      const sharesRow = intersect(
        { left: rectOf(a).top, right: rectOf(a).bottom, top: 0, bottom: 1 },
        { left: rectOf(b).top, right: rectOf(b).bottom, top: 0, bottom: 1 },
      ).width > 0;
      const sharesCol = intersect(
        { left: rectOf(a).left, right: rectOf(a).right, top: 0, bottom: 1 },
        { left: rectOf(b).left, right: rectOf(b).right, top: 0, bottom: 1 },
      ).width > 0;
      if (sharesRow && gx >= 0 && gx < MIN_SPACING - 0.5) {
        findings.push({
          rule: 5, severity: 'major', bbox: bboxArr(rectOf(a)), nodes: [a.id, b.id],
          reason: `Sibling tap targets "${a.text || a.id}" and "${b.text || b.id}" are ${gx.toFixed(1)}pt apart (< ${MIN_SPACING}pt edge gap).`,
        });
      } else if (sharesCol && gy >= 0 && gy < MIN_SPACING - 0.5) {
        findings.push({
          rule: 5, severity: 'major', bbox: bboxArr(rectOf(a)), nodes: [a.id, b.id],
          reason: `Stacked tap targets "${a.text || a.id}" and "${b.text || b.id}" are ${gy.toFixed(1)}pt apart (< ${MIN_SPACING}pt edge gap).`,
        });
      }
    }
  }
  return findings;
}

// Rule 6 — Alignment / indent detail. Section children left-align within 4pt of the section
// grid anchor; row siblings' vertical centers within 2pt.
export function ruleAlignment(tree) {
  const findings = [];
  const sections = new Map(); // sectionGrid anchor -> children
  for (const n of tree.nodes) {
    if (n.meta?.sectionGrid == null) continue;
    const key = String(n.meta.sectionGrid);
    if (!sections.has(key)) sections.set(key, { anchor: n.meta.sectionGrid, children: [] });
    sections.get(key).children.push(n);
  }
  for (const { anchor, children } of sections.values()) {
    for (const c of children) {
      const dev = Math.abs(c.bbox.left - anchor);
      if (dev > ALIGN_TOL + 0.5) {
        findings.push({
          rule: 6, severity: c.meta?.severity || 'minor', bbox: bboxArr(c.bbox), nodes: [c.id],
          reason: `"${c.text || c.id}" is indented ${dev.toFixed(0)}pt from the section grid (x=${anchor}); > ${ALIGN_TOL}pt.`,
        });
      }
    }
  }
  // Row-sibling vertical centers.
  const rows = new Map();
  for (const n of tree.nodes) {
    if (n.meta?.rowGroup == null) continue;
    const k = String(n.meta.rowGroup);
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(n);
  }
  for (const members of rows.values()) {
    if (members.length < 2) continue;
    const centers = members.map((m) => (m.bbox.top + m.bbox.bottom) / 2);
    const spread = Math.max(...centers) - Math.min(...centers);
    if (spread > ROW_CENTER_TOL + 0.5) {
      findings.push({
        rule: 6, severity: 'minor', bbox: bboxArr(members[0].bbox), nodes: members.map((m) => m.id),
        reason: `Row siblings' vertical centers vary by ${spread.toFixed(1)}pt (> ${ROW_CENTER_TOL}pt).`,
      });
    }
  }
  return findings;
}

// Rule 7 — State legibility (vision-primary). Deterministic hook only: when measured
// thumb/track colors are supplied, a switch whose thumb↔track contrast is below the declared
// minimum (or renders as an unlabeled dark pill) flags; otherwise the vision layer owns it.
export function ruleStateLegibility(tree, ctx) {
  const findings = [];
  const minContrast = ctx.minSwitchContrast ?? 1.3;
  for (const control of tree.controls) {
    if (!control.meta?.isSwitch) continue;
    const { thumbColor, trackColor } = control.meta;
    if (thumbColor == null || trackColor == null) continue; // vision owns it
    const c = contrastRatio(thumbColor, trackColor);
    if (c < minContrast) {
      findings.push({
        rule: 7, severity: 'major', bbox: bboxArr(control.bbox), nodes: [control.id],
        reason: `Switch "${control.text || control.id}" thumb/track contrast ${c.toFixed(2)} < ${minContrast} — reads as an unlabeled dark pill.`,
      });
    }
  }
  return findings;
}

function luminance([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const RULES = {
  1: ruleOverlap,
  2: ruleClipping,
  3: ruleTruncation,
  4: ruleSpacing,
  5: ruleTapTargets,
  6: ruleAlignment,
  7: ruleStateLegibility,
};

// Run rules 1–7 over one checkpoint's normalized tree. Rule 8 (flow completion) is the
// aggregate assertion enforced by run-geometry.mjs across every checkpoint of a flow.
export function evaluateCheckpoint(nodes, ctx = {}) {
  const tree = indexTree(nodes);
  const findings = [];
  for (const id of Object.keys(RULES)) {
    findings.push(...RULES[id](tree, ctx));
  }
  return { findings, verdict: findings.length === 0 ? 'pass' : 'fail' };
}
