// AUG-86: offline App Store submission config preflight. No network, no credentials, no submission.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const expo = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));

test('iOS identity and version fields are set for a store build', () => {
  assert.equal(expo.ios.bundleIdentifier, 'com.scoresnap.app');
  assert.match(expo.version, /^\d+\.\d+\.\d+$/);
  assert.ok(expo.ios.buildNumber);
  assert.equal(expo.android.package, expo.ios.bundleIdentifier);
  assert.equal(expo.ios.infoPlist.ITSAppUsesNonExemptEncryption, false);
});

test('camera usage strings exist and microphone is not requested', () => {
  assert.ok(expo.ios.infoPlist.NSCameraUsageDescription.length > 10);
  const cam = expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-camera');
  assert.ok(cam, 'expo-camera plugin configured');
  assert.equal(cam[1].microphonePermission, false);
  assert.equal(expo.ios.infoPlist.NSMicrophoneUsageDescription, undefined);
});

test('Sign in with Apple plugin is present (third-party login offered)', () => {
  assert.ok(expo.plugins.includes('expo-apple-authentication'));
});

test('production submit profile targets the App Store Connect app and team', () => {
  const ios = eas.submit.production.ios;
  assert.equal(ios.ascAppId, '6761034352');
  assert.equal(ios.appleTeamId, '3357G2T3KS');
  assert.equal(eas.submit.production.ios.ascAppId, eas.submit.testflight.ios.ascAppId);
});

test('production build profile is store-safe: remote env, no demo/offline, no placeholder backend', () => {
  const prod = eas.build.production;
  assert.equal(prod.environment, 'production');
  assert.equal(prod.channel, 'production');
  for (const [k, v] of Object.entries(prod.env || {})) {
    if (/OFFLINE_MODE|DEMO_MODE/.test(k)) assert.notEqual(v, 'true', k);
    assert.ok(!String(v).includes('your-project'), k);
  }
  assert.equal(eas.cli.appVersionSource, 'remote');
});

test('required store-facing docs exist and use the canonical host', () => {
  for (const f of ['docs/privacy-policy.md', 'docs/terms-of-service.md', 'docs/account-deletion.md',
    'docs/app-store-privacy-labels.md', 'docs/APP_STORE_LISTING.md', 'store/asc/en-US.payload.json']) {
    assert.ok(fs.existsSync(path.join(root, f)), f + ' missing');
  }
  const payload = read('store/asc/en-US.payload.json');
  assert.ok(!/scoresnap\.app/i.test(payload), 'retired host in ASC payload');
});

test('assets referenced by app.json exist', () => {
  const refs = [expo.icon, expo.splash.image, expo.android.adaptiveIcon.foregroundImage,
    expo.android.adaptiveIcon.backgroundImage];
  for (const r of refs) assert.ok(fs.existsSync(path.join(root, r)), r + ' missing');
});
