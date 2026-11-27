// Build 33 (1.0.1) showed every signed-in user a full-width banner on Home and Settings:
// "Round handoff paused. Sign in to the same account and retry." with a ~150pt gap under it.
// Cause: Join by code (EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING) was switched on for the first
// time, and account handoff rode on the same switch. Handoff reads a table and calls two
// functions that were never applied to the production database (supabase/proposed/
// 20261103071000_account_handoff.sql), so it failed at every launch and said so, forever.
// Account handoff now has its own switch, off unless set, and with it off the app neither shows
// the panel nor calls anything that belongs to it.
const fs = require('node:fs');
const ts = require('typescript');
const read = (file) => fs.readFileSync(file, 'utf8');

function features(env) {
  const m = { exports: {} };
  const js = ts.transpileModule(read('src/config/features.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('module', 'exports', 'process', js)(m, m.exports, { env });
  return m.exports;
}

test('account handoff is off unless its own switch is set, whatever Join by code is', () => {
  expect(features({ EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING: 'true' }).ACCOUNT_HANDOFF_ENABLED).toBe(false);
  expect(features({ EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING: 'true', EXPO_PUBLIC_FEATURE_ACCOUNT_HANDOFF: 'false' }).ACCOUNT_HANDOFF_ENABLED).toBe(false);
  expect(features({ EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING: 'true', EXPO_PUBLIC_FEATURE_ACCOUNT_HANDOFF: 'true' }).ACCOUNT_HANDOFF_ENABLED).toBe(true);
  // It needs the online service underneath it: never on by itself.
  expect(features({ EXPO_PUBLIC_FEATURE_ACCOUNT_HANDOFF: 'true' }).ACCOUNT_HANDOFF_ENABLED).toBe(false);
  expect(features({}).ACCOUNT_HANDOFF_ENABLED).toBe(false);
  // Join by code itself is untouched.
  expect(features({ EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING: 'true' }).CROSS_DEVICE_SHARING_ENABLED).toBe(true);
});

test('the release profiles say so in words: handoff off, Join by code on', () => {
  const eas = JSON.parse(read('eas.json'));
  for (const profile of ['testflight', 'production']) {
    expect(eas.build[profile].env.EXPO_PUBLIC_FEATURE_ACCOUNT_HANDOFF).toBe('false');
    expect(eas.build[profile].env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING).toBe('true');
  }
});

test('the root layout mounts the panel, and finishes a handoff at start, only on the handoff switch', () => {
  const layout = read('app/_layout.tsx');
  expect(layout).toContain('{ACCOUNT_HANDOFF_ENABLED && shouldShowAccountHandoff(segments) && <AccountHandoffPanel />}');
  expect(layout).not.toMatch(/CROSS_DEVICE_SHARING_ENABLED && shouldShowAccountHandoff/);
  expect(layout).toContain('if (ACCOUNT_HANDOFF_ENABLED) await finishAccountHandoff();');
  // No call to finishAccountHandoff that is not behind the switch.
  expect(layout.split('finishAccountHandoff()').length - 1).toBe(1);
});

test('signing in prepares a handoff only on the handoff switch', () => {
  const store = read('src/stores/auth-store.ts');
  expect(store.split("if (ACCOUNT_HANDOFF_ENABLED) await require('../services/account-handoff').prepareAccountHandoff();").length - 1).toBe(4);
  expect(store.split('prepareAccountHandoff()').length - 1).toBe(4);
});

test('the service itself does nothing with the switch off: no query to the missing table, no banner text', () => {
  const service = read('src/services/account-handoff.ts');
  const body = (name) => { const at = service.indexOf(`export ${name}`); return service.slice(at, service.indexOf('\n}', at)); };
  for (const fn of ['async function prepareAccountHandoff()', 'function finishAccountHandoff(): Promise<void>']) {
    const text = body(fn);
    const guard = text.indexOf('if (!ACCOUNT_HANDOFF_ENABLED || !onlineEnabled) return');
    expect(guard).toBeGreaterThan(-1);
    // The guard is the first statement: nothing is read or written before it.
    expect(text.slice(text.indexOf('{') + 1, guard).trim()).toBe('');
  }
  // The only place the paused message is set is inside the guarded function.
  expect(service.split('Round handoff paused').length - 1).toBe(1);
});
