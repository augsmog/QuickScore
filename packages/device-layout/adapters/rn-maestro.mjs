// React Native / Expo adapter for a Maestro view hierarchy (ported from PR #342
// scoresnap/e2e/device-layout/v1/adapters/rn-maestro.mjs and re-targeted at the
// canonical device-layout/snapshot/v1 shape). Pure transform: this does NOT run
// Maestro or a simulator, and a passing fixture transform is not proof that a
// native build lays out correctly (AUG-1385 wires real capture).
import {SNAPSHOT_SCHEMA} from '../src/rules.mjs';

export const ADAPTER = 'rn-maestro';

// Maestro bounds are "[x1,y1][x2,y2]" in absolute px. Android hierarchies are in
// physical px (divide by density); iOS hierarchies are already points (density 1).
export function parseBounds(bounds, density = 1) {
  const m = /^\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]$/.exec(String(bounds ?? '').trim());
  if (!m) return null;
  const [left, top, right, bottom] = m.slice(1).map(Number).map(v => v / density);
  return {left, top, right, bottom};
}

const INTERACTIVE_ID = /button|switch|toggle|input|field|tab|chip|cell|row|link|checkbox/i;
const truthy = v => v === true || v === 'true';

export function fromMaestroHierarchy(root, {device, screen, density = 1, viewport, screenshot = null, provenance} = {}) {
  if (!root || typeof root !== 'object') throw new Error('maestro hierarchy must be an object');
  if (!device || !screen) throw new Error('device and screen are required');
  const targets = [], texts = [];
  const walk = (node, parentTarget) => {
    const a = node.attributes ?? node;
    if (a.visible !== false && a.visible !== 'false') {
      const r = parseBounds(a.bounds, density);
      const rid = String(a['resource-id'] ?? a.resourceId ?? '');
      const cls = String(a.className ?? a.class ?? '');
      const label = a.accessibilityText ?? a.text ?? rid;
      const interactive = truthy(a.clickable) || /button|switch|toggle|textfield|edittext|input/i.test(cls + rid) || INTERACTIVE_ID.test(rid);
      let self = parentTarget;
      if (r && interactive) {
        self = targets.length;
        targets.push({id: self, name: String(label || `target-${self}`), ...r, ...(parentTarget != null ? {parentId: parentTarget} : {})});
      } else if (r && typeof a.text === 'string' && a.text.trim()) {
        texts.push({name: a.text.trim().slice(0, 80), ...r, owners: parentTarget != null ? [parentTarget] : []});
      }
      for (const c of node.children ?? []) walk(c, self);
    }
  };
  walk(root, null);
  return {schema: SNAPSHOT_SCHEMA, device, screen, screenshot, source: 'maestro/hierarchy', ...(viewport ? {viewport} : {}), ...(provenance ? {provenance} : {}), targets, texts};
}
