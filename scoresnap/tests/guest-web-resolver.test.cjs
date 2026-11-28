// The guest-only website must not bundle payment code; every other build must be untouched.
const { guestStubFor, withGuestWebStubs, STUB } = require('../scripts/guest-web-resolver.cjs');
const fs = require('fs');
const guest = { EXPO_PUBLIC_WEB_GUEST_ONLY: 'true' };

test('guest-only web build: the purchases packages resolve to the stand-in', () => {
  expect(guestStubFor('react-native-purchases', 'web', guest)).toBe(STUB);
  expect(guestStubFor('react-native-purchases-ui', 'web', guest)).toBe(STUB);
  expect(fs.existsSync(STUB)).toBe(true);
});

test('the iPhone app, Android, and the ordinary web build keep the real packages', () => {
  expect(guestStubFor('react-native-purchases', 'ios', guest)).toBeNull();
  expect(guestStubFor('react-native-purchases', 'android', guest)).toBeNull();
  expect(guestStubFor('react-native-purchases', 'web', {})).toBeNull();
  expect(guestStubFor('react-native-purchases', 'web', { EXPO_PUBLIC_WEB_GUEST_ONLY: 'false' })).toBeNull();
  expect(guestStubFor('react-native', 'web', guest)).toBeNull();
});

test('the rule sits in front of the existing resolver and hands everything else on', () => {
  const previous = jest.fn(() => ({ type: 'sourceFile', filePath: '/real' }));
  const config = withGuestWebStubs({ resolver: { resolveRequest: previous, keep: 1 } }, guest);
  expect(config.resolver.keep).toBe(1);
  expect(config.resolver.resolveRequest({}, 'react-native-purchases', 'web')).toEqual({ type: 'sourceFile', filePath: STUB });
  expect(config.resolver.resolveRequest({}, 'react-native-purchases', 'ios')).toEqual({ type: 'sourceFile', filePath: '/real' });
  const fallback = jest.fn(() => 'default');
  expect(withGuestWebStubs({}, guest).resolver.resolveRequest({ resolveRequest: fallback }, 'react', 'web')).toBe('default');
});

test('the stand-in answers what the app asks of it without loading anything', async () => {
  const Purchases = require(STUB);
  expect(Purchases.default).toBe(Purchases);
  expect(await Purchases.isAnonymous()).toBe(true);
  expect((await Purchases.getOfferings()).current).toBeNull();
  expect((await Purchases.logIn('u')).customerInfo.entitlements.active).toEqual({});
  await expect(Purchases.purchasePackage({})).rejects.toThrow('Use the SnapScore app');
  expect(fs.readFileSync(STUB, 'utf8')).not.toMatch(/require\(|import /);
});

test('the site build is the one that sets the guest-only flag', () => {
  expect(fs.readFileSync(require('path').join(__dirname, '..', 'scripts', 'build-web-site.cjs'), 'utf8')).toContain("EXPO_PUBLIC_WEB_GUEST_ONLY: 'true'");
});

test('analytics are off on the guest-only website even when a build supplies the keys', () => {
  const read = file => fs.readFileSync(require('path').join(__dirname, '..', file), 'utf8');
  expect(read('src/services/analytics.web.ts')).toContain('process.env.EXPO_PUBLIC_POSTHOG_ENABLED === "true" && process.env.EXPO_PUBLIC_WEB_GUEST_ONLY !== "true"');
  expect(read('src/config/posthog.tsx')).toContain('Boolean(projectToken && host) && !guestWebsite');
  const env = { ...process.env }; global.__DEV__ = false;
  try {
    Object.assign(process.env, { EXPO_PUBLIC_WEB_GUEST_ONLY: 'true', EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_x', EXPO_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com' });
    const made = jest.fn();
    const load = require('./helpers/load-ts.cjs')({ 'react-native': { Platform: { OS: 'web' } }, 'posthog-react-native': { __esModule: true, default: class { constructor() { made(); } register() {} }, PostHogProvider: () => null } });
    const web = load('src/config/posthog.tsx');
    expect(web.isPostHogConfigured).toBe(false);
    expect(made).not.toHaveBeenCalled();
    const phone = require('./helpers/load-ts.cjs')({ 'react-native': { Platform: { OS: 'ios' } }, 'posthog-react-native': { __esModule: true, default: class { constructor() { made(); } register() {} }, PostHogProvider: () => null } })('src/config/posthog.tsx');
    expect(phone.isPostHogConfigured).toBe(true);
  } finally { process.env = env; }
});

test('any other build gets its bundler config back untouched', () => {
  for (const env of [{}, { EXPO_PUBLIC_WEB_GUEST_ONLY: 'false' }, { EXPO_PUBLIC_WEB_GUEST_ONLY: 'TRUE' }]) {
    const resolver = { resolveRequest: () => 'theirs' }, config = { resolver };
    expect(withGuestWebStubs(config, env)).toBe(config);
    expect(config.resolver).toBe(resolver);
  }
});
