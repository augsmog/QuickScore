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
  const requiredCounts = [
    report.minPlayers,
    Math.min(report.minPlayers + 1, report.maxPlayers),
    Math.floor((report.minPlayers + report.maxPlayers) / 2),
    report.maxPlayers,
    ...[2, 3, 4, 8, 40].filter(count => count >= report.minPlayers && count <= report.maxPlayers),
  ];
  for (const count of new Set(requiredCounts)) {
    expect(report.playerCountCoverage[count]).toBeGreaterThan(0);
  }
  expect(Object.values(report.playerCountCoverage).reduce((total, count) => total + count, 0)).toBe(60);
  console.log(`GS-13 ${JSON.stringify(report)}`);
}, 30000);
