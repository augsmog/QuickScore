// Sign-off sheets for 0853a23 (27 Nov): Settings said "Version 1.0.0" in the 1.0.1 candidate. The
// number was typed into the screen, and had been since before build 32. It is now read from the
// build: the app version from the app config that is compiled in, and the build number from the
// installed app itself (EAS assigns it at build time, so the config's own value is not it).
const fs = require('node:fs');
const ts = require('typescript');
const screen = fs.readFileSync('app/settings.tsx', 'utf8');
const source = fs.readFileSync('src/config/app-version.ts', 'utf8');

function load(constants) {
  const m = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)((id) => { if (id === 'expo-constants') return { __esModule: true, default: constants }; throw Error(id); }, m, m.exports);
  return m.exports;
}

test('no typed version anywhere on the Settings screen', () => {
  expect(screen).not.toMatch(/\b\d+\.\d+\.\d+\b/);
  const at = screen.indexOf('Version\n');
  expect(at).toBeGreaterThan(-1);
  expect(screen.slice(at, at + 400)).toContain('{APP_VERSION_LABEL}');
  expect(screen).toContain('import { APP_VERSION_LABEL } from "../src/config/app-version";');
  expect(source).not.toMatch(/\b\d+\.\d+\.\d+\b/);
});

test('version and build number as the installed app has them', () => {
  const { appVersionLabel, APP_VERSION_LABEL } = load({ expoConfig: { version: '1.0.1', ios: { buildNumber: '1' } }, platform: { ios: { buildNumber: '34' } } });
  expect(APP_VERSION_LABEL).toBe('1.0.1 (34)'); // the installed build number, not the config's "1"
  expect(appVersionLabel('2.3.4', '57')).toBe('2.3.4 (57)');
  expect(appVersionLabel('2.3.4', 57)).toBe('2.3.4 (57)');
});

test('Android reads its version code; a missing part is left out, never invented', () => {
  expect(load({ expoConfig: { version: '1.0.1' }, platform: { android: { versionCode: 12 } } }).APP_VERSION_LABEL).toBe('1.0.1 (12)');
  expect(load({ expoConfig: { version: '1.0.1' }, platform: {} }).APP_VERSION_LABEL).toBe('1.0.1');
  expect(load({ expoConfig: null, platform: { ios: { buildNumber: '34' } } }).APP_VERSION_LABEL).toBe('Build 34');
  expect(load({}).APP_VERSION_LABEL).toBe('Unknown');
  const { appVersionLabel } = load({});
  expect(appVersionLabel('  ', null)).toBe('Unknown');
});

test('the app config the build compiles in says the release version', () => {
  expect(JSON.parse(fs.readFileSync('app.json', 'utf8')).expo.version).toBe(JSON.parse(fs.readFileSync('package.json', 'utf8')).version);
});
