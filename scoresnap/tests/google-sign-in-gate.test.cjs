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
