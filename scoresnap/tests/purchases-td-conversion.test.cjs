const fs = require('node:fs');
const ts = require('typescript');
const entitlements = require('../src/services/entitlements.ts');

const storage = new Map();
const seenKey = 'snapscore.td-conversion-seen.v1';
const logger = { tournamentDirectorEntitlementStarted: jest.fn() };
const scanState = { setTier: jest.fn() };
let customerInfo;
let listener;
const sdk = {
  configure: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn((callback) => { listener = callback; }),
  getCustomerInfo: jest.fn(async () => customerInfo),
};

function loadPurchases() {
  const module = { exports: {} };
  const source = fs.readFileSync(require.resolve('../src/services/purchases.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const deps = {
    'react-native': { Platform: { OS: 'ios' }, NativeModules: { RNPurchases: {} } },
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
    },
    '@sentry/react-native': { captureException: jest.fn() },
    'react-native-purchases': { __esModule: true, default: sdk, LOG_LEVEL: {}, PURCHASES_ERROR_CODE: {} },
    '../stores/scan-store': { useScanStore: { getState: () => scanState } },
    './entitlements': entitlements,
    '../stores/persisted-keys': { TD_CONVERSION_SEEN_KEY: seenKey },
    './posthog-log': { posthogAppLogger: logger },
    './td-conversion': require('../src/services/td-conversion.ts'),
  };
  new Function('require', 'module', 'exports', output)((name) => {
    if (name in deps) return deps[name];
    throw new Error(`Unexpected import ${name}`);
  }, module, module.exports);
  return module.exports;
}

const tdInfo = (periodType = 'NORMAL') => ({
  entitlements: { active: { [entitlements.TD_ENTITLEMENT_ID]: {
    isActive: true,
    periodType,
    productIdentifier: 'snapscore.td.annual',
    originalPurchaseDate: '2026-11-10T12:00:00Z',
    store: 'APP_STORE',
  } } },
});

beforeEach(() => {
  storage.clear();
  logger.tournamentDirectorEntitlementStarted.mockClear();
  scanState.setTier.mockClear();
  sdk.configure.mockClear();
  sdk.addCustomerInfoUpdateListener.mockClear();
  sdk.getCustomerInfo.mockClear();
  customerInfo = tdInfo();
  listener = undefined;
  process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY = 'test-only';
  global.__DEV__ = false;
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY;
  delete global.__DEV__;
});

test('customer updates log once, persist the seen period, and survive service restart', async () => {
  const firstService = loadPurchases();
  await firstService.initPurchases();
  expect(logger.tournamentDirectorEntitlementStarted).toHaveBeenCalledTimes(1);
  expect(storage.get(seenKey)).toBe('snapscore.td.annual|2026-11-10T12:00:00Z|normal');

  await listener(tdInfo());
  expect(logger.tournamentDirectorEntitlementStarted).toHaveBeenCalledTimes(1);

  const restartedService = loadPurchases();
  await restartedService.initPurchases();
  expect(logger.tournamentDirectorEntitlementStarted).toHaveBeenCalledTimes(1);
});

test('trial then normal customer updates log two distinct periods once each', async () => {
  customerInfo = tdInfo('TRIAL');
  const service = loadPurchases();
  await service.initPurchases();
  await listener(tdInfo('TRIAL'));
  await listener(tdInfo('NORMAL'));

  expect(logger.tournamentDirectorEntitlementStarted.mock.calls.map(([event]) => event.period_type))
    .toEqual(['trial', 'normal']);
  expect(logger.tournamentDirectorEntitlementStarted).toHaveBeenCalledTimes(2);
});
