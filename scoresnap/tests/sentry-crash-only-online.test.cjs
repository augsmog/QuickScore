// Build 33 reported no crashes at all. Sentry was switched off whenever Join by code is on
// (fda7e19, 29 Oct: "disabled for the online feature lane pending M6 privacy proof"), because
// breadcrumbs, replay and tracing would carry join codes, share tokens and sessions, and nothing
// redacted them. That proof was never done, and Join by code went on in build 33.
// With Join by code on, Sentry now runs crash-only: the exception and its stack, nothing that can
// carry a route, a request or a screen. With it off, everything is as before.
const fs = require('node:fs');
const ts = require('typescript');

const m = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/config/sentry-privacy.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
const { sentryCapture, redactSecrets, scrubSentryEventCrashOnly, scrubSentryEvent } = m.exports;
const layout = fs.readFileSync('app/_layout.tsx', 'utf8');

const TOKEN = 'a'.repeat(64);
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.s1gnatur3_part-xyz';

test('crash-only mode turns off everything that records what the user did or where they were', () => {
  expect(sentryCapture(true)).toEqual({
    crashOnly: true, tracesSampleRate: 0, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,
    enableLogs: false, enableAutoPerformanceTracing: false, enableAppStartTracking: false, enableStallTracking: false,
    replay: false, feedback: false, navigation: false, breadcrumbs: false,
  });
});

test('with Join by code off, capture is exactly what build 32 had', () => {
  expect(sentryCapture(false)).toEqual({
    crashOnly: false, tracesSampleRate: 0.2, replaysSessionSampleRate: 0.1, replaysOnErrorSampleRate: 1,
    enableLogs: true, enableAutoPerformanceTracing: true, enableAppStartTracking: true, enableStallTracking: true,
    replay: true, feedback: true, navigation: true, breadcrumbs: true,
  });
});

test('join codes, share tokens, session tokens and emails are redacted from text', () => {
  expect(redactSecrets('Could not join ABC234 right now')).toBe('Could not join [redacted] right now');
  expect(redactSecrets(`share ${TOKEN} expired`)).toBe('share [redacted] expired');
  expect(redactSecrets(`Bearer ${JWT}`)).toBe('Bearer [redacted]');
  expect(redactSecrets('/join/QWERTY and /r/' + TOKEN)).toBe('/join/[redacted] and /r/[redacted]');
  expect(redactSecrets('user golfer@example.com failed')).toBe('user [redacted] failed');
  expect(redactSecrets('refresh_token=v1.abcDEF123456ghiJKL')).toBe('refresh_token=[redacted]');
  // Ordinary error text survives.
  expect(redactSecrets('Cannot read properties of undefined (reading "holes")')).toBe('Cannot read properties of undefined (reading "holes")');
  expect(redactSecrets(undefined)).toBeUndefined();
});

test('a crash-only event keeps the exception and stack and drops everything else that could carry a secret', () => {
  const event = {
    message: `join ABC234 failed`,
    user: { id: 'user-1', email: 'golfer@example.com', ip_address: '203.0.113.5' },
    tags: { init: 'auth', code: 'ABC234' },
    request: { url: `https://x.supabase.co/rest/v1/rpc/enroll_contest?code=ABC234`, headers: { Authorization: `Bearer ${JWT}` } },
    breadcrumbs: [{ category: 'navigation', data: { to: '/join/ABC234' } }, { category: 'xhr', data: { url: 'https://x/r/' + TOKEN } }],
    extra: { code: 'ABC234', token: TOKEN }, contexts: { app: { app_version: '1.0.1' }, device: { model: 'iPhone17,1' }, os: { version: '26.1' }, state: { route: '/join/ABC234' } },
    transaction: '/join/ABC234',
    exception: { values: [{ type: 'Error', value: `Join code ABC234 rejected for ${JWT}`, stacktrace: { frames: [{ filename: 'app:///main.jsbundle', function: 'enroll', lineno: 10, vars: { code: 'ABC234' } }] } }] },
  };
  const out = scrubSentryEventCrashOnly(structuredClone(event));
  expect(out.user).toEqual({ id: 'user-1' });
  for (const gone of ['request', 'breadcrumbs', 'extra', 'transaction']) expect(out[gone]).toBeUndefined();
  expect(out.contexts).toEqual({ app: { app_version: '1.0.1' }, device: { model: 'iPhone17,1' }, os: { version: '26.1' } });
  expect(out.tags).toEqual({ init: 'auth', code: '[redacted]' });
  expect(out.message).toBe('join [redacted] failed');
  expect(out.exception.values[0].value).toBe('Join code [redacted] rejected for [redacted]');
  expect(out.exception.values[0].type).toBe('Error');
  expect(out.exception.values[0].stacktrace.frames).toEqual([{ filename: 'app:///main.jsbundle', function: 'enroll', lineno: 10 }]);
  // Nothing anywhere in what is sent still holds a secret.
  const sent = JSON.stringify(out);
  for (const secret of ['ABC234', TOKEN, JWT, 'golfer@example.com', '203.0.113.5']) expect(sent).not.toContain(secret);
});

test('an event with no user and no exception is still scrubbed, not thrown on', () => {
  expect(scrubSentryEventCrashOnly({ message: 'x ABC234' })).toEqual({ message: 'x [redacted]' });
  expect(scrubSentryEvent({ user: { email: 'a@b.co' } }).user).toBeUndefined(); // the build 32 scrubber is unchanged
});

test('the app turns Sentry on again, and takes every capture setting from the one rule', () => {
  expect(layout).toContain('enabled: !isPublicShare,');
  expect(layout).not.toMatch(/enabled:[^\n]*CROSS_DEVICE_SHARING_ENABLED/);
  expect(layout).toContain('const capture = sentryCapture(CROSS_DEVICE_SHARING_ENABLED);');
  for (const key of ['tracesSampleRate', 'replaysSessionSampleRate', 'replaysOnErrorSampleRate', 'enableLogs', 'enableAutoPerformanceTracing', 'enableAppStartTracking', 'enableStallTracking']) {
    expect(layout).toContain(`${key}: capture.${key},`);
  }
  expect(layout).toContain('if (!capture.breadcrumbs) return null;');
  expect(layout).toContain('capture.crashOnly ? scrubSentryEventCrashOnly(event) : scrubSentryEvent(event)');
  expect(layout).toMatch(/integrations: \[\s*\.\.\.\(capture\.replay \? \[Sentry\.mobileReplayIntegration\(sentryReplayMask\)\] : \[\]\),\s*\.\.\.\(capture\.feedback \? \[Sentry\.feedbackIntegration\(\)\] : \[\]\),\s*\.\.\.\(capture\.navigation \? \[routingInstrumentation\] : \[\]\),\s*\]/);
  expect(layout).toContain('if (ref?.current && capture.navigation) {');
});
