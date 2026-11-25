// AUG-1370: Join Contest entry point missing in release builds.
//
// Root cause: every Join entry (home `home-join-code`, sign-in "Join with code", onboarding
// "Join a group") is wrapped in CROSS_DEVICE_SHARING_ENABLED, which src/config/features.ts
// derives from `EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING === "true"`. The testflight/production
// EAS profiles did not commit the flag, so it defaulted false and the entry points were hidden
// in release builds while the /join/enter route still existed.
//
// This file is the in-lane automated regression guard (no native/simulator needed):
//  1. features.ts uses exact "true" semantics (the real build-time lever).
//  2. Each Join entry point is gated by that same constant, so turning the flag on re-exposes
//     the Join UI and its /join/enter route. The two-client native journey (host approval ->
//     player binding -> scoring convergence, 393x852 screenshots) is covered by the device
//     evidence child ticket, not here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const scoresnap = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(scoresnap, rel), 'utf8');

// Load src/config/features.ts fresh under a controlled process.env so the module-eval read of
// EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING is exercised directly.
function loadFeaturesWith(flagValue) {
  const prev = process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING;
  if (flagValue === undefined) delete process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING;
  else process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING = flagValue;
  try {
    const src = read('src/config/features.ts');
    const js = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const m = { exports: {} };
    new Function('require', 'module', 'exports', js)(require, m, m.exports);
    return m.exports;
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING;
    else process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING = prev;
  }
}

test('CROSS_DEVICE_SHARING_ENABLED uses exact "true" semantics (the release lever)', () => {
  assert.equal(loadFeaturesWith('true').CROSS_DEVICE_SHARING_ENABLED, true);
  assert.equal(loadFeaturesWith('false').CROSS_DEVICE_SHARING_ENABLED, false);
  assert.equal(loadFeaturesWith('True').CROSS_DEVICE_SHARING_ENABLED, false);
  assert.equal(loadFeaturesWith('1').CROSS_DEVICE_SHARING_ENABLED, false);
  assert.equal(loadFeaturesWith(undefined).CROSS_DEVICE_SHARING_ENABLED, false);
});

test('every Join entry point is gated by CROSS_DEVICE_SHARING_ENABLED and routes to /join/enter', () => {
  const entries = [
    { file: 'app/(tabs)/index.tsx', marker: 'testID="home-join-code"' },
    { file: 'app/auth/sign-in.tsx', marker: 'Join with code' },
    { file: 'app/onboarding.tsx', marker: 'Join a group' },
  ];
  for (const { file, marker } of entries) {
    const src = read(file);
    assert.ok(src.includes('CROSS_DEVICE_SHARING_ENABLED'),
      `${file} must import/gate on CROSS_DEVICE_SHARING_ENABLED`);
    assert.ok(src.includes(marker), `${file} must contain the Join entry marker: ${marker}`);
    assert.ok(/CROSS_DEVICE_SHARING_ENABLED\s*&&/.test(src),
      `${file} must render the Join entry only when CROSS_DEVICE_SHARING_ENABLED is on`);
    assert.ok(src.includes('/join/enter'), `${file} must route the Join entry to /join/enter`);
  }
});

test('the /join/enter route still exists so a visible entry point is reachable', () => {
  // Expo Router: app/join/[code].tsx handles the /join/enter path.
  const routeSrc = read('app/join/[code].tsx');
  assert.ok(routeSrc.length > 0, 'app/join/[code].tsx route must exist');
});
