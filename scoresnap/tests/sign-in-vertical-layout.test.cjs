// Native screenshot of the fix branch (iPhone 17 Pro simulator, 27 Nov): on Sign in, "Join with
// code" stood alone above the wordmark with a large empty band over it, and the whole group sat
// low. Cause: the link was the first child of a vertically centred column, above the logo.
// Now: the column starts a fixed share of the way down (not centred, so it cannot drift low), the
// wordmark is first, and "Join with code" is the last choice in the list, with a 44pt target.
const fs = require('node:fs');
const ts = require('typescript');
const load = (file) => { const m = { exports: {} }; new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports); return m.exports; };
const { signInTopSpace } = load('src/ui/sign-in-layout.ts');
const src = fs.readFileSync('app/auth/sign-in.tsx', 'utf8');

test('the group starts in the upper part of the screen on every current iPhone', () => {
  // usable heights (window minus safe areas are applied by SafeScreen; these are window heights)
  for (const [name, height] of [['iPhone 17', 874], ['iPhone 17 Pro Max', 956], ['iPhone Air', 912], ['iPhone 16e', 844], ['iPhone SE', 667]]) {
    const top = signInTopSpace(height);
    expect([name, top >= 24]).toEqual([name, true]);
    expect([name, top <= height * 0.14]).toEqual([name, true]);
  }
  expect(signInTopSpace(874)).toBe(105);
  expect(signInTopSpace(667)).toBe(24); // small phone: the form needs the room
  expect(signInTopSpace(Number.NaN)).toBe(24);
});

test('the column is top-anchored with that space, not centred', () => {
  const start = src.indexOf('<ScrollView');
  const tag = src.slice(start, src.indexOf('>', src.indexOf('keyboardShouldPersistTaps', start)));
  expect(tag).toContain('justifyContent: "flex-start"');
  expect(tag).toContain('paddingTop: signInTopSpace(windowHeight)');
  expect(tag).not.toContain('justifyContent: "center"');
});

test('the wordmark comes first; Join with code is the last choice, after Sign in', () => {
  const logo = src.indexOf('SNAPSCORE');
  const join = src.indexOf('Join with code');
  const signInLink = src.indexOf('Already have an account? Sign in');
  expect(logo).toBeGreaterThan(-1);
  expect(src.indexOf('Join with code', join + 1)).toBe(-1); // once only
  expect(join).toBeGreaterThan(signInLink);
  expect(join).toBeLessThan(src.indexOf('mode === "signup" && ('));
  expect(logo).toBeLessThan(signInLink);
});

test('Join with code is a button with a 44pt target and stays behind the Join by code switch', () => {
  const at = src.indexOf('testID="sign-in-join-code"');
  expect(at).toBeGreaterThan(-1);
  const block = src.slice(src.lastIndexOf('{CROSS_DEVICE_SHARING_ENABLED && (', at), src.indexOf('Join with code', at));
  expect(block).toContain('router.push("/join/enter")');
  expect(block).toContain('accessibilityRole="button"');
  expect(block).toContain('minHeight: 44');
  expect(at - src.lastIndexOf('{CROSS_DEVICE_SHARING_ENABLED && (', at)).toBeLessThan(200);
});
