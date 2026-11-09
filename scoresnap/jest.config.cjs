module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/**/*.test.cjs',
    '<rootDir>/src/services/__tests__/partial-import.test.ts',
    '<rootDir>/src/engine/__tests__/leaderboard-rows.test.ts',
    '<rootDir>/src/engine/__tests__/contest-settlement-16p.test.ts',
  ],
  cacheDirectory: process.env.JEST_CACHE_DIR || '<rootDir>/.jest-cache',
};
