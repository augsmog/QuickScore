module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.cjs'],
  cacheDirectory: process.env.JEST_CACHE_DIR || '<rootDir>/.jest-cache',
};
