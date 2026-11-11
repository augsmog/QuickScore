const fs = require('node:fs');
const path = require('node:path');

const mapPath = path.join(__dirname, '../docs/metrics/day14-day30-metric-map.md');
const map = fs.readFileSync(mapPath, 'utf8');

describe('Day-14/30 metric map source links', () => {
  test('every named event and table points to an existing source with that event or table', () => {
    const rows = map.split('\n').filter((line) => line.startsWith('| '));
    const eventRefs = [];
    const tableRefs = [];
    for (const row of rows) {
      for (const match of row.matchAll(/event `([^`]+)` in `([^`]+)`/g)) {
        eventRefs.push({ name: match[1], file: match[2] });
      }
      for (const match of row.matchAll(/table `public\.([a-z_]+)` in `([^`]+)`/g)) {
        tableRefs.push({ name: match[1], file: match[2] });
      }
      for (const match of row.matchAll(/`public\.([a-z_]+)` in the same migration/g)) {
        const migration = row.match(/in `([^`]+\.sql)`/);
        if (migration) tableRefs.push({ name: match[1], file: migration[1] });
      }
    }

    expect(eventRefs.length).toBeGreaterThan(0);
    expect(tableRefs.length).toBeGreaterThan(0);
    for (const { name, file } of eventRefs) {
      const source = path.join(__dirname, '..', file);
      expect(fs.existsSync(source)).toBe(true);
      expect(fs.readFileSync(source, 'utf8')).toContain(`"${name}"`);
    }
    for (const { name, file } of tableRefs) {
      const source = path.join(__dirname, '..', file);
      expect(fs.existsSync(source)).toBe(true);
      expect(fs.readFileSync(source, 'utf8')).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  test('uses the TD entitlement event and keeps the Pro-free launch framing', () => {
    expect(map).toContain('Tournament Director paid conversion');
    expect(map).toContain('event `tournament director entitlement started`');
    expect(map).toContain('`period_type = normal`');
    expect(map).toContain('organizer accounts with at least one `contest setup saved`');
    expect(map).toContain('report `trial` and `intro` starts separately');
    expect(map).toContain('Pro is disabled behind `pro_enabled`');
    expect(map).not.toMatch(/trial-to-paid/i);
    expect(map.split('\n').filter((line) => line.startsWith('| ')).map((line) => line.split('|')[1])
      .join(' ')).not.toMatch(/Pro trial/i);
    expect(map).not.toContain('MISSING');
    expect(map).not.toMatch(/50\+\s+game modes/i);
    expect(map).toContain('planning assumptions');
  });
});
