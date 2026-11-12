const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('skins: unplayed holes are not ties (net/gross, carryover on/off)', () => {
  const output = execFileSync(process.execPath, ['--import', 'tsx', 'tests/helpers/skins-midround.ts'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 25000,
  });
  expect(output).toContain('skins mid-round regressions passed');
});
