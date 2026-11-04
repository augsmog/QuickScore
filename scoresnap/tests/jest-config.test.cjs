const path = require('node:path');

const configPath = path.resolve(__dirname, '../jest.config.cjs');

function loadConfig(cacheDirectory) {
  jest.resetModules();
  delete require.cache[configPath];
  if (cacheDirectory === undefined) delete process.env.JEST_CACHE_DIR;
  else process.env.JEST_CACHE_DIR = cacheDirectory;
  return require(configPath);
}

afterAll(() => {
  delete process.env.JEST_CACHE_DIR;
  delete require.cache[configPath];
});

test('defaults the Jest cache to a gitignored directory inside scoresnap', () => {
  const config = loadConfig(undefined);
  const resolvedCache = config.cacheDirectory.replace('<rootDir>', path.resolve(__dirname, '..'));

  expect(path.resolve(resolvedCache)).toBe(path.join(path.resolve(__dirname, '..'), '.jest-cache'));
});

test('honours JEST_CACHE_DIR when provided', () => {
  const override = '/tmp/custom-jest-cache';

  expect(loadConfig(override).cacheDirectory).toBe(override);
});
