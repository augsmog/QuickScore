const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FLAG_KEYS, profileRows, guardViolations, renderReport } = require('../scripts/release-profile-gates.cjs');

const scoresnap = path.resolve(__dirname, '..');

test('current shipping profiles report committed defaults and remote auth status without reading accounts', () => {
  const eas = JSON.parse(fs.readFileSync(path.join(scoresnap, 'eas.json'), 'utf8'));
  const rows = Object.fromEntries(profileRows(eas.build).map((row) => [row.name, row]));
  for (const name of ['testflight', 'production']) {
    assert.equal(rows[name].values.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING, 'not committed');
    assert.equal(rows[name].crossDeviceEnabled, false);
    assert.equal(rows[name].values.EXPO_PUBLIC_OFFLINE_MODE, 'not committed');
    assert.equal(rows[name].offlineMode, false);
    assert.equal(rows[name].realAuthConfigured, 'REMOTE/UNKNOWN');
  }
  assert.equal(rows['simulator-offline'].offlineMode, true);
  assert.equal(rows['simulator-offline'].crossDeviceEnabled, false);
  assert.equal(rows['simulator-offline'].authPresence.EXPO_PUBLIC_SUPABASE_URL, false);
});

test('flag derivation uses exact true semantics and reports all four committed values', () => {
  const profile = { env: {
    EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING: 'true',
    EXPO_PUBLIC_OFFLINE_MODE: 'True',
    EXPO_PUBLIC_DEMO_MODE: 'false',
    EXPO_PUBLIC_PRO_ENABLED: '0',
  } };
  const [row] = profileRows({ fixture: profile });
  assert.deepEqual(FLAG_KEYS.map((key) => row.values[key]), ['true', 'True', 'false', '0']);
  assert.equal(row.crossDeviceEnabled, true);
  assert.equal(row.offlineMode, false);
});

test('shipping guard catches offline and demo mutants in store/production profiles', () => {
  assert.deepEqual(guardViolations({
    production: { env: { EXPO_PUBLIC_OFFLINE_MODE: 'true', EXPO_PUBLIC_DEMO_MODE: 'true' } },
    candidateStore: { distribution: 'store', env: { EXPO_PUBLIC_DEMO_MODE: 'true' } },
    candidateStoreOffline: { distribution: 'store', env: { EXPO_PUBLIC_OFFLINE_MODE: 'true' } },
    preview: { distribution: 'internal', env: { EXPO_PUBLIC_DEMO_MODE: 'true' } },
  }), [
    'production must not commit EXPO_PUBLIC_OFFLINE_MODE=true',
    'production must not commit EXPO_PUBLIC_DEMO_MODE=true',
    'candidateStore must not commit EXPO_PUBLIC_DEMO_MODE=true',
    'candidateStoreOffline must not commit EXPO_PUBLIC_OFFLINE_MODE=true',
  ]);
  assert.deepEqual(guardViolations({ production: { env: {} }, testflight: { distribution: 'store', env: {} } }), []);
});

test('report binds SHA, reruns byte-identically, and never prints Supabase values', () => {
  const rows = profileRows({ fixture: { environment: 'production', env: {
    EXPO_PUBLIC_SUPABASE_URL: 'https://secret-project.example',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'fake-secret-key',
  } } });
  assert.equal(rows[0].authPresence.EXPO_PUBLIC_SUPABASE_URL, true);
  assert.equal(rows[0].authPresence.EXPO_PUBLIC_SUPABASE_ANON_KEY, true);
  assert.equal(rows[0].realAuthConfigured, 'true');
  const a = renderReport('abc123', rows);
  const b = renderReport('abc123', profileRows({ fixture: { environment: 'production', env: {
    EXPO_PUBLIC_SUPABASE_URL: 'https://secret-project.example',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'fake-secret-key',
  } } }));
  assert.equal(a, b);
  assert.match(a, /abc123/);
  assert.doesNotMatch(a, /secret-project|fake-secret-key/);
});

test('committed placeholder credentials do not count as real auth', () => {
  const [row] = profileRows({ fixture: { env: {
    EXPO_PUBLIC_SUPABASE_URL: 'https://your-project.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'present',
  } } });
  assert.equal(row.realAuthConfigured, 'false');
});

test('checked-in EAS tree does not enable offline or demo mode in production/store profiles', () => {
  const eas = JSON.parse(fs.readFileSync(path.join(scoresnap, 'eas.json'), 'utf8'));
  assert.deepEqual(guardViolations(eas.build), []);
});
