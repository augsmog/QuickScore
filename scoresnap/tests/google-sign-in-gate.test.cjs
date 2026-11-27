// A sign-in button that cannot sign anyone in must not be shown. "Continue with Google" is offered
// only in a build that was given EXPO_PUBLIC_GOOGLE_CLIENT_ID; the release profiles in eas.json do
// not set it, so unless the EAS environment supplies it the store build has no Google button.
const fs = require('node:fs');
const ts = require('typescript');

function load(file, env = {}) {
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', 'process', code)((id) => { throw Error(id); }, m, m.exports, { env });
  return m.exports;
}

test('Google sign-in is available only when the build has a client id', () => {
  for (const value of [undefined, '', '   ']) {
    const g = load('src/config/google-sign-in.ts', value === undefined ? {} : { EXPO_PUBLIC_GOOGLE_CLIENT_ID: value });
    expect(g.GOOGLE_SIGN_IN_AVAILABLE).toBe(false);
    expect(g.GOOGLE_CLIENT_ID).toBe('');
  }
  const g = load('src/config/google-sign-in.ts', { EXPO_PUBLIC_GOOGLE_CLIENT_ID: ' 123-abc.apps.googleusercontent.com ' });
  expect(g.GOOGLE_SIGN_IN_AVAILABLE).toBe(true);
  expect(g.GOOGLE_CLIENT_ID).toBe('123-abc.apps.googleusercontent.com');
});

test('the sign-in screen renders "Continue with Google" only inside the availability check', () => {
  const src = fs.readFileSync('app/auth/sign-in.tsx', 'utf8');
  // One source of truth: the screen does not read the variable itself.
  expect(src).not.toMatch(/process\.env\.EXPO_PUBLIC_GOOGLE_CLIENT_ID/);
  expect(src).toMatch(/import \{ GOOGLE_CLIENT_ID, GOOGLE_SIGN_IN_AVAILABLE \} from "\.\.\/\.\.\/src\/config\/google-sign-in";/);
  // Exactly one Google button, and it sits between the opening of the check and its close.
  expect(src.split('Continue with Google').length - 1).toBe(1);
  expect(src.split('onPress={handleGoogleSignIn}').length - 1).toBe(1);
  const open = src.indexOf('{GOOGLE_SIGN_IN_AVAILABLE && (');
  const button = src.indexOf('testID="sign-in-google"');
  const label = src.indexOf('Continue with Google');
  const close = src.indexOf(')}', label);
  expect(open).toBeGreaterThan(-1);
  expect(button).toBeGreaterThan(open);
  expect(label).toBeGreaterThan(button);
  expect(close).toBeGreaterThan(label);
  // Nothing else opens a JSX element between the check and the button.
  expect(src.slice(open, button)).toMatch(/^\{GOOGLE_SIGN_IN_AVAILABLE && \(\s*<AnimatedPressable\s*$/);
  // Apple and email sign-in are not behind this check.
  expect(src.indexOf('Continue with Apple')).toBeLessThan(open);
});

test('the release profiles do not set the client id, so this gate decides what the store build shows', () => {
  const eas = require('../eas.json');
  for (const profile of ['testflight', 'production']) expect(eas.build[profile].env.EXPO_PUBLIC_GOOGLE_CLIENT_ID).toBeUndefined();
});

// The layout gate captures the sign-in screen and refuses a capture that shows the Google button.
test('the layout gate has a per-PR sign-in checkpoint that asserts the Google button is absent', () => {
  const yaml = require('js-yaml');
  const config = JSON.parse(fs.readFileSync('e2e/device-layout/config/device-layout.config.json', 'utf8'));
  expect(config.flows.find((f) => f.id === 'sign-in')).toEqual({ id: 'sign-in', cadence: 'per-pr', checkpoints: ['options', 'email form'] });
  const [, steps] = yaml.loadAll(fs.readFileSync('../.maestro/flows/device-layout/sign-in/00-options.yaml', 'utf8'));
  const absent = steps.filter((s) => s.assertNotVisible).map((s) => s.assertNotVisible);
  // By the id the screen gives the button, and by its words, in case the id is ever dropped.
  expect(absent).toEqual([{ id: 'sign-in-google' }, 'Continue with Google']);
  expect(fs.readFileSync('app/auth/sign-in.tsx', 'utf8')).toMatch(/testID="sign-in-google"/);
  // The absence is asserted before the capture, so a capture cannot exist without it.
  const order = steps.map((s) => Object.keys(s)[0]);
  expect(order.lastIndexOf('assertNotVisible')).toBeLessThan(order.indexOf('takeScreenshot'));
  // The screen is reached and recognised by something both platforms show.
  const wait = steps.find((s) => s.retry).retry.commands;
  expect(wait.find((c) => c.openLink).openLink).toBe('snapscore://auth/sign-in');
  expect(wait.find((c) => c.extendedWaitUntil).extendedWaitUntil.visible).toBe('Create Account');
  expect(fs.readFileSync('app/auth/sign-in.tsx', 'utf8')).toMatch(/^\s*Create Account\s*$/m);
});

// With Google hidden, email and password is the only route besides Apple; the gate captures that form.
test('the layout gate captures the email and password form, reached from the options screen', () => {
  const yaml = require('js-yaml');
  const [, steps] = yaml.loadAll(fs.readFileSync('../.maestro/flows/device-layout/sign-in/01-email-form.yaml', 'utf8'));
  const src = fs.readFileSync('app/auth/sign-in.tsx', 'utf8');
  // A continuation: it does not relaunch the app, and it opens by checking it is on the options screen.
  expect(steps.some((s) => s.launchApp)).toBe(false);
  expect(steps[0]).toEqual({ assertVisible: 'Create Account' });
  // Every text it taps or waits for is text the screen has.
  expect(steps.find((s) => s.tapOn).tapOn.replace(/\\/g, '')).toBe('Already have an account? Sign in');
  expect(src).toMatch(/^\s*Already have an account\? Sign in\s*$/m);
  for (const field of ['Email address', 'Password']) expect(src).toContain(`placeholder="${field}"`);
  expect(steps.find((s) => s.extendedWaitUntil).extendedWaitUntil.visible).toBe('Email address');
  expect(steps).toContainEqual({ assertVisible: 'Password' });
  // It types nothing: no credentials in a capture flow.
  expect(steps.some((s) => s.inputText)).toBe(false);
});
