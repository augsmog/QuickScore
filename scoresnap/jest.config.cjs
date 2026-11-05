module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/**/*.test.cjs',
    '<rootDir>/src/services/__tests__/partial-import.test.ts',
  ],
  cacheDirectory: process.env.JEST_CACHE_DIR || '<rootDir>/.jest-cache',
};
