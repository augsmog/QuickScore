const { execFileSync } = require('node:child_process');
test.each([
  ['America/Los_Angeles', '2026-10-22T01:30:00Z', '2026-10-21'],
  ['Asia/Tokyo', '2026-10-21T18:30:00Z', '2026-10-22'],
  ['America/Los_Angeles', '2026-01-01T01:30:00Z', '2025-12-31'],
])('local calendar date in %s for %s', (timezone, instant, expected) => {
  const result = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    `const m = await import('./src/utils/local-date.ts'); const localDate = m.localDate ?? m.default.localDate; console.log(localDate('${instant}'));`],
    { encoding: 'utf8', env: { ...process.env, TZ: timezone } });
  expect(result.trim()).toBe(expected);
});
