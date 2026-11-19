// device-layout/v1 — versioned, repo-agnostic config/receipt/waiver/element-tree
// schemas plus a dependency-free structural validator. No browser or repo imports:
// the package is intended to be promoted to a shared home and consumed by both the
// SnapScore (RN/Maestro) and Locker Room Defense (Godot Control-tree) adapters, so it
// must stay pure JS runnable under `node --test`.
//
// Source of truth: /workspace/aos-state/reports/2026-11-19-device-gate-t1547u/
//   RECONCILED-PLAN.md §F (packaging), §B (rules, vision rubric, waivers) — owner t1547u.

export const VERSION = 'device-layout/v1';

// ---------------------------------------------------------------------------
// Minimal structural validator. Supports the subset of JSON-Schema we use:
// type (string|number|integer|boolean|object|array|null + unions), enum,
// required, properties, items, minimum, minItems, pattern, additionalProperties.
// Returns {valid, errors:[{path, message}]}. Deliberately tiny — we add no deps
// (ajv is not in package.json and new box installs need the owner's yes).
// ---------------------------------------------------------------------------
function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v; // 'number' for non-integer numbers, 'string', 'boolean', 'object'
}
function typeMatches(expected, actual) {
  const list = Array.isArray(expected) ? expected : [expected];
  return list.some((t) => (t === 'number' ? actual === 'number' || actual === 'integer' : t === actual));
}

export function validate(schema, value, path = '$') {
  const errors = [];
  const push = (p, message) => errors.push({ path: p, message });
  const walk = (node, val, p) => {
    if (node.type && !typeMatches(node.type, typeOf(val))) {
      push(p, `expected ${JSON.stringify(node.type)}, got ${typeOf(val)}`);
      return; // type mismatch makes deeper checks meaningless
    }
    if (node.enum && !node.enum.includes(val)) {
      push(p, `${JSON.stringify(val)} not in enum ${JSON.stringify(node.enum)}`);
    }
    if (node.pattern && typeof val === 'string' && !new RegExp(node.pattern).test(val)) {
      push(p, `does not match /${node.pattern}/`);
    }
    if (typeof val === 'number') {
      if (node.minimum !== undefined && val < node.minimum) push(p, `< minimum ${node.minimum}`);
      if (node.maximum !== undefined && val > node.maximum) push(p, `> maximum ${node.maximum}`);
    }
    if (typeOf(val) === 'object' && node.properties) {
      for (const key of node.required || []) {
        if (!(key in val)) push(`${p}.${key}`, 'is required');
      }
      for (const [key, child] of Object.entries(node.properties)) {
        if (key in val) walk(child, val[key], `${p}.${key}`);
      }
      if (node.additionalProperties === false) {
        for (const key of Object.keys(val)) {
          if (!(key in node.properties)) push(`${p}.${key}`, 'is not an allowed property');
        }
      }
    }
    if (typeOf(val) === 'array') {
      if (node.minItems !== undefined && val.length < node.minItems) push(p, `fewer than ${node.minItems} items`);
      if (node.items) val.forEach((item, i) => walk(node.items, item, `${p}[${i}]`));
    }
  };
  walk(schema, value, path);
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------
const SHA = { type: 'string', pattern: '^[0-9a-f]{7,64}$' };
const RECT = {
  type: 'object',
  required: ['x', 'y', 'width', 'height'],
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    width: { type: 'number', minimum: 0 },
    height: { type: 'number', minimum: 0 },
  },
};

// Normalized element tree node — the common currency every adapter must emit and
// the geometry checker + vision step consume (§F).
export const ELEMENT_NODE_SCHEMA = {
  type: 'object',
  required: ['id', 'role', 'bbox'],
  properties: {
    id: { type: 'string' },
    role: { type: 'string' },
    text: { type: ['string', 'null'] },
    bbox: RECT,
    // null for non-interactive elements; otherwise the *effective* usable region
    // (may differ from bbox after padding/clipping).
    hitRegion: { type: ['object', 'null'], required: RECT.required, properties: RECT.properties },
    scrollState: {
      type: ['object', 'null'],
      properties: {
        scrollable: { type: 'boolean' },
        scrollX: { type: 'number' },
        scrollY: { type: 'number' },
        contentWidth: { type: 'number' },
        contentHeight: { type: 'number' },
      },
    },
    // ancestor clip applied to this node (viewport/safe-area/keyboard/footer), if any
    clip: { type: ['object', 'null'], required: RECT.required, properties: RECT.properties },
    children: { type: 'array' }, // recursively element nodes; validated by walkTree
  },
};

const DEVICE_SCHEMA = {
  type: 'object',
  required: ['id', 'platform', 'profile', 'logical', 'runner'],
  properties: {
    id: { type: 'string' },
    platform: { type: 'string', enum: ['ios', 'android'] },
    profile: { type: 'string' },
    logical: { type: 'object', required: ['width', 'height'], properties: { width: { type: 'number', minimum: 1 }, height: { type: 'number', minimum: 1 } } },
    density: { type: 'number', minimum: 1 },
    os: { type: ['string', 'number'] },
    fontScale: { type: 'number', minimum: 0.5 },
    runner: { type: 'string' },
    cadence: { type: 'string', enum: ['pr', 'nightly'] },
  },
};

const RULE_SCHEMA = {
  type: 'object',
  required: ['id', 'name', 'layer'],
  properties: {
    id: { type: 'integer', minimum: 1, maximum: 8 },
    name: { type: 'string' },
    layer: { type: 'string', enum: ['geometry', 'vision', 'both'] },
    contract: { type: 'object' }, // thresholds; shape per rule, checked by geometry.mjs
  },
};

export const WAIVER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ruleId', 'screen', 'reason', 'evidence', 'approvedBy', 'ticket', 'expires'],
  properties: {
    ruleId: { type: 'integer', minimum: 1, maximum: 8 },
    screen: { type: 'string' },
    deviceId: { type: ['string', 'null'] },
    state: { type: ['string', 'null'] },
    reason: { type: 'string' },
    evidence: { type: 'string' },
    approvedBy: { type: 'string' }, // named independent reviewer
    ticket: { type: 'string', pattern: '^AUG-[0-9]+$' },
    expires: { type: 'string' }, // ISO-8601 date
  },
};

export const RECEIPT_SCHEMA = {
  type: 'object',
  required: ['sourceSha', 'buildHash', 'artifactHash', 'device', 'flow', 'checkpoint', 'reviewer', 'findings', 'verdict'],
  properties: {
    sourceSha: SHA,
    buildHash: SHA,
    artifactHash: SHA,
    device: { type: 'string' },
    flow: { type: 'string' },
    checkpoint: { type: 'string' },
    reviewer: {
      type: 'object',
      required: ['provider', 'model', 'effort'],
      properties: {
        provider: { type: 'string' }, // 'openai' | 'anthropic' (never 'grok' / 'xai')
        model: { type: 'string' },
        effort: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['rule', 'severity', 'reason'],
        properties: {
          rule: { type: 'integer', minimum: 1, maximum: 8 },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          bbox: { type: ['array', 'null'] },
          reason: { type: 'string' },
        },
      },
    },
    verdict: { type: 'string', enum: ['pass', 'fail'] },
  },
};

export const CONFIG_SCHEMA = {
  type: 'object',
  required: ['schema', 'product', 'adapter', 'provenance', 'devices', 'flows', 'rules', 'reviewerPolicy', 'retention'],
  properties: {
    schema: { type: 'string', enum: [VERSION] },
    product: { type: 'string' },
    adapter: { type: 'string', enum: ['rn-maestro', 'godot-control'] },
    provenance: {
      type: 'object',
      required: ['sourceSha', 'buildHash', 'configHash'],
      properties: { sourceSha: SHA, buildHash: SHA, configHash: SHA },
    },
    devices: { type: 'array', minItems: 1, items: DEVICE_SCHEMA },
    flows: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'checkpoints'],
        properties: {
          id: { type: 'string' },
          states: { type: 'array', items: { type: 'string' } },
          checkpoints: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
      },
    },
    rules: { type: 'array', minItems: 1, items: RULE_SCHEMA },
    reviewerPolicy: {
      type: 'object',
      required: ['builder'],
      properties: {
        builder: { type: 'string', enum: ['anthropic', 'openai'] },
        provider: { type: 'string' },
        model: { type: 'string' },
        effort: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
    },
    waivers: { type: 'array', items: WAIVER_SCHEMA },
    fixtures: {
      type: 'object',
      properties: {
        negative: { type: 'array', items: { type: 'object', required: ['image', 'sha256'], properties: { image: { type: 'string' }, sha256: { type: 'string' }, expectDefect: { type: 'string' } } } },
        positive: { type: 'array', items: { type: 'object' } },
      },
    },
    retention: {
      type: 'object',
      required: ['passDays', 'failDays'],
      properties: { passDays: { type: 'integer', minimum: 1 }, failDays: { type: 'integer', minimum: 1 } },
    },
  },
};

// Validate an element tree recursively (the structural validator does not recurse
// into `children`, which is self-referential).
export function validateElementTree(root) {
  const errors = [];
  const walk = (node, p) => {
    const r = validate(ELEMENT_NODE_SCHEMA, node, p);
    errors.push(...r.errors);
    for (const [i, child] of (node.children || []).entries()) walk(child, `${p}.children[${i}]`);
  };
  walk(root, '$');
  return { valid: errors.length === 0, errors };
}
