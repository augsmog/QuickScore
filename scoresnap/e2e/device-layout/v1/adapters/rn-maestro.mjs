// device-layout/v1 adapter — React Native / Expo (SnapScore; parents' game AUG-1024
// if it is RN). Pure transform: Maestro `captureHierarchy` JSON → normalized element
// tree (schema.mjs ELEMENT_NODE_SCHEMA). No device/Maestro execution here; the harness
// captures the hierarchy, this maps it. Format reference:
// scoresnap/.maestro/fixtures/retained-20261114/*-hierarchy.json.

export const ADAPTER = 'rn-maestro';

// Maestro bounds are "[x,y][x2,y2]" (absolute px). Returns a logical rect, scaling by
// `density` when the hierarchy is in physical px (Android); iOS hierarchies are already
// in points (density=1).
export function parseBounds(bounds, density = 1) {
  const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(String(bounds || '').trim());
  if (!m) return null;
  const [x1, y1, x2, y2] = m.slice(1).map(Number).map((v) => v / density);
  return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
}

const INTERACTIVE_RESOURCE = /button|switch|toggle|input|field|tab|chip|cell|row|link|checkbox/i;
function roleFor(attrs) {
  const cls = String(attrs.className || attrs.class || '').toLowerCase();
  const id = String(attrs['resource-id'] || attrs.resourceId || '').toLowerCase();
  if (/switch|toggle/.test(cls + id)) return 'switch';
  if (/textfield|edittext|input/.test(cls + id)) return 'input';
  if (/button|link/.test(cls + id)) return 'button';
  if (attrs.text) return 'text';
  return 'container';
}
function isInteractive(attrs, role) {
  if (['switch', 'input', 'button'].includes(role)) return true;
  if (attrs.clickable === true || attrs.clickable === 'true') return true;
  return INTERACTIVE_RESOURCE.test(String(attrs['resource-id'] || attrs.resourceId || ''));
}

export function rnMaestroToTree(node, { density = 1, idPrefix = '' } = {}) {
  let counter = 0;
  const walk = (n, path) => {
    const attrs = n.attributes || n;
    const bbox = parseBounds(attrs.bounds, density) || { x: 0, y: 0, width: 0, height: 0 };
    const role = roleFor(attrs);
    const id = attrs['resource-id'] || attrs.resourceId || attrs.accessibilityText || `${path}:${role}:${counter++}`;
    const interactive = isInteractive(attrs, role);
    const el = {
      id: String(idPrefix ? `${idPrefix}/${id}` : id),
      role,
      text: attrs.text != null ? String(attrs.text) : null,
      bbox,
      hitRegion: interactive ? { ...bbox } : null,
      scrollState: attrs.scrollable ? { scrollable: true, scrollX: 0, scrollY: 0, contentWidth: bbox.width, contentHeight: bbox.height } : null,
      clip: null,
      children: (n.children || []).map((c) => walk(c, `${path}.${role}`)),
    };
    return el;
  };
  return walk(node, idPrefix || 'root');
}
