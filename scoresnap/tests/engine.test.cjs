const runNode = require('./helpers/run-node.cjs');
const path = require('node:path');
for (const file of ['all-calculators.test.ts', 'per-hole-progressive.test.ts', 'comprehensive-scorecard-tests.ts', 'tournament-multi-round.test.ts', 'hopwood-cup-56-player.test.ts']) {
  test(file, () => {
    const output = runNode( ['--import', 'tsx', `src/engine/__tests__/${file}`], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 25000,
    });
    const summary = output.match(/(?:Results|RESULTS): (\d+) passed, (\d+) failed/)
      ?? output.match(/Passed:\s*(\d+)\s+Failed:\s*(\d+)/);
    expect(summary).not.toBeNull();
    expect(Number(summary[1])).toBeGreaterThan(0);
    expect(Number(summary[2])).toBe(0);
    console.log(`GS-13 legacy ${file}: ${summary[1]} checks`);
  }, 30000);
}
