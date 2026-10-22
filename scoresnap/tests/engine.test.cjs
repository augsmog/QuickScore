const { execFileSync } = require('node:child_process');
for (const file of ['all-calculators.test.ts', 'per-hole-progressive.test.ts', 'comprehensive-scorecard-tests.ts']) {
  test(file, () => {
    const output = execFileSync(process.execPath, ['--import', 'tsx', `src/engine/__tests__/${file}`], { encoding: 'utf8' });
    console.log(output);
    expect(output).not.toMatch(/FAIL/);
  }, 30000);
}
