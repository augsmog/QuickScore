const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('unplayed holes: all-zero, nine played, mid-round, and missing scores', () => {
  const output = execFileSync(process.execPath, ['--import','tsx','tests/helpers/unplayed-holes.ts'], {
    cwd:path.resolve(__dirname,'..'), encoding:'utf8', timeout:25000,
  });
  expect(output).toContain('unplayed-hole regressions passed');
});
