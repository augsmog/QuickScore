const fs = require('node:fs');
const vm = require('node:vm');
const eas = require('../eas.json');
const base = require('../app.json');
function config(env, app = base) {
  const context = { module: { exports: {} }, require: () => app, process: { env } };
  vm.runInNewContext(fs.readFileSync('app.config.js', 'utf8'), context);
  return context.module.exports();
}
test.each(['testflight', 'production'])('%s enables manual Join only, without native entitlements', name => {
  const env = eas.build[name].env;
  expect(env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING).toBe('true');
  expect(env.EXPO_PUBLIC_FEATURE_LEAGUES).toBe('false');
  expect(env.EXPO_PUBLIC_PRO_ENABLED).toBe('false');
  expect(env.EXPO_PUBLIC_FEATURE_NATIVE_LINKS).toBe('false');
  expect(config(env).ios.associatedDomains).toBeUndefined();
  expect(config(env).android.intentFilters).toBeUndefined();
});
test('future native activation fails closed without reviewed signed association evidence', () => {
  for (const sharing of ['true', 'false', undefined]) for (const nativeLinks of ['true', 'True', '1', '']) {
    expect(() => config({ EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING: sharing, EXPO_PUBLIC_FEATURE_NATIVE_LINKS: nativeLinks })).toThrow('NATIVE_LINK_ASSOCIATIONS_UNVERIFIED');
  }
});
test('base entitlements cannot bypass the association guard', () => {
  expect(() => config({}, { expo: { ios: { associatedDomains: ['applinks:example.test'] } } })).toThrow('NATIVE_LINK_ASSOCIATIONS_UNVERIFIED');
  expect(() => config({}, { expo: { android: { intentFilters: [{}] } } })).toThrow('NATIVE_LINK_ASSOCIATIONS_UNVERIFIED');
});

test('default and explicit opt-out preserve the registered scheme and unrelated plugins', () => {
  for (const env of [{}, {EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING:'true', EXPO_PUBLIC_FEATURE_NATIVE_LINKS:'false'}]) {
    const actual=config(env);
    expect(actual.scheme).toBe(base.expo.scheme);
    expect(actual.plugins).toEqual(base.expo.plugins);
    expect(actual.ios.associatedDomains).toBeUndefined();
    expect(actual.android.intentFilters).toBeUndefined();
  }
});
