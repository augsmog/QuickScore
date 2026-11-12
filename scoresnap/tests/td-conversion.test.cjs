require('tsx/cjs');
const fs = require('node:fs');
const ts = require('typescript');

function load(relative, dependencies = {}) {
  const source = fs.readFileSync(require.resolve(relative), 'utf8');
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText)((name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected import ${name}`);
  }, module, module.exports);
  return module.exports;
}

const entitlements = load('../src/services/entitlements.ts');
const conversion = load('../src/services/td-conversion.ts', { './entitlements': entitlements });
const tdInfo = (periodType = 'NORMAL', overrides = {}) => ({
  entitlements: { active: { [entitlements.TD_ENTITLEMENT_ID]: {
    isActive: true,
    periodType,
    productIdentifier: 'snapscore.td.annual',
    originalPurchaseDate: '2026-11-10T12:00:00Z',
    store: 'APP_STORE',
    ...overrides,
  } } },
});

test('free to TD normal produces one stable entitlement-period event', () => {
  const free = { entitlements: { active: {} } };
  const started = conversion.tdConversionEvent(null, tdInfo());
  expect(conversion.tdConversionEvent(null, free)).toBeNull();
  expect(started).toEqual({
    key: 'snapscore.td.annual|2026-11-10T12:00:00Z|normal',
    event: { period_type: 'normal', product_id: 'snapscore.td.annual', store: 'APP_STORE' },
  });
  expect(conversion.tdConversionEvent(started.key, tdInfo())).toBeNull();
});

test('trial starts are reported separately and a later normal period emits once', () => {
  const trial = conversion.tdConversionEvent(null, tdInfo('TRIAL'));
  expect(trial.event.period_type).toBe('trial');
  const normal = conversion.tdConversionEvent(trial.key, tdInfo('NORMAL'));
  expect(normal.event.period_type).toBe('normal');
  expect(conversion.tdConversionEvent(normal.key, tdInfo('NORMAL'))).toBeNull();
});

test('Pro-only, absent and inactive TD entitlements do not emit', () => {
  const noEntitlement = { entitlements: { active: {} } };
  const proOnly = { entitlements: { active: { [entitlements.ENTITLEMENT_ID]: { isActive: true } } } };
  expect(conversion.tdConversionEvent(null, noEntitlement)).toBeNull();
  expect(conversion.tdConversionEvent(null, proOnly)).toBeNull();
  expect(conversion.tdConversionEvent(null, tdInfo('NORMAL', { isActive: false }))).toBeNull();
});

test('flag on and off produce the same raw TD event', () => {
  const original = entitlements.proEnabled();
  try {
    entitlements.setProEnabled(false);
    const flagOff = conversion.tdConversionEvent(null, tdInfo());
    entitlements.setProEnabled(true);
    const flagOn = conversion.tdConversionEvent(null, tdInfo());
    expect(flagOn).toEqual(flagOff);
  } finally {
    entitlements.setProEnabled(original);
  }
});
