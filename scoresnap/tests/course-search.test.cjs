const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Load the actual TypeScript with isolated build-time env and native dependencies.
function loadModule(file, env, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    process: { env },
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  return exports;
}

const cases = [
  ['unset', undefined, undefined, false],
  ['key alone', undefined, 'test-key', false],
  ['false', 'false', 'test-key', false],
  ['empty flag', '', 'test-key', false],
  ['uppercase', 'TRUE', 'test-key', false],
  ['padded', ' true ', 'test-key', false],
  ['one', '1', 'test-key', false],
  ['missing key', 'true', undefined, false],
  ['empty key', 'true', '', false],
  ['enabled', 'true', 'test-key', true],
];

function environment(flag, key) {
  return {
    ...(flag === undefined ? {} : { EXPO_PUBLIC_FEATURE_COURSE_SEARCH: flag }),
    ...(key === undefined ? {} : { EXPO_PUBLIC_GOLF_COURSE_API_KEY: key }),
  };
}

test.each(cases)('course-search flag: %s', (_name, flag, key, expected) => {
  expect(loadModule('src/config/features.ts', environment(flag, key)).COURSE_SEARCH_ENABLED)
    .toBe(expected);
});

test.each(cases.filter(row => !row[3]))('course API stays silent and offline: %s', async (_name, flag, key) => {
  const env = environment(flag, key);
  const features = loadModule('src/config/features.ts', env);
  const fetch = jest.fn(() => { throw new Error('Unexpected network call'); });
  const warn = jest.fn();
  const captureException = jest.fn();
  const api = loadModule('src/services/course-api.ts', env, {
    '../config/features': features,
    '@sentry/react-native': { captureException },
  }, { fetch, console: { warn, error: jest.fn() } });
  expect(await api.searchCourses('Pine Valley')).toHaveLength(0);
  expect(await api.getCourseDetail('123')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  expect(captureException).not.toHaveBeenCalled();
});

test('enabled course API still fetches search and detail', async () => {
  const env = environment('true', 'test-key');
  const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ courses: [] }) });
  const api = loadModule('src/services/course-api.ts', env, {
    '../config/features': loadModule('src/config/features.ts', env),
    '@sentry/react-native': { captureException: jest.fn() },
  }, { fetch, console: { warn: jest.fn(), error: jest.fn() } });
  await api.searchCourses('Pine Valley');
  await api.getCourseDetail('123');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][0]).toContain('search=Pine%20Valley');
  expect(fetch.mock.calls[1][0]).toMatch(/\/courses\/123$/);
});
