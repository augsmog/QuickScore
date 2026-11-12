#!/usr/bin/env node
// Node VM smoke of the production iOS JS bundle, not a native UI/device test.
// Usage: node e2e/ios-boot-smoke.cjs [bundle.js] [public-app-config.json]
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

process.chdir(path.resolve(__dirname, '..'));
const bundleDir = 'dist-ios/_expo/static/js/ios';
const bundle = process.argv[2] || path.join(bundleDir,
  fs.readdirSync(bundleDir).find(name => /^entry-.*\.js$/.test(name)) || 'missing-bundle');
const source = fs.readFileSync(bundle, 'utf8');
const sourceLines = source.split('\n');
const appConfig = process.argv[3]
  ? fs.readFileSync(process.argv[3], 'utf8')
  : execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
JSON.parse(appConfig); // Fail early on invalid config; never log config or environment values.

// Native host functions return undefined unless a boot dependency needs constants.
function stub(name) {
  return new Proxy(function () {}, {
    get(target, key) {
      if (key === Symbol.toPrimitive) return () => '';
      if (['then', 'manifestString', 'EXDevLauncher', 'EXDevMenu', 'toJSON'].includes(key)) return undefined;
      if (key === 'getConstants') return () => constants(name);
      if (key === 'length') return 0;
      if (key === 'prototype') return {};
      if (typeof key === 'symbol') return undefined;
      return stub(`${name}.${key}`);
    },
    apply() { return undefined; },
    construct() { return stub(`new ${name}`); },
  });
}
const dimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };
const known = {
  Dimensions: { window: dimensions, screen: dimensions }, isTesting: false,
  reactNativeVersion: { major: 0, minor: 81, patch: 5 }, osVersion: '27.0',
  interfaceIdiom: 'phone', systemName: 'iOS', forceTouchAvailable: false,
  isRTL: false, doLeftAndRightSwapInRTL: true, localeIdentifier: 'en_US',
  scriptURL: 'file:///bundle.js', initialAppState: 'active', PlatformConstants: {},
  manifest: appConfig, executionEnvironment: 'standalone', appOwnership: null,
  experienceUrl: '', isDevice: true, platform: { ios: {} },
};
function constants(name) {
  return new Proxy({}, {
    get(target, key) {
      if (key in known) return known[key];
      if (typeof key === 'symbol' || key === 'then' || key === 'toJSON') return undefined;
      return stub(`${name}.const.${key}`);
    },
    has(target, key) { return key in known; },
  });
}
const errors = [];
function record(error, channel) { errors.push({ error, channel }); }
const noop = () => {};
const globals = {
  console: { log: noop, warn: noop, info: noop, debug: noop, trace: noop, group: noop,
    groupEnd: noop, error: (...args) => {
      for (const error of args) if (error && typeof error === 'object' && error.stack) record(error, 'console.error');
    } },
  setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, queueMicrotask,
  Promise, Date, Math, JSON, Symbol, Error, TypeError, __DEV__: false,
  RN$Bridgeless: true, __nativeComponentRegistry__hasComponent: () => true,
  __workletsModuleProxy: stub('worklets'), _WORKLET: false,
  RN$registerCallableModule: noop, RN$isRuntimeReady: () => true,
  nativeModuleProxy: stub('nativeModuleProxy'), __turboModuleProxy: name => stub(`turbo:${name}`),
  nativeFabricUIManager: stub('fabric'), HermesInternal: { getRuntimeProperties: () => ({}) },
  performance: { now: () => Date.now() },
};
globals.global = globals;
globals.globalThis = globals;
// Deliberately no window.location: RN installs window = global during startup.
globals.expo = {
  modules: new Proxy({}, { get(target, key) {
    if (key === 'ExpoGo' || key === 'EXDevLauncher') return undefined;
    return stub(key === 'ExponentConstants' ? 'consts' : `expo.${String(key)}`);
  } }),
  EventEmitter: class { addListener() { return { remove() {} }; } removeAllListeners() {} emit() {} },
  NativeModule: class {}, SharedObject: class {}, SharedRef: class {},
  uuidv4: () => 'x', uuidv5: () => 'x', getViewConfig: () => ({}),
};
let errorUtils;
Object.defineProperty(globals, 'ErrorUtils', {
  configurable: true,
  get: () => errorUtils,
  set(value) {
    errorUtils = value;
    value.reportFatalError = error => record(error, 'ErrorUtils fatal');
    value.setGlobalHandler = noop; // Keep app integrations from replacing fatal capture.
  },
});
process.on('uncaughtException', error => record(error, 'uncaughtException'));
process.on('unhandledRejection', error => record(error, 'unhandledRejection'));
const context = vm.createContext(globals);
let ranMain = false;
try { vm.runInContext(source, context, { filename: 'bundle.js', timeout: 30000 }); }
catch (error) { record(error, 'bundle evaluation'); }
setTimeout(() => {
  try {
    const registry = context.RN$AppRegistry;
    if (!registry?.getAppKeys().includes('main')) throw new Error('AppRegistry main is missing');
    registry.runApplication('main', { rootTag: 11, initialProps: {} });
    ranMain = true;
    console.log('AppRegistry: ran main');
  } catch (error) { record(error, 'runApplication'); }
}, 300);
setTimeout(() => {
  let ignored = 0;
  const failures = [];
  for (const { error, channel } of errors) {
    const stack = String(error?.stack || error);
    // Exact message AND worklets stack signature; never ignore arbitrary TypeErrors.
    const workletsNoise = error?.message === 'Invalid value used as weak map key' &&
      /\bat WeakMap\.set \(<anonymous>\)/.test(stack) &&
      (() => {
        // Metro minifies names: identify the immediate caller's worklets module.
        const caller = stack.split('\n')[2]?.match(/at Object\.set \(bundle\.js:(\d+):\d+\)/);
        const module = caller && sourceLines[Number(caller[1]) - 1];
        return !!module?.includes('"serializableMappingCache"') &&
          module.includes("Symbol('serializable flag')") && module.includes('new WeakMap');
      })();
    const reactFollowup = error?.message === 'Unspecified error' &&
      /\bat [\w$]+\.onUncaughtError\b/.test(stack) && ignored > 0 && failures.length === 0;
    if (workletsNoise || reactFollowup) {
      ignored++;
      console.log(`IGNORED harness noise: ${error.message}`);
    } else {
      failures.push(error);
      console.error(`FAIL [${channel}]: ${stack.split('\n').slice(0,10).join('\n')}`);
    }
  }
  const passed = ranMain && failures.length === 0;
  console.log(`iOS boot smoke: ${passed ? 'PASS' : 'FAIL'} (${failures.length} unexpected errors, ${ignored} ignored harness errors)`);
  // Stubbed native timers can remain alive indefinitely.
  process.exit(passed ? 0 : 1);
}, 3300);
