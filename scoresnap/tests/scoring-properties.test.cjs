const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
// Derive the list from the GameType union: adding a game requires an adapter,
// rather than silently leaving it out of the property suite.
const types = fs.readFileSync(path.join(root, 'src/engine/types.ts'), 'utf8');
const games = [...types.split('export type GameType =')[1].split(';')[0].matchAll(/"([a-z_]+)"/g)].map(m => m[1]);
for (const game of games) test(`seeded scoring invariants: ${game} (60 configurations)`, () => {
  const output = execFileSync(process.execPath, ['--import', 'tsx', 'tests/helpers/scoring-properties.ts', game], {
    cwd: root, encoding: 'utf8', timeout: 25000,
  });
  const report = JSON.parse(output.trim());
  expect(report.configurations).toBe(60);
  expect(report.checks).toBeGreaterThan(0);
  console.log(`GS-13 ${JSON.stringify(report)}`);
}, 30000);
