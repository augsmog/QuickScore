// Launch is iPhone only (owner decision, Nov 27 2026): 1.0.1 is the first public release and it
// ships without iPad support. Apple does not let a later version drop iPad once a released
// version supported it, so shipping the first public build with the tablet family by accident
// is not reversible. These guards fail if the iPad family returns through any config path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scoresnap = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(scoresnap, rel), 'utf8'));

// Resolve the config exactly as Expo/EAS does: app.config.js wraps app.json.
function resolvedConfig(env = {}) {
  const saved = { ...process.env };
  delete process.env.EXPO_PUBLIC_FEATURE_NATIVE_LINKS;
  Object.assign(process.env, env);
  try {
    // Evaluated in a fresh context (same approach as tests/universal-link.test.cjs) so the real
    // app.config.js runs against the real app.json and the env above, with no module cache.
    const context = { module: { exports: {} }, require: () => readJson('app.json'), process, URL, Error };
    vm.runInNewContext(fs.readFileSync(path.join(scoresnap, 'app.config.js'), 'utf8'), context);
    return context.module.exports();
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

// Mirrors how Expo prebuild maps ios.supportsTablet / ios.isTabletOnly to TARGETED_DEVICE_FAMILY:
// "1" = iPhone, "2" = iPad. Anything but exactly [1] is a failure for this launch.
function deviceFamilies(ios = {}) {
  if (ios.isTabletOnly) return [2];
  return ios.supportsTablet ? [1, 2] : [1];
}

test('static app.json declares iPhone only', () => {
  const { ios } = readJson('app.json').expo;
  assert.equal(ios.supportsTablet, false);
  assert.equal(ios.isTabletOnly, undefined);
  assert.equal(ios.requireFullScreen, undefined);
  assert.deepEqual(deviceFamilies(ios), [1]);
});

test('resolved Expo config (app.config.js) targets the iPhone family only, for every shipping profile env', () => {
  const eas = readJson('eas.json');
  for (const name of ['testflight', 'production']) {
    const config = resolvedConfig(eas.build[name].env);
    assert.equal(config.ios.supportsTablet, false, name);
    assert.deepEqual(deviceFamilies(config.ios), [1], name);
  }
  assert.deepEqual(deviceFamilies(resolvedConfig().ios), [1]);
});

test('no Info.plist override re-adds the iPad family or iPad-only keys', () => {
  const plist = resolvedConfig().ios.infoPlist ?? {};
  assert.equal(plist.UIDeviceFamily, undefined);
  for (const key of Object.keys(plist)) assert.doesNotMatch(key, /~ipad$/i, key);
  assert.equal(plist.UIRequiresFullScreen, undefined);
  assert.equal(resolvedConfig().orientation, 'portrait');
});

test('the guard itself rejects each way iPad could come back', () => {
  assert.deepEqual(deviceFamilies({ supportsTablet: true }), [1, 2]);
  assert.deepEqual(deviceFamilies({ isTabletOnly: true }), [2]);
  assert.deepEqual(deviceFamilies({}), [1]);
});

test('release evidence configs carry no iPad target', () => {
  const capture = readJson('e2e/store-capture/capture-config.json');
  assert.deepEqual(capture.targets.map((t) => t.family), ['iPhone']);
  assert.deepEqual(capture.targets.map((t) => t.id), ['iphone-6.9']);
  const layout = readJson('e2e/device-layout/config/device-layout.config.json');
  const ios = layout.profiles.filter((p) => p.platform === 'ios');
  assert.ok(ios.length >= 4);
  for (const profile of ios) assert.match(profile.name, /^iPhone /, profile.id);
});
