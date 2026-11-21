// Maestro adapter — raw `captureHierarchy` JSON → device-layout/v1 normalized element tree.
//
// Maestro records a nested tree of { attributes:{ bounds:"[l,t][r,b]", text, title, value,
// accessibilityText, hintText, resource-id, enabled, selected, checked, focused }, children }.
// (See .maestro/fixtures/retained-20261114/*-hierarchy.json for the real shape.)
//
// We flatten it into a typed node list the geometry engine consumes. We NEVER invent
// geometry: bounds come straight from the capture, scaled by the capture's pixel density to
// logical units so the rule thresholds (pt/dp) are correct. A node's role is inferred from
// its own attributes only; callers may override via a resource-id → meta map (SnapScore uses
// testIDs like `switch:multiDay`, `btn:rounds-2`) so real flows carry precise semantics.

const BOUNDS_RE = /\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/;

export function parseBounds(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(BOUNDS_RE);
  if (!m) return null;
  const [, l, t, r, b] = m.map(Number);
  return { left: l, top: t, right: r, bottom: b };
}

function visibleText(a) {
  return (a.text || a.title || a.value || a.accessibilityText || '').trim();
}

// Role inference from Maestro attributes. `checked`/`selected`/`hintText` or an interactive
// resource-id => control; a node that only carries visible text => text; everything else is a
// structural container (ignored by most rules but kept for ancestry).
function inferRole(a, resourceId, roleHint) {
  if (roleHint) return roleHint;
  const interactive = a.checked === 'true' || a.checked === true ||
    a.selected === 'true' || a.selected === true ||
    (a.hintText && a.hintText.length > 0) ||
    /\b(btn|button|switch|toggle|chip|tab|input|field|cta|link|target)\b/i.test(resourceId || '');
  if (interactive) return 'control';
  if (visibleText(a)) return 'text';
  return 'container';
}

// density: logical = physical / density. Maestro iOS bounds are already in points (density 1
// for the hierarchy), Android bounds are in px (density = dpi/160). Pass the capture's value.
export function normalizeMaestroHierarchy(root, options = {}) {
  const { density = 1, resourceMeta = {}, scrollState = null } = options;
  const nodes = [];
  let counter = 0;
  const scale = (r) => r && ({
    left: r.left / density, top: r.top / density,
    right: r.right / density, bottom: r.bottom / density,
  });

  function walk(raw, parentId, depth) {
    const a = raw.attributes || {};
    const resourceId = a['resource-id'] || '';
    const bounds = scale(parseBounds(a.bounds));
    const override = resourceMeta[resourceId] || {};
    const id = resourceId || `n${counter++}`;
    const role = inferRole(a, resourceId, override.role);
    // A full-viewport leaf with no text is a backdrop/scrim (excluded from overlap, like
    // capture-layout.mjs): mark it so rule 1 skips it.
    const node = {
      id, role,
      text: visibleText(a),
      bbox: bounds || { left: 0, top: 0, right: 0, bottom: 0 },
      hitRegion: override.hitRegion || bounds || { left: 0, top: 0, right: 0, bottom: 0 },
      scrollState: override.scrollState ?? (depth === 0 ? scrollState : null),
      enabled: a.enabled === 'true' || a.enabled === true,
      selected: a.selected === 'true' || a.selected === true,
      checked: a.checked === 'true' || a.checked === true,
      focused: a.focused === 'true' || a.focused === true,
      parentId,
      meta: { depth, resourceId, ...override.meta },
    };
    if (!bounds) node.meta.unparsedBounds = a.bounds || null;
    nodes.push(node);
    for (const child of raw.children || []) walk(child, id, depth + 1);
    return node;
  }

  walk(root, null, 0);
  return nodes;
}
