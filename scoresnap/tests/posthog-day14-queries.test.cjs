const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const queryPath = path.join(root, 'docs/metrics/posthog-day14-queries.md');
const queryPack = fs.readFileSync(queryPath, 'utf8');
const loggerSource = fs.readFileSync(path.join(root, 'src/services/posthog-log.ts'), 'utf8');
const analyticsSource = fs.readFileSync(path.join(root, 'src/services/analytics-web.ts'), 'utf8');

describe('Day-14 PostHog logger query pack', () => {
  test('every queried log body exists in logger code or the product analytics event union', () => {
    const strings = [...queryPack.matchAll(/body\s*=\s*'([^']+)'|body\s+IN\s*\(([^)]+)\)/g)]
      .flatMap((match) => match[1] ? [match[1]] : [...match[2].matchAll(/'([^']+)'/g)].map((value) => value[1]));
    expect(strings.length).toBeGreaterThan(0);
    for (const name of new Set(strings)) {
      const inLogger = loggerSource.includes(`"${name}"`);
      const inProductEvents = analyticsSource.includes(`"${name}"`);
      expect(inLogger || inProductEvents).toBe(true);
    }
  });

  test('uses the Logs store, labels source type, and points from the metric map', () => {
    expect(queryPack).toContain('FROM logs');
    expect(queryPack).toContain('not a Product Analytics event');
    expect(fs.readFileSync(path.join(root, 'docs/metrics/day14-day30-metric-map.md'), 'utf8'))
      .toContain('docs/metrics/posthog-day14-queries.md');
  });

  test('every declared GAP row has a proposed child title', () => {
    const gapRows = queryPack.split('\n').filter((line) => /^\|\s*GAP\s*\|/i.test(line));
    for (const row of gapRows) expect(row).toMatch(/proposed child title:\s*`[^`]+`/i);
  });
});
