// M6 "token privacy gate" (docs/xdevice/plan-rev4.md): code tests do not prove what Sentry
// actually sends. The proof is run on a simulator: a dev build sends its Sentry traffic to a
// listener on the same Mac, and the listener's files are searched for the secrets that were used.
// These tests cover the tools for that proof and the guard that keeps a release build from ever
// being pointed anywhere but the real Sentry project.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const ts = require('typescript');
const load = (file) => { const m = { exports: {} }; new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports); return m.exports; };
const { sentryDsn } = load('src/config/sentry-privacy.ts');
const { scanText, startListener, checkDirectory } = require('../scripts/sentry-proof-listener.cjs');
const REAL = 'https://key@o1.ingest.us.sentry.io/2';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcm9vZiJ9.c2lnbmF0dXJlLXByb29m';

test('only a dev build can be pointed at a listener, and only one on this machine', () => {
  expect(sentryDsn(REAL, 'http://proof@127.0.0.1:9000/1', true)).toBe('http://proof@127.0.0.1:9000/1');
  expect(sentryDsn(REAL, 'http://proof@localhost:9000/1', true)).toBe('http://proof@localhost:9000/1');
  expect(sentryDsn(REAL, 'http://proof@127.0.0.1:9000/1', false)).toBe(REAL); // release build: never
  for (const other of [undefined, '', 'https://x@evil.example/1', 'http://x@127.0.0.1.evil.example/1', 'not a url']) expect(sentryDsn(REAL, other, true)).toBe(REAL);
});

test('no build profile sets the proof variable', () => {
  expect(fs.readFileSync('eas.json', 'utf8')).not.toContain('SENTRY_PROOF');
});

test('the two test triggers exist in dev builds only', () => {
  const profile = fs.readFileSync('app/(tabs)/profile.tsx', 'utf8');
  const dev = profile.slice(profile.indexOf('{__DEV__ && ('));
  expect(dev).toContain('Sentry.captureException(');
  expect(dev).toContain('Sentry.nativeCrash()');
  expect(profile.slice(0, profile.indexOf('{__DEV__ && ('))).not.toContain('nativeCrash');
});

test('the search finds named secrets, any session token and any email, and passes clean text', () => {
  const secrets = ['QZ7K3M', 'feedfacefeedfacefeedfacefeedface'];
  expect(scanText('{"exception":{"values":[{"type":"Error","value":"First error"}]},"event_id":"0123456789abcdef0123456789abcdef"}', secrets)).toEqual([]);
  expect(scanText('url=/join/QZ7K3M', secrets)).toEqual([{ kind: 'named secret', match: 'QZ7K3M' }]);
  expect(scanText('x qz7k3m x', secrets)).toEqual([{ kind: 'named secret', match: 'QZ7K3M' }]); // any letter case
  expect(scanText(`/r/feedfacefeedfacefeedfacefeedface Bearer ${JWT}`, secrets).map((f) => f.kind).sort()).toEqual(['named secret', 'session token']);
  expect(scanText('user a.b@example.com', secrets)).toEqual([{ kind: 'email', match: 'a.b@example.com' }]);
});

test('the listener stores what it is sent, gzip or not, and the check fails on a leak', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-proof-'));
  const server = await startListener({ dir, port: 0 });
  const post = (body, headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/1/envelope/', method: 'POST', headers }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end(body);
  });
  expect(await post('{"event_id":"a"}\n{"type":"event"}\n{"exception":{"values":[{"value":"First error"}]}}')).toBe(200);
  expect(checkDirectory(dir, ['QZ7K3M'])).toEqual({ files: 1, findings: [] });
  expect(await post(zlib.gzipSync('{"breadcrumbs":[{"data":{"url":"https://x/join/QZ7K3M"}}]}'), { 'content-encoding': 'gzip' })).toBe(200);
  const result = checkDirectory(dir, ['QZ7K3M']);
  expect(result.files).toBe(2);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]).toMatchObject({ kind: 'named secret', match: 'QZ7K3M' });
  await new Promise((resolve) => server.close(resolve));
});

test('an empty folder is not a pass: nothing received proves nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-proof-empty-'));
  expect(checkDirectory(dir, ['QZ7K3M'])).toEqual({ files: 0, findings: [] });
  const { verdict } = require('../scripts/sentry-proof-listener.cjs');
  expect(verdict({ files: 0, findings: [] })).toMatch(/^NO PROOF/);
  expect(verdict({ files: 2, findings: [] })).toMatch(/^PASS/);
  expect(verdict({ files: 2, findings: [{ kind: 'email', match: 'a@b.co', file: 'x' }] })).toMatch(/^FAIL/);
});

// Lead decision, 27 Nov: until the proof has been run and passed, a build with Join by code on
// sends nothing to Sentry at all, exactly as build 33. Crash-only capture is ready behind one
// constant, which is turned on only with the proof's PASS line on the ticket.
test('with Join by code on, Sentry stays off in a release build until the proof has passed', () => {
  const { sentryEnabled, SENTRY_TELEMETRY_PROOF_PASSED } = load('src/config/sentry-privacy.ts');
  expect(SENTRY_TELEMETRY_PROOF_PASSED).toBe(false);
  const base = { isPublicShare: false, joinByCodeOn: true, isDevBuild: false, proofDsn: undefined };
  expect(sentryEnabled(base)).toBe(false);
  expect(sentryEnabled({ ...base, proofDsn: 'http://proof@127.0.0.1:9000/1' })).toBe(false); // release build ignores it
  expect(sentryEnabled({ ...base, joinByCodeOn: false })).toBe(true); // as build 32
  expect(sentryEnabled({ ...base, joinByCodeOn: false, isPublicShare: true })).toBe(false);
  expect(sentryEnabled(base, true)).toBe(true); // what flipping the constant does
  expect(sentryEnabled({ ...base, isPublicShare: true }, true)).toBe(false);
});

test('the proof itself can still run: a dev build pointed at the local listener captures', () => {
  const { sentryEnabled } = load('src/config/sentry-privacy.ts');
  const dev = { isPublicShare: false, joinByCodeOn: true, isDevBuild: true, proofDsn: 'http://proof@127.0.0.1:9000/1' };
  expect(sentryEnabled(dev)).toBe(true);
  expect(sentryEnabled({ ...dev, proofDsn: undefined })).toBe(false);
  expect(sentryEnabled({ ...dev, proofDsn: 'https://x@evil.example/1' })).toBe(false);
});

// Review finding (27 Nov, aec8e82): "off" was `enabled: false` with the real DSN still passed. The
// Android native start in the locked SDK reads the DSN but not `enabled`, so native crash
// reporting could still start there. Off now means: no DSN and no native SDK at all, which the
// SDK honours on both platforms (wrapper.js initNativeSdk returns early on either).
test('off means no DSN and no native start, for every release profile, on iPhone and Android', () => {
  const { sentryStart } = load('src/config/sentry-privacy.ts');
  const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8')).build;
  const releaseProfiles = ['testflight', 'production'];
  for (const name of releaseProfiles) {
    const env = eas[name].env;
    expect(env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING).toBe('true');
    expect(Object.keys(env).filter((key) => /SENTRY/.test(key) && key !== 'SENTRY_DISABLE_AUTO_UPLOAD')).toEqual([]);
    for (const platform of ['ios', 'android']) {
      const start = sentryStart(REAL, { isPublicShare: false, joinByCodeOn: env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING === 'true', isDevBuild: false, proofDsn: env.EXPO_PUBLIC_SENTRY_PROOF_DSN });
      expect([name, platform, start]).toEqual([name, platform, { enabled: false, dsn: undefined, enableNative: false, autoInitializeNativeSdk: false }]);
    }
  }
  // The start rule has no platform input at all, so it cannot differ between the two.
  expect(sentryStart.length).toBeLessThanOrEqual(3);
  expect(fs.readFileSync('src/config/sentry-privacy.ts', 'utf8')).not.toMatch(/Platform/);
});

test('on means the real DSN and the native SDK; the proof run means the local listener', () => {
  const { sentryStart } = load('src/config/sentry-privacy.ts');
  expect(sentryStart(REAL, { isPublicShare: false, joinByCodeOn: false, isDevBuild: false, proofDsn: undefined })).toEqual({ enabled: true, dsn: REAL, enableNative: true, autoInitializeNativeSdk: true });
  expect(sentryStart(REAL, { isPublicShare: true, joinByCodeOn: false, isDevBuild: false, proofDsn: undefined }).dsn).toBeUndefined();
  expect(sentryStart(REAL, { isPublicShare: false, joinByCodeOn: true, isDevBuild: true, proofDsn: 'http://proof@127.0.0.1:9000/1' })).toEqual({ enabled: true, dsn: 'http://proof@127.0.0.1:9000/1', enableNative: true, autoInitializeNativeSdk: true });
});

test('the app starts Sentry from that one rule and passes no DSN of its own', () => {
  const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
  expect(layout).toMatch(/const sentryStartOptions = sentryStart\(\s*'https:\/\/[^']+',\s*\{ isPublicShare, joinByCodeOn: CROSS_DEVICE_SHARING_ENABLED, isDevBuild: __DEV__, proofDsn: process\.env\.EXPO_PUBLIC_SENTRY_PROOF_DSN \}\s*\);/);
  const init = layout.slice(layout.indexOf('Sentry.init({'), layout.indexOf('});', layout.indexOf('Sentry.init({')));
  expect(init).toMatch(/^Sentry\.init\(\{\s*\.\.\.sentryStartOptions,/);
  expect(init).not.toMatch(/\bdsn:|\benabled:|enableNative:|autoInitializeNativeSdk:/);
  expect(layout.split('ingest.us.sentry.io').length - 1).toBe(1);
});
