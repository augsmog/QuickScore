const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const filename = require.resolve('../src/config/public-share.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function load(platform, window) {
  const exports = {};
  const context = { exports, require: name => {
    if (name !== 'react-native') throw new Error(`Unexpected import: ${name}`);
    return { Platform: { OS: platform } };
  } };
  if (window !== undefined) context.window = window;
  vm.runInNewContext(source, context, { filename });
  return exports.isPublicShare;
}

test.each(['ios', 'android', 'web'])('%s can require public-share with window = {}', platform => {
  expect(() => load(platform, {})).not.toThrow();
  expect(load(platform, {})).toBe(false);
});
test('native never reads location, even if present', () => {
  expect(load('ios', { get location() { throw new Error('Native location accessed'); } })).toBe(false);
});
test('SSR and incomplete locations are safe', () => {
  expect(load('web', undefined)).toBe(false);
  expect(load('web', { location: {} })).toBe(false);
});
test('only web /r/ pages disable Sentry', () => {
  expect(load('web', { location: { pathname: '/r/token' } })).toBe(true);
  for (const pathname of ['/', '/join/code', '/r', '/round']) {
    expect(load('web', { location: { pathname } })).toBe(false);
  }
  expect(load('android', { location: { pathname: '/r/token' } })).toBe(false);
});
