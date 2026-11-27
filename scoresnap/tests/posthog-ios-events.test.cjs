// What the iOS app can send to PostHog, pinned.
//
// The PostHog project is shared with other apps and stays on the free plan, and every event an app
// sends should be one somebody chose. The SDK sends events by itself unless told not to: a screen
// event on every navigation, two lifecycle events every time the phone is woken, and a request for
// feature flags at every start. This file pins (1) the client's settings that turn those off,
// (2) the complete list of events the app's own code sends, and (3) the complete list of events
// the installed SDK is able to send by itself, each with the reason this app does not send it.
// A new SDK version that adds an automatic event fails (3) until someone decides about it.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const app = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(app, ...p), 'utf8');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' || e.name === '__tests__' ? [] : walk(full);
  return /\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name) ? [full] : [];
});

// Load src/config/posthog.tsx against a stand-in SDK, and report how the client was made.
function loadConfig({ env = { EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_test', EXPO_PUBLIC_POSTHOG_HOST: 'https://ph.example' }, os = 'ios' } = {}) {
  const seen = { constructed: [], registered: [], captured: [] };
  class PostHog {
    constructor(token, options) { seen.constructed.push({ token, options }); }
    register(properties) { seen.registered.push(properties); return Promise.resolve(); }
    capture(event, properties) { seen.captured.push([event, properties]); }
  }
  const PostHogProvider = 'PostHogProvider';
  const modules = {
    'posthog-react-native': { __esModule: true, default: PostHog, PostHogProvider },
    'react-native': { Platform: { OS: os } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  };
  const code = ts.transpileModule(read('src', 'config', 'posthog.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', 'process', '__DEV__', 'console', code)(
    (id) => { if (!modules[id]) throw new Error(`unexpected import ${id}`); return modules[id]; }, m, m.exports, { env }, false, { error() {} });
  return { ...m.exports, seen };
}

describe('the PostHog client is made with nothing automatic', () => {
  test('lifecycle events, flag preloading and session replay are off, each stated', () => {
    const { seen } = loadConfig();
    expect(seen.constructed).toHaveLength(1);
    const { options } = seen.constructed[0];
    expect(options.captureAppLifecycleEvents).toBe(false);
    expect(options.preloadFeatureFlags).toBe(false);
    expect(options.enableSessionReplay).toBe(false);
    expect(options.errorTracking.autocapture).toEqual({ uncaughtExceptions: false, unhandledRejections: false, nativeCrashes: false, androidNdkCrashes: false, console: [] });
  });

  test('every event carries app="snapscore" and the platform', () => {
    for (const os of ['ios', 'android']) {
      const { seen, POSTHOG_SUPER_PROPERTIES } = loadConfig({ os });
      expect(seen.registered).toEqual([{ app: 'snapscore', platform: os }]);
      expect(POSTHOG_SUPER_PROPERTIES).toEqual({ app: 'snapscore', platform: os });
    }
  });

  test('the provider is told to capture nothing by itself: no screen events, no touch events', () => {
    const { PostHogAppProvider, posthog } = loadConfig();
    const element = PostHogAppProvider({ children: 'the app' });
    expect(element.type).toBe('PostHogProvider');
    expect(element.props.client).toBe(posthog);
    // `false`, not absent: with the setting absent the SDK captures screens.
    expect(element.props.autocapture).toBe(false);
    expect(Object.keys(element.props).sort()).toEqual(['autocapture', 'children', 'client']);
  });

  test('without the two settings there is no client and nothing is registered', () => {
    for (const env of [{}, { EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_test' }, { EXPO_PUBLIC_POSTHOG_HOST: 'https://ph.example' }]) {
      const { seen, posthog, PostHogAppProvider } = loadConfig({ env });
      expect(posthog).toBeNull();
      expect(seen.constructed).toEqual([]);
      expect(seen.registered).toEqual([]);
      expect(PostHogAppProvider({ children: 'the app' })).toBe('the app');
    }
  });
});

describe('app_opened is sent once per start, by the app', () => {
  const loadAppOpened = () => {
    const code = ts.transpileModule(read('src', 'services', 'app-opened.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const m = { exports: {} };
    new Function('require', 'module', 'exports', code)((id) => { throw new Error(`unexpected import ${id}`); }, m, m.exports);
    return m.exports;
  };

  test('once, with no properties, however often it is asked', () => {
    const { reportAppOpened, resetAppOpenedForTests } = loadAppOpened();
    resetAppOpenedForTests();
    const captured = [];
    const client = { capture: (...args) => captured.push(args) };
    reportAppOpened(client); reportAppOpened(client); reportAppOpened(client);
    expect(captured).toEqual([['app_opened']]);
  });

  test('no client, no event, and no error', () => {
    const { reportAppOpened, resetAppOpenedForTests } = loadAppOpened();
    resetAppOpenedForTests();
    expect(() => reportAppOpened(null)).not.toThrow();
    // A start without a client does not use up the one report.
    const captured = [];
    reportAppOpened({ capture: (...args) => captured.push(args) });
    expect(captured).toEqual([['app_opened']]);
  });

  test('the root layout reports it on native and keeps the web event for web', () => {
    const layout = read('app', '_layout.tsx');
    expect(layout).toMatch(/if \(Platform\.OS === "web"\) void webAnalytics\.capture\("app_opened"\);\s*else reportAppOpened\(posthog\);/);
  });
});

// Every call the app's own code makes on the native client.
function nativeClientCalls() {
  const calls = [];
  const webOnly = new Set(['src/services/analytics-web.ts', 'src/services/analytics.web.ts']);
  for (const file of [...walk(path.join(app, 'app')), ...walk(path.join(app, 'src'))]) {
    const rel = path.relative(app, file).split(path.sep).join('/');
    if (webOnly.has(rel)) continue;
    const source = ts.createSourceFile(rel, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, /\.tsx$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const target = node.expression.expression.getText(source);
        if (target === 'posthog' || target === 'client') {
          const first = node.arguments[0];
          calls.push({ file: rel, target, method: node.expression.name.text, literal: first && ts.isStringLiteralLike(first) ? first.text : null, args: node.arguments.length });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return calls;
}

describe('the complete list of events the iOS app sends', () => {
  const calls = nativeClientCalls().filter((c) => c.target === 'posthog' || c.file === 'src/services/app-opened.ts');

  test('every capture names its event with a plain string', () => {
    for (const c of calls.filter((x) => x.method === 'capture')) expect({ file: c.file, literal: typeof c.literal }).toEqual({ file: c.file, literal: 'string' });
  });

  test('these events, from these files, and no others', () => {
    const sent = calls.filter((c) => c.method === 'capture').map((c) => `${c.literal} <- ${c.file}`).sort();
    expect(sent).toEqual([
      'app_opened <- src/services/app-opened.ts',
      'contest_created <- app/contest/new.tsx',
      'quick_settlement_created <- app/scan/review.tsx',
      'round_finalized <- app/contest/[id]/index.tsx',
      'scorecard_imported <- app/scan/review.tsx',
      'scorecard_scan_processed <- app/scan/index.tsx',
      'subscription_purchase_completed <- app/paywall.tsx',
    ]);
  });

  test('every event the app sends is in the reviewed inventory', () => {
    const inventory = read('src', 'services', 'analytics-contract.ts');
    for (const c of calls.filter((x) => x.method === 'capture')) expect(inventory).toContain(`"${c.literal}": {`);
  });

  test('the client is used for nothing else that sends: no screen, group, alias or flag call', () => {
    const methods = [...new Set(calls.filter((c) => c.target === 'posthog').map((c) => c.method))].sort();
    // capture: the list above. register: the two super properties. getDistinctId/reset: identity
    // housekeeping in auth-store. info: the four log lines in posthog-log.ts (posthog?.logger.info
    // is a call on `posthog?.logger`, so it is not counted here).
    expect(methods).toEqual(['capture', 'getDistinctId', 'register', 'reset']);
  });
});

describe('the complete list of events the installed SDK can send by itself', () => {
  const lock = JSON.parse(read('package-lock.json')).packages;
  const sdkDir = path.join(app, 'node_modules', 'posthog-react-native');
  const coreDir = path.join(app, 'node_modules', '@posthog', 'core');
  const jsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : jsFiles(full);
    return /\.(js|mjs|cjs)$/.test(e.name) ? [full] : [];
  });
  const literals = (dir) => {
    const found = new Set();
    for (const file of jsFiles(path.join(dir, 'dist'))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\.capture(?:Stateless)?\(\s*(['"])([^'"]+)\1/g)) found.add(m[2]);
      // Internal messages built as { event: '$name' }. Only $-names: `event: 'sent'` and the like
      // are survey callbacks, not events.
      for (const m of text.matchAll(/\bevent:\s*(['"])(\$[^'"]+)\1/g)) found.add(m[2]);
    }
    return [...found].sort();
  };

  test('the SDK that is installed is the one the lockfile names', () => {
    for (const [name, dir] of [['posthog-react-native', sdkDir], ['@posthog/core', coreDir]]) {
      const installed = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
      expect({ name, version: lock[`node_modules/${name}`].version }).toEqual({ name, version: installed });
    }
  });

  // Why each one is not sent by this app. If this list changes, the SDK changed: decide about the
  // new event, add it here with its reason, and add a setting above if it needs one.
  const WHY_NOT = {
    '$screen': 'provider autocapture={false}; the app never calls screen()',
    'Application Opened': 'captureAppLifecycleEvents: false; the app sends its own app_opened once',
    'Application Became Active': 'captureAppLifecycleEvents: false',
    'Application Backgrounded': 'captureAppLifecycleEvents: false',
    'Application Installed': 'captureAppLifecycleEvents: false',
    'Application Updated': 'captureAppLifecycleEvents: false',
    '$autocapture': 'provider autocapture={false}',
    '$exception': 'errorTracking.autocapture all off; the app never calls captureException',
    '$feature_flag_called': 'preloadFeatureFlags: false; the app never reads a flag',
    'survey shown': 'the app mounts no survey provider',
    'survey sent': 'the app mounts no survey provider',
    'survey dismissed': 'the app mounts no survey provider',
    '$ai_feedback': 'the app never calls the AI helpers',
    '$ai_metric': 'the app never calls the AI helpers',
    '$create_alias': 'the app never calls alias()',
    '$groupidentify': 'the app never calls group()',
    '$identify': 'SENT: on sign-in, by identifyAnonymousOnly in auth-store, with the anonymous id and no properties',
    '$set': 'SENT ONLY WITH $identify: the app passes no person properties',
  };

  test('every event name in the SDK is known here, with the reason it is not sent', () => {
    const inSdk = [...new Set([...literals(sdkDir), ...literals(coreDir)])].sort();
    expect(inSdk).toEqual(Object.keys(WHY_NOT).sort());
  });

  test('the reasons that rest on "the app never calls" are true', () => {
    const methods = new Set(nativeClientCalls().filter((c) => c.target === 'posthog').map((c) => c.method));
    for (const never of ['screen', 'alias', 'group', 'groupIdentify', 'captureException', 'getFeatureFlag', 'isFeatureEnabled', 'getFeatureFlagPayload', 'reloadFeatureFlags']) expect(methods.has(never)).toBe(false);
    const everything = [...walk(path.join(app, 'app')), ...walk(path.join(app, 'src'))].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(everything).not.toMatch(/PostHogSurveyProvider|useFeatureFlag|usePostHog\(/);
  });
});
