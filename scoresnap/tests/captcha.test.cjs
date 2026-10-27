const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function load(file, imports, globals = {}) {
  const filename = path.join(__dirname, '..', file);
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  }, setTimeout, clearTimeout, console, URL, ...globals }, { filename });
  return exports;
}
const config = mode => ({ CAPTCHA_MODE: mode, TURNSTILE_SITE_KEY: 'public-site-key', TURNSTILE_BASE_URL: 'https://snapscore-web.augie-os.workers.dev' });
const service = mode => load('src/services/captcha.ts', { '../config/captcha': config(mode) });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function auth(captcha, real = true) {
  let state;
  const response = { data: { session: { user: { id: 'u', email: 'a@b.com' } } }, error: null };
  const api = { signUp: jest.fn().mockResolvedValue(response), signInWithPassword: jest.fn().mockResolvedValue(response) };
  const create = () => initializer => {
    state = initializer(patch => Object.assign(state, patch), () => state);
    return { getState: () => state };
  };
  load('src/stores/auth-store.ts', {
    zustand: { create }, 'zustand/middleware': { persist: fn => fn, createJSONStorage: () => ({}) },
    '@react-native-async-storage/async-storage': {}, '../config/auth': { REAL_AUTH_CONFIGURED: real },
    '../db/supabase': { supabase: { auth: api } }, '../services/captcha': captcha,
  });
  return { state, api };
}
function successfulHost(svc) {
  let counter = 0;
  return jest.fn(request => { if (request) svc.completeCaptcha(request.id, `fresh-${++counter}`); });
}
afterEach(() => jest.useRealTimers());

test.each(['off', 'optional', 'required'])('%s passes the expected auth and anonymous options', async mode => {
  const svc = service(mode);
  const host = successfulHost(svc);
  svc.registerCaptchaHost(host);
  const { state, api } = auth(svc);
  await state.signUpWithEmail('a@b.com', 'password', 'A', 'B');
  await state.signInWithEmail('a@b.com', 'password');
  expect(api.signUp).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password', options: {
    data: { full_name: 'A B' }, ...(mode === 'off' ? {} : { captchaToken: 'fresh-1' }),
  } });
  expect(api.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password',
    ...(mode === 'off' ? {} : { options: { captchaToken: 'fresh-2' } }),
  });
  expect(await svc.anonymousSignInOptions()).toEqual(mode === 'off' ? {} : { options: { captchaToken: 'fresh-3' } });
  if (mode === 'off') expect(host).not.toHaveBeenCalled();
});

test.each(['error', 'timeout', 'unmount', 'missing host'])('optional %s proceeds with original auth args', async failure => {
  jest.useFakeTimers();
  const svc = service('optional');
  const unregister = failure === 'missing host' ? () => {} : svc.registerCaptchaHost(request => {
    if (request && failure === 'error') svc.completeCaptcha(request.id);
  });
  const { state, api } = auth(svc);
  const signup = state.signUpWithEmail('a@b.com', 'password', 'A', 'B');
  await flush();
  if (failure === 'unmount') unregister();
  await jest.advanceTimersByTimeAsync(20_000);
  await signup;
  const signin = state.signInWithEmail('a@b.com', 'password');
  await jest.advanceTimersByTimeAsync(20_000);
  await signin;
  expect(api.signUp).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password', options: { data: { full_name: 'A B' } } });
  expect(api.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password' });
  const anonymous = svc.anonymousSignInOptions();
  await jest.advanceTimersByTimeAsync(20_000);
  expect(await anonymous).toEqual({});
});

test.each(['error', 'timeout'])('required %s aborts every enforced caller', async failure => {
  jest.useFakeTimers();
  const svc = service('required');
  svc.registerCaptchaHost(request => { if (request && failure === 'error') svc.completeCaptcha(request.id); });
  const { state, api } = auth(svc);
  for (const call of [() => state.signInWithEmail('a@b.com', 'password'), () => state.signUpWithEmail('a@b.com', 'password', 'A', 'B'), () => svc.anonymousSignInOptions()]) {
    const assertion = expect(call()).rejects.toThrow(svc.CAPTCHA_ERROR_MESSAGE);
    await jest.advanceTimersByTimeAsync(20_000);
    await assertion;
    expect(state.isLoading).toBe(false);
  }
  expect(api.signUp).not.toHaveBeenCalled();
  expect(api.signInWithPassword).not.toHaveBeenCalled();
});

test('fresh requests serialize, ignore stale/unknown messages, and never log tokens', async () => {
  const spies = ['log', 'warn', 'error', 'debug', 'info'].map(method => jest.spyOn(console, method));
  try {
    const svc = service('required');
    const requests = [];
    svc.registerCaptchaHost(request => { if (request) requests.push(request); });
    const { state, api } = auth(svc);
    const first = state.signInWithEmail('a@b.com', 'password');
    const second = state.signInWithEmail('a@b.com', 'password');
    await flush();
    expect(requests).toHaveLength(1);
    svc.receiveCaptchaMessage('not json');
    svc.receiveCaptchaMessage(JSON.stringify({ id: requests[0].id, type: 'unknown', token: 'bad' }));
    svc.completeCaptcha('wrong-id', 'bad');
    expect(api.signInWithPassword).not.toHaveBeenCalled();
    svc.receiveCaptchaMessage(JSON.stringify({ id: requests[0].id, type: 'token', token: 'secret-token-1' }));
    await first;
    await flush();
    expect(requests).toHaveLength(2);
    expect(requests[1].id).not.toBe(requests[0].id);
    svc.completeCaptcha(requests[0].id, 'stale');
    svc.completeCaptcha(requests[1].id, 'secret-token-2');
    await second;
    expect(api.signInWithPassword.mock.calls.map(([args]) => args.options.captchaToken)).toEqual(['secret-token-1', 'secret-token-2']);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally { spies.forEach(spy => spy.mockRestore()); }
});

test('local auth never requests captcha', async () => {
  const captcha = { getCaptchaToken: jest.fn() };
  const { state } = auth(captcha, false);
  await state.signInWithEmail('a@b.com', 'password');
  await state.signUpWithEmail('a@b.com', 'password', 'A', 'B');
  expect(captcha.getCaptchaToken).not.toHaveBeenCalled();
});

test.each([
  [undefined, true, false, 'off'], ['optional', true, false, 'optional'], ['required', true, false, 'required'],
  ['required', false, false, 'off'], ['required', true, true, 'off'], ['typo', true, false, 'off'],
])('config mode %s, real=%s offline=%s => %s', (mode, real, offline, expected) => {
  const result = load('src/config/captcha.ts', { './auth': { REAL_AUTH_CONFIGURED: real }, './offline': { OFFLINE_MODE: offline } },
    { process: { env: { EXPO_PUBLIC_CAPTCHA_MODE: mode } } });
  expect(result.CAPTCHA_MODE).toBe(expected);
  expect(result.TURNSTILE_BASE_URL).toBe('https://snapscore-web.augie-os.workers.dev');
});

test('HTML uses explicit rendering, public key, bridge and escaped request values', () => {
  const { buildTurnstileHtml } = load('src/services/turnstile-html.ts', { '../config/captcha': config('required') });
  const html = buildTurnstileHtml({ id: '</script>', action: 'signin' });
  for (const value of ['public-site-key', 'render=explicit', 'turnstile.render', 'ReactNativeWebView.postMessage', 'error-callback', 'expired-callback', 'timeout-callback', '\\u003c/script>']) expect(html).toContain(value);
  expect(html).not.toMatch(/secret|service_role|SUPABASE_ANON_KEY/i);
});

test('off host renders nothing and registers no host; layout gates mounting', () => {
  const register = jest.fn();
  const { TurnstileHost, allowsCaptchaNavigation } = load('src/components/TurnstileHost.tsx', {
    react: { useState: () => [null, jest.fn()], useEffect: fn => fn() },
    'react/jsx-runtime': {}, 'react-native': {}, '../config/captcha': config('off'),
    '../services/captcha': { registerCaptchaHost: register }, '../services/turnstile-html': {}, '../ui/theme': {},
  });
  expect(TurnstileHost()).toBeNull();
  expect(register).not.toHaveBeenCalled();
  expect(allowsCaptchaNavigation('https://snapscore-web.augie-os.workers.dev/')).toBe(true);
  expect(allowsCaptchaNavigation('https://evil.test')).toBe(false);
  expect(allowsCaptchaNavigation('https://challenges.cloudflare.com/widget', true)).toBe(false);
  expect(allowsCaptchaNavigation('https://challenges.cloudflare.com/widget', false)).toBe(true);
  const layout = fs.readFileSync(path.join(__dirname, '../app/_layout.tsx'), 'utf8');
  expect(layout).toContain('CAPTCHA_MODE !== "off" && <TurnstileHost />');
  const host = fs.readFileSync(path.join(__dirname, '../src/components/TurnstileHost.tsx'), 'utf8');
  expect(host).toContain('source={{ html: buildTurnstileHtml(request), baseUrl: TURNSTILE_BASE_URL }}');
});

test.each(['ios', 'web'])('%s host displays a cancellable challenge and cleans up', platform => {
  let cleanup;
  const complete = jest.fn();
  const unregister = jest.fn();
  const jsx = (type, props) => ({ type, props });
  const NativeWebView = () => null;
  const imports = {
    react: {
      useState: () => [{ id: 'request-1', action: 'signin' }, jest.fn()],
      useEffect: fn => { cleanup = fn(); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Modal: 'Modal', View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: platform } },
    '../config/captcha': config('required'),
    '../services/captcha': { registerCaptchaHost: jest.fn(() => unregister), completeCaptcha: complete },
    '../services/turnstile-html': { buildTurnstileHtml: () => '<html>widget</html>' },
    '../ui/theme': { COLORS: {}, FONTS: {}, RADII: {} },
    ...(platform === 'ios' ? { 'react-native-webview': { WebView: NativeWebView } } : {}),
  };
  const { TurnstileHost } = load('src/components/TurnstileHost.tsx', imports);
  const modal = TurnstileHost();
  expect(modal.props.visible).toBe(true);
  const panel = modal.props.children.props.children;
  const challenge = panel.props.children[1];
  if (platform === 'ios') {
    const webview = challenge.type(challenge.props);
    expect(webview.type).toBe(NativeWebView);
    expect(webview.props.source).toEqual({ html: '<html>widget</html>', baseUrl: config('required').TURNSTILE_BASE_URL });
    expect(webview.props.allowFileAccess).toBe(false);
    expect(webview.props.originWhitelist).toEqual([config('required').TURNSTILE_BASE_URL, 'https://challenges.cloudflare.com']);
  } else {
    expect(challenge.type.name).toBe('WebChallenge');
  }
  panel.props.children[2].props.onPress();
  expect(complete).toHaveBeenCalledWith('request-1');
  cleanup();
  expect(unregister).toHaveBeenCalled();
});
