// device-layout/v1 config: one device matrix + one rule set per product.
// Hand-rolled validation (no dependencies) so every product repo can vendor
// this package without an npm install. The JSON Schema in ../schema mirrors it.

export const CONFIG_SCHEMA = 'device-layout/v1';
export const CHECKS = ['target-size', 'safe-area', 'control-overlap', 'text-over-control', 'offscreen', 'unsupported-geometry'];
const PLATFORMS = ['ios', 'android', 'web'];
const ORIENTATIONS = ['portrait', 'landscape'];
const SIDES = ['top', 'right', 'bottom', 'left'];

const DEFAULT_RULES = Object.freeze({
  minTarget: {width: 44, height: 44},
  subpixelEpsilon: 0.01,
  overlapTolerance: 2,
  checks: CHECKS.slice(),
});

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isId = v => typeof v === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(v);

export function validateConfig(config) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {ok: false, errors: ['$: config must be an object']};
  if (config.schema !== CONFIG_SCHEMA) err('$.schema', `must be "${CONFIG_SCHEMA}"`);
  if (!isId(config.product)) err('$.product', 'must be a lowercase id');
  if (config.units !== undefined && !['pt', 'dp', 'css-px'].includes(config.units)) err('$.units', 'must be pt, dp or css-px');

  const rules = config.rules ?? {};
  if (typeof rules !== 'object' || Array.isArray(rules)) err('$.rules', 'must be an object');
  else {
    if (rules.minTarget !== undefined && !(isNum(rules.minTarget?.width) && isNum(rules.minTarget?.height) && rules.minTarget.width > 0 && rules.minTarget.height > 0)) err('$.rules.minTarget', 'needs positive width and height');
    if (rules.subpixelEpsilon !== undefined && !(isNum(rules.subpixelEpsilon) && rules.subpixelEpsilon >= 0 && rules.subpixelEpsilon < 1)) err('$.rules.subpixelEpsilon', 'must be in [0,1)');
    if (rules.overlapTolerance !== undefined && !(isNum(rules.overlapTolerance) && rules.overlapTolerance >= 0)) err('$.rules.overlapTolerance', 'must be >= 0');
    if (rules.checks !== undefined) {
      if (!Array.isArray(rules.checks) || rules.checks.length === 0) err('$.rules.checks', 'must be a non-empty array');
      else rules.checks.forEach((c, i) => { if (!CHECKS.includes(c)) err(`$.rules.checks[${i}]`, `unknown check "${c}"`); });
    }
  }

  if (!Array.isArray(config.devices) || config.devices.length === 0) err('$.devices', 'must be a non-empty array');
  else {
    const seen = new Set();
    config.devices.forEach((d, i) => {
      const p = `$.devices[${i}]`;
      if (!isId(d?.id)) return err(`${p}.id`, 'must be a lowercase id');
      if (seen.has(d.id)) err(`${p}.id`, `duplicate device "${d.id}"`);
      seen.add(d.id);
      if (!PLATFORMS.includes(d.platform)) err(`${p}.platform`, `must be one of ${PLATFORMS.join(', ')}`);
      if (!ORIENTATIONS.includes(d.orientation)) err(`${p}.orientation`, `must be one of ${ORIENTATIONS.join(', ')}`);
      if (!(isNum(d.width) && d.width > 0 && isNum(d.height) && d.height > 0)) err(p, 'width and height must be positive numbers');
      else if (ORIENTATIONS.includes(d.orientation) && (d.orientation === 'landscape') !== (d.width > d.height)) err(p, `orientation "${d.orientation}" disagrees with ${d.width}x${d.height}`);
      const sa = d.safeArea ?? {};
      for (const s of SIDES) if (sa[s] !== undefined && !(isNum(sa[s]) && sa[s] >= 0)) err(`${p}.safeArea.${s}`, 'must be >= 0');
      if (isNum(d.width) && isNum(d.height) && ((sa.left ?? 0) + (sa.right ?? 0) >= d.width || (sa.top ?? 0) + (sa.bottom ?? 0) >= d.height)) err(`${p}.safeArea`, 'insets leave no usable area');
      if (d.minTarget !== undefined && !(isNum(d.minTarget?.width) && isNum(d.minTarget?.height))) err(`${p}.minTarget`, 'needs width and height');
    });
  }

  if (config.screens !== undefined) {
    if (!Array.isArray(config.screens)) err('$.screens', 'must be an array');
    else {
      const seen = new Set();
      config.screens.forEach((s, i) => {
        if (!isId(s?.id)) return err(`$.screens[${i}].id`, 'must be a lowercase id');
        if (seen.has(s.id)) err(`$.screens[${i}].id`, `duplicate screen "${s.id}"`);
        seen.add(s.id);
        if (s.devices !== undefined && !(Array.isArray(s.devices) && s.devices.every(id => config.devices?.some?.(d => d.id === id)))) err(`$.screens[${i}].devices`, 'must list known device ids');
      });
    }
  }
  return {ok: errors.length === 0, errors};
}

// Resolve defaults so the rules engine never sees an undefined field.
export function resolveConfig(config) {
  const {ok, errors} = validateConfig(config);
  if (!ok) throw new Error(`invalid device-layout config:\n  ${errors.join('\n  ')}`);
  const rules = {...DEFAULT_RULES, ...config.rules, minTarget: {...DEFAULT_RULES.minTarget, ...config.rules?.minTarget}};
  const devices = config.devices.map(d => ({
    ...d,
    safeArea: {top: 0, right: 0, bottom: 0, left: 0, ...d.safeArea},
    minTarget: d.minTarget ?? rules.minTarget,
  }));
  const screens = (config.screens ?? []).map(s => ({required: true, ...s, devices: s.devices ?? devices.map(d => d.id)}));
  return {...config, units: config.units ?? 'pt', rules, devices, screens};
}
