// AUG-253j (AUG-746): the fixture/debug "you" hook must return undefined in production
// (no global set → leaderboard pixel-identical) and honor only a non-empty string global.
const fs = require('fs');
const ts = require('typescript');

function load(file) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', source)(require, module, module.exports);
  return module.exports;
}

const { getFixtureYouPlayerId } = load('src/engine/you-fixture.ts');

afterEach(() => {
  delete globalThis.__SNAPSCORE_FIXTURE_YOU__;
});

test('undefined when the global is unset (production default)', () => {
  expect(getFixtureYouPlayerId()).toBeUndefined();
});

test('returns the id when the global is a non-empty string', () => {
  globalThis.__SNAPSCORE_FIXTURE_YOU__ = 'p01';
  expect(getFixtureYouPlayerId()).toBe('p01');
});

test('ignores empty string and non-string values', () => {
  globalThis.__SNAPSCORE_FIXTURE_YOU__ = '';
  expect(getFixtureYouPlayerId()).toBeUndefined();
  globalThis.__SNAPSCORE_FIXTURE_YOU__ = 123;
  expect(getFixtureYouPlayerId()).toBeUndefined();
  globalThis.__SNAPSCORE_FIXTURE_YOU__ = null;
  expect(getFixtureYouPlayerId()).toBeUndefined();
});
