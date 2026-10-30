const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function load(file, imports, globals = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require(name) {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  }, setTimeout, clearTimeout, Date, console, URL, ...globals }, { filename });
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
    '../config/features': { CROSS_DEVICE_SHARING_ENABLED: false },
    '../services/auth-session': load('src/services/auth-session.ts', {}),
    '../db/supabase': { supabase: { auth: api } }, '../services/captcha': captcha,
    './persisted-keys': {
      AUTH_STORAGE_KEY: 'snapscore-auth',
      createGatedStorage: (storage) => storage,
      persistGate: { suppressed: false, suppressSignedOutPersist: false },
    },
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


test.each(['optional', 'required'])('%s concurrent timeouts share an invocation deadline', async mode => {
  jest.useFakeTimers();
  const svc = service(mode);
  const host = jest.fn();
  svc.registerCaptchaHost(host);
  const results = [];
  const calls = Array.from({ length: 5 }, () => svc.getCaptchaToken('signin').then(
    token => results.push({ token }), error => results.push({ error: error.message }),
  ));
  await flush();
  expect(host.mock.calls.filter(([request]) => request)).toHaveLength(1);
  await jest.advanceTimersByTimeAsync(svc.CAPTCHA_TIMEOUT_MS - 1);
  expect(results).toHaveLength(0);
  await jest.advanceTimersByTimeAsync(1);
  await Promise.all(calls);
  expect(results).toEqual(Array.from({ length: 5 }, () => mode === 'optional'
    ? { token: undefined } : { error: svc.CAPTCHA_ERROR_MESSAGE }));
  expect(host.mock.calls.filter(([request]) => request)).toHaveLength(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('a queued request opens its own widget for only its remaining time', async () => {
  jest.useFakeTimers();
  const svc = service('optional');
  const host = jest.fn();
  svc.registerCaptchaHost(host);
  const first = svc.getCaptchaToken('signup');
  await flush();
  await jest.advanceTimersByTimeAsync(5_000);
  let settled = false;
  const second = svc.getCaptchaToken('signin').then(token => { settled = true; return token; });
  await jest.advanceTimersByTimeAsync(5_000);
  const firstRequest = host.mock.calls[0][0];
  svc.completeCaptcha(firstRequest.id, 'first-token');
  expect(await first).toBe('first-token');
  await flush();
  const requests = host.mock.calls.filter(([request]) => request).map(([request]) => request);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({ action: 'signin' });
  expect(requests[1].id).not.toBe(firstRequest.id);
  expect(host.mock.calls[1]).toEqual([null]);
  await jest.advanceTimersByTimeAsync(14_999);
  expect(settled).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(await second).toBeUndefined();
  expect(host.mock.calls[3]).toEqual([null]);
  expect(jest.getTimerCount()).toBe(0);
});

// Execute the real WebChallenge effect with a minimal DOM and React hook harness.
function webChallengeHarness() {
  const scripts = [];
  const effects = [];
  const complete = jest.fn();
  const api = { render: jest.fn(() => 'widget-id'), remove: jest.fn() };
  const window = { turnstile: api };
  const document = {
    createElement: jest.fn(() => ({ remove: jest.fn() })),
    head: { appendChild: jest.fn(script => scripts.push(script)) },
  };
  const jsx = (type, props) => ({ type, props });
  const { TurnstileHost } = load('src/components/TurnstileHost.tsx', {
    react: {
      useState: () => [{ id: 'web-request', action: 'signin' }, jest.fn()],
      useRef: () => ({ current: null }),
      useEffect: fn => effects.push(fn),
      createElement: (type, props) => {
        const node = { type };
        props.ref.current = node;
        return node;
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: 'web' } },
    '../config/captcha': config('required'),
    '../services/captcha': { completeCaptcha: complete, registerCaptchaHost: () => () => {} },
    '../services/turnstile-html': { TURNSTILE_SCRIPT_URL: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit' },
    '../ui/theme': { COLORS: {}, FONTS: {}, RADII: {} },
  }, { document, window });
  const modal = TurnstileHost();
  effects.shift()();
  const challenge = modal.props.children.props.children.props.children[1];
  const mount = () => {
    const container = challenge.type(challenge.props);
    const dispose = effects.shift()();
    return { container, dispose };
  };
  return { mount, scripts, api, complete, document };
}

test('web loads the script once, renders configured widgets, forwards success and removes on unmount', async () => {
  const h = webChallengeHarness();
  const first = h.mount();
  expect(h.scripts).toHaveLength(1);
  expect(h.scripts[0].src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  expect(h.scripts[0].async).toBe(true);
  expect(h.api.render).not.toHaveBeenCalled();
  h.scripts[0].onload();
  await flush();
  expect(h.api.render).toHaveBeenCalledWith(first.container, expect.objectContaining({
    sitekey: 'public-site-key', action: 'signin',
  }));
  h.api.render.mock.calls[0][1].callback('web-token');
  expect(h.complete).toHaveBeenCalledWith('web-request', 'web-token');
  first.dispose();
  expect(h.api.remove).toHaveBeenCalledWith('widget-id');
  const second = h.mount();
  await flush();
  expect(h.document.createElement).toHaveBeenCalledTimes(1);
  expect(h.api.render).toHaveBeenCalledTimes(2);
  second.dispose();
  expect(h.api.remove).toHaveBeenCalledTimes(2);
});

test.each(['error-callback', 'expired-callback', 'timeout-callback'])('web %s forwards failure', async callback => {
  const h = webChallengeHarness();
  const widget = h.mount();
  h.scripts[0].onload();
  await flush();
  h.api.render.mock.calls[0][1][callback]();
  expect(h.complete).toHaveBeenCalledWith('web-request');
  widget.dispose();
});

test('web disposal before script load prevents rendering', async () => {
  const h = webChallengeHarness();
  const widget = h.mount();
  widget.dispose();
  h.scripts[0].onload();
  await flush();
  expect(h.api.render).not.toHaveBeenCalled();
  expect(h.api.remove).not.toHaveBeenCalled();
  expect(h.complete).not.toHaveBeenCalled();
});

function restoredAuth(sourceFile = process.env.M4A_AUTH_BASELINE || 'src/stores/auth-store.ts') {
  let state, listener, unsubscribed = 0;
  const keys = load("src/stores/persisted-keys.ts", {});
  const writes = [];
  const session = { user: { id: 'real-guest', is_anonymous: true, app_metadata: { provider: 'anonymous' } }, refresh_token: 'NEVER_PERSIST' };
  const store = load(sourceFile, {
    './persisted-keys': keys,
    zustand: { create: () => initializer => { state = initializer(p => { Object.assign(state, p); if (!keys.persistGate.suppressed) writes.push(p); }, () => state); return {getState: () => state}; } },
    'zustand/middleware': {persist: fn => fn, createJSONStorage: () => ({})},
    '@react-native-async-storage/async-storage': {},
    '../config/auth': {REAL_AUTH_CONFIGURED: true}, '../config/features': {CROSS_DEVICE_SHARING_ENABLED: true},
    '../services/auth-session': load('src/services/auth-session.ts', {}),
    '../db/supabase': {supabase: {auth: {getSession: async () => ({data: {session}, error: null}), onAuthStateChange: cb => {listener = cb; return {data: {subscription: {unsubscribe: () => unsubscribed++}}};}}}},
    '../services/captcha': {},
  });
  return {state, keys, writes, emit: (s, event = 'SIGNED_IN') => listener(event, s), unsubscribed: () => unsubscribed};
}
test('cold guest store restore and listener retain anonymous identity; initialization replaces listener', async () => {
  const {state, emit, unsubscribed} = restoredAuth();
  await state.initialize();
  expect(state.isAnonymous).toBe(true); expect(state.remoteUserId).toBe('real-guest'); expect(state.user.provider).toBe('anonymous');
  expect(JSON.stringify(state.session)).not.toContain('NEVER_PERSIST');
  await state.initialize(); expect(unsubscribed()).toBe(1);
  emit({user:{id:'google',is_anonymous:false,app_metadata:{provider:'google'}}});
  expect(state.isAnonymous).toBe(false); expect(state.user.provider).toBe('google');
  state.skipSignIn(); expect(state.remoteUserId).toBe(null); expect(state.user.id).toMatch(/^anon-/);
});

test('native session adapter surfaces read and write errors', async () => {
  let adapter;
  load(process.env.M4A_STORAGE_BASELINE || 'src/db/supabase.ts', {
    '@supabase/supabase-js': {createClient: (_url, _key, options) => { adapter = options.auth.storage; return {}; }},
    'expo-secure-store': {getItemAsync: async () => {throw Error('keychain unavailable')}, setItemAsync: async () => {throw Error('keychain unavailable')}, deleteItemAsync: async () => {throw Error('keychain unavailable')}},
    'react-native': {Platform: {OS: 'ios'}}, 'expo-crypto': {randomUUID: () => 'test-id'},
    './secure-session-storage': load('src/db/secure-session-storage.ts', {}),
    '../config/features': {CROSS_DEVICE_SHARING_ENABLED: true},
  }, {process: {env: {}}});
  await expect(adapter.getItem('session')).rejects.toThrow('keychain unavailable');
  await expect(adapter.setItem('session', 'value')).rejects.toThrow('keychain unavailable');
});

test('late deletion SIGNED_OUT clears remote identity without recreating auth persistence', async () => {
  const h = restoredAuth();
  await h.state.initialize();
  const count = h.writes.length;
  h.keys.persistGate.suppressSignedOutPersist = true;
  h.emit(null, 'SIGNED_OUT');
  expect(h.writes).toHaveLength(count);
  expect(h.state.remoteUserId).toBe(null);
  expect(h.state.session).toBe(null);
  expect(h.keys.persistGate.suppressed).toBe(false);
});
