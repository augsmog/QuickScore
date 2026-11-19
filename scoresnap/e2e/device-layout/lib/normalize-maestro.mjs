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
//
// Two shapes of "not a real element" are handled so they are never scored as app geometry
// (AUG-1376 — the Android/iOS native captures both carry them, and #343's fail-closed geometry
// validator correctly rejects zero-size measured leaves):
//
//  1. STRUCTURAL WRAPPERS — the OS reports a window-root / decor chain whose `bounds` attribute
//     is absent (Android: no `bounds` at all) or degenerate (iOS: `[0,0][0,0]`). These are not
//     measured elements; emitting them as zero-bbox nodes trips the validator. We drop them and
//     re-parent their children onto the nearest measured ancestor (or null).
//
//  2. SYSTEM CHROME — the capture includes the OS status bar / navigation (gesture) taskbar /
//     launcher, rendered OUTSIDE the app window (e.g. `com.android.systemui:*` at the top strip,
//     `com.android.launcher3:id/taskbar_container` at the bottom strip, or the iOS status-bar
//     overlay window). These must never be scored as app controls. When the caller supplies the
//     logical viewport we keep only the app window(s) (a top-level survivor covering the full
//     viewport width and ≥70% of its height) and treat every other top-level survivor as system
//     chrome — removing it and folding its extent into the measured safe-area insets so the
//     usable viewport still accounts for the bars.

const BOUNDS_RE = /\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/;

export function parseBounds(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(BOUNDS_RE);
  if (!m) return null;
  const [, l, t, r, b] = m.map(Number);
  return { left: l, top: t, right: r, bottom: b };
}

// A real measured rectangle is finite with positive width AND height. Anything else (missing
// bounds, `[0,0][0,0]`, inverted) is a structural wrapper, not geometry.
function positiveRect(r) {
  return !!r && Number.isFinite(r.left) && Number.isFinite(r.top) &&
    Number.isFinite(r.right) && Number.isFinite(r.bottom) &&
    r.right > r.left && r.bottom > r.top;
}

// Android OS-rendered packages (status bar, gesture nav / taskbar, launcher). Nodes under these
// are system chrome even when they carry finite bounds. Used as a secondary signal (the primary
// signal is the full-viewport app-window test) so Android chrome is still dropped when no viewport
// is supplied.
const SYSTEM_UI_PACKAGES = new Set([
  'com.android.systemui',
  'com.android.launcher3',
  'com.google.android.apps.nexuslauncher',
]);
function systemPackage(resourceId) {
  if (!resourceId || typeof resourceId !== 'string') return false;
  const i = resourceId.indexOf(':');
  return SYSTEM_UI_PACKAGES.has(i >= 0 ? resourceId.slice(0, i) : resourceId);
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
// Returns { nodes, chrome, safeArea }:
//   nodes      — normalized element list (structural wrappers + system chrome removed)
//   chrome     — the removed system-chrome node bboxes (for diagnostics)
//   safeArea   — measured insets derived from the chrome bars ({top,bottom,left,right}), or null
//                when no viewport was supplied / no chrome detected.
export function normalizeMaestroCapture(root, options = {}) {
  const { density = 1, resourceMeta = {}, scrollState = null, viewport = null } = options;
  const nodes = [];
  let counter = 0;
  const scale = (r) => r && ({
    left: r.left / density, top: r.top / density,
    right: r.right / density, bottom: r.bottom / density,
  });
  // Parent → children keyed by node OBJECT reference (resource-ids are NOT unique across a native
  // hierarchy, so a string-id graph can form false cycles). `null` holds the top-level survivors.
  const childrenOf = new Map([[null, []]]);

  // Flatten, dropping structural wrappers (no positive-area bounds) and re-parenting their
  // children onto the nearest measured ancestor. `depth` is carried through skipped wrappers so
  // the first real measured node keeps depth 0 (anchors the checkpoint scrollState).
  function walk(raw, parentNode, depth) {
    const a = raw.attributes || {};
    const resourceId = a['resource-id'] || '';
    const bounds = scale(parseBounds(a.bounds));
    if (!positiveRect(bounds)) {
      // Structural wrapper — not a measured element. Re-parent its children, do not emit it.
      for (const child of raw.children || []) walk(child, parentNode, depth);
      return null;
    }
    const override = resourceMeta[resourceId] || {};
    const id = resourceId || `n${counter++}`;
    const role = inferRole(a, resourceId, override.role);
    const node = {
      id, role,
      text: visibleText(a),
      bbox: bounds,
      hitRegion: override.hitRegion || bounds,
      scrollState: override.scrollState ?? (depth === 0 ? scrollState : null),
      enabled: a.enabled === 'true' || a.enabled === true,
      selected: a.selected === 'true' || a.selected === true,
      checked: a.checked === 'true' || a.checked === true,
      focused: a.focused === 'true' || a.focused === true,
      parentId: parentNode ? parentNode.id : null,
      meta: { depth, resourceId, systemPackage: systemPackage(resourceId), ...override.meta },
    };
    nodes.push(node);
    childrenOf.set(node, []);
    childrenOf.get(parentNode).push(node);
    for (const child of raw.children || []) walk(child, node, depth + 1);
    return node;
  }
  walk(root, null, 0);

  const { kept, chrome, safeArea } = stripSystemChrome(nodes, childrenOf, viewport);
  for (const n of kept) delete n.meta.systemPackage; // internal marker, not part of the schema
  return { nodes: kept, chrome, safeArea };
}

// Decide which top-level survivors are the app window(s) and drop the rest (system chrome).
// Top-level = parentId null. App window = covers the full viewport width and ≥70% of its height
// (the OS status/nav bars are thin edge strips, well under that). Every other top-level survivor
// — and its whole subtree — is system chrome. With no viewport we can't locate the app window, so
// we fall back to dropping only subtrees rooted at a known Android system-UI package.
function stripSystemChrome(nodes, childrenOf, viewport) {
  const drop = new Set();
  const chrome = [];
  const markChrome = (root) => {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (drop.has(n)) continue;
      drop.add(n);
      chrome.push({ id: n.id, bbox: n.bbox });
      for (const c of childrenOf.get(n) || []) stack.push(c);
    }
  };

  const tops = childrenOf.get(null) || [];
  if (viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height)) {
    const TOL = 2;
    const isAppWindow = (n) =>
      Math.abs((n.bbox.right - n.bbox.left) - viewport.width) <= TOL &&
      (n.bbox.bottom - n.bbox.top) >= viewport.height * 0.7;
    const appWindows = tops.filter(isAppWindow);
    // Only strip when we actually found an app window — otherwise keep everything rather than risk
    // nuking real content on an unexpected shape.
    if (appWindows.length) {
      for (const t of tops) if (!appWindows.includes(t)) markChrome(t);
    }
  } else {
    // No viewport: still drop Android OS chrome identified by resource-id package anywhere in tree.
    for (const n of nodes) if (n.meta.systemPackage) markChrome(n);
  }

  let kept = nodes.filter((n) => !drop.has(n));
  // Full-viewport backdrops are structural, not leaves — even when the OS tags the window root with
  // the app's accessibility name (iOS reports the root as "SnapScore" over the whole screen) or the
  // app stacks a full-screen scrim. Left as a text/control a backdrop "paints over" every real
  // control (rule 1) and is scored as a giant tap target (rule 5). Force every kept node that spans
  // the viewport to a backdrop container so the rules skip it; the real labels/controls are its
  // descendants. Mirrors capture-layout.mjs (`backdrop = spansViewport && targets.length > 1`).
  if (viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height) && kept.length > 1) {
    const TOL = 2;
    for (const n of kept) {
      const spansViewport =
        Math.abs((n.bbox.right - n.bbox.left) - viewport.width) <= TOL &&
        Math.abs((n.bbox.bottom - n.bbox.top) - viewport.height) <= TOL;
      if (spansViewport) {
        n.role = 'container';
        n.meta.backdrop = true;
      }
    }
  }
  const safeArea = measuredSafeArea(chrome, viewport);
  return { kept, chrome, safeArea };
}

// Fold the removed chrome bars into measured safe-area insets: a bar flush to the top edge raises
// the top inset to its bottom; a bar flush to the bottom edge raises the bottom inset. Returns null
// when there is no viewport or no edge chrome to measure.
function measuredSafeArea(chrome, viewport) {
  if (!viewport || !chrome.length) return null;
  const TOL = 2;
  let top = 0;
  let bottom = 0;
  for (const { bbox } of chrome) {
    if (bbox.top <= TOL) top = Math.max(top, bbox.bottom);
    if (bbox.bottom >= viewport.height - TOL) bottom = Math.max(bottom, viewport.height - bbox.top);
  }
  if (top === 0 && bottom === 0) return null;
  return { top, bottom, left: 0, right: 0 };
}

// Backward-compatible flat-array entry point (callers that only need the node list).
export function normalizeMaestroHierarchy(root, options = {}) {
  return normalizeMaestroCapture(root, options).nodes;
}
