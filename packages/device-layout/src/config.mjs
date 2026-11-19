// device-layout/v1 config: one device matrix + one rule set per product.
// Hand-rolled validation (no dependencies) so every product repo can vendor
// this package without an npm install. The JSON Schema in ../schema mirrors it.

export const CONFIG_SCHEMA = 'device-layout/v1';
export const CHECKS = ['target-size', 'target-spacing', 'safe-area', 'control-overlap', 'text-over-control', 'offscreen', 'unsupported-geometry'];
// Platform floors (AUG-1373 rule 5): 44x44pt iOS, 48x48dp Android. A device or
// rule set may raise the minimum, never lower it below its platform floor.
export const PLATFORM_MIN_TARGET = Object.freeze({ios: {width: 44, height: 44}, android: {width: 48, height: 48}, web: {width: 44, height: 44}});
const CADENCES = ['pr', 'nightly'];
const PLATFORMS = ['ios', 'android', 'web'];
const ORIENTATIONS = ['portrait', 'landscape'];
const SIDES = ['top', 'right', 'bottom', 'left'];
// AUG-1384 contract fields (one v1 contract, reconciled from PR #341 + PR #342).
export const ADAPTERS = ['snapshot', 'snapscore-capture', 'rn-maestro', 'godot'];
export const PROVENANCE_KEYS = ['sourceSha', 'buildHash', 'configHash'];
export const PROVIDERS = ['anthropic', 'openai'];
export const BANNED_PROVIDERS = ['xai', 'grok'];
const SHA256 = /^sha256:[0-9a-f]{64}$/;

const DEFAULT_RULES = Object.freeze({
  minTarget: {width: 44, height: 44},
  subpixelEpsilon: 0.01,
  overlapTolerance: 2,
  minTargetGap: 8,
  checks: CHECKS.slice(),
});

const maxSize = (a, b) => ({width: Math.max(a.width, b.width), height: Math.max(a.height, b.height)});
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
    if (rules.minTargetGap !== undefined && !(isNum(rules.minTargetGap) && rules.minTargetGap >= 0)) err('$.rules.minTargetGap', 'must be >= 0');
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
      else if (d.minTarget !== undefined && PLATFORMS.includes(d.platform)) {
        const floor = PLATFORM_MIN_TARGET[d.platform];
        if (d.minTarget.width < floor.width || d.minTarget.height < floor.height) err(`${p}.minTarget`, `below the ${d.platform} floor ${floor.width}x${floor.height}`);
      }
      if (d.cadence !== undefined && !CADENCES.includes(d.cadence)) err(`${p}.cadence`, `must be one of ${CADENCES.join(', ')}`);
      if (d.fontScales !== undefined && !(Array.isArray(d.fontScales) && d.fontScales.length > 0 && d.fontScales.every(f => typeof f === 'string' || (isNum(f) && f > 0)))) err(`${p}.fontScales`, 'must be a non-empty array of numbers or named sizes (e.g. "AX3")');
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
  validateContract(config, err);
  return {ok: errors.length === 0, errors};
}

// Contract fields every v1 config must declare (AUG-1384 acceptance 2): adapter,
// provenance requirement, flows/states/checkpoints, reviewer policy, fixtures and
// retention. Waivers live in a separate device-layout/waiver/v1 document.
function validateContract(config, err) {
  if (!ADAPTERS.includes(config.adapter)) err('$.adapter', `must be one of ${ADAPTERS.join(', ')}`);
  const prov = config.provenance;
  if (!prov || !Array.isArray(prov.required) || !PROVENANCE_KEYS.every(k => prov.required.includes(k))) {
    err('$.provenance.required', `must list ${PROVENANCE_KEYS.join(', ')} (snapshots and the receipt share them)`);
  }
  if (!Array.isArray(config.flows) || config.flows.length === 0) err('$.flows', 'must be a non-empty array');
  else {
    const seen = new Set();
    config.flows.forEach((f, i) => {
      const p = `$.flows[${i}]`;
      if (!isId(f?.id)) return err(`${p}.id`, 'must be a lowercase id');
      if (seen.has(f.id)) err(`${p}.id`, `duplicate flow "${f.id}"`);
      seen.add(f.id);
      if (f.states !== undefined && !(Array.isArray(f.states) && f.states.every(isId))) err(`${p}.states`, 'must be an array of ids');
      if (!Array.isArray(f.checkpoints) || f.checkpoints.length === 0) err(`${p}.checkpoints`, 'must be a non-empty array');
      else f.checkpoints.forEach((c, j) => { if (!isId(c)) err(`${p}.checkpoints[${j}]`, 'must be an id'); });
    });
  }
  const rp = config.reviewerPolicy;
  if (!rp || typeof rp !== 'object') err('$.reviewerPolicy', 'required');
  else {
    if (!PROVIDERS.includes(rp.builder)) err('$.reviewerPolicy.builder', `must be one of ${PROVIDERS.join(', ')}`);
    if (!PROVIDERS.includes(rp.reviewer?.provider)) err('$.reviewerPolicy.reviewer.provider', `must be one of ${PROVIDERS.join(', ')}`);
    else if (rp.reviewer.provider === rp.builder) err('$.reviewerPolicy.reviewer.provider', 'must differ from the builder (cross-company review)');
    if (typeof rp.reviewer?.model !== 'string' || !rp.reviewer.model) err('$.reviewerPolicy.reviewer.model', 'required');
    if (rp.reviewer?.effort !== 'high') err('$.reviewerPolicy.reviewer.effort', 'must be "high"');
  }
  const fx = config.fixtures;
  if (!fx || !Array.isArray(fx.negative) || fx.negative.length === 0) err('$.fixtures.negative', 'needs at least one negative fixture (rubric-drift check)');
  else for (const kind of ['negative', 'positive']) (fx[kind] ?? []).forEach((f, i) => {
    const p = `$.fixtures.${kind}[${i}]`;
    if (typeof f?.image !== 'string' || !f.image) err(`${p}.image`, 'required');
    // A fixture not yet committed may be declared with artifactHash null + a pending
    // ticket; evaluateVision then fails closed (rubric drift) until it is committed.
    if (f?.artifactHash === null) { if (!/^AUG-\d+$/.test(f?.pendingTicket ?? '')) err(`${p}.pendingTicket`, 'required (AUG-<n>) when artifactHash is null'); }
    else if (!SHA256.test(f?.artifactHash ?? '')) err(`${p}.artifactHash`, 'must be sha256:<64 hex> or null with pendingTicket');
    if (kind === 'negative' && (typeof f?.expectDefect !== 'string' || !f.expectDefect)) err(`${p}.expectDefect`, 'required');
  });
  const ret = config.retention;
  if (!ret || !Number.isInteger(ret.passDays) || ret.passDays < 1 || !Number.isInteger(ret.failDays) || ret.failDays < ret.passDays) {
    err('$.retention', 'needs integer passDays >= 1 and failDays >= passDays');
  }
}

// Resolve defaults so the rules engine never sees an undefined field.
export function resolveConfig(config) {
  const {ok, errors} = validateConfig(config);
  if (!ok) throw new Error(`invalid device-layout config:\n  ${errors.join('\n  ')}`);
  const rules = {...DEFAULT_RULES, ...config.rules, minTarget: {...DEFAULT_RULES.minTarget, ...config.rules?.minTarget}};
  const devices = config.devices.map(d => ({
    ...d,
    safeArea: {top: 0, right: 0, bottom: 0, left: 0, ...d.safeArea},
    minTarget: d.minTarget ?? maxSize(rules.minTarget, PLATFORM_MIN_TARGET[d.platform]),
  }));
  const screens = (config.screens ?? []).map(s => ({required: true, ...s, devices: s.devices ?? devices.map(d => d.id)}));
  return {...config, units: config.units ?? 'pt', rules, devices, screens};
}
