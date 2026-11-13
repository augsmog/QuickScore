const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../../..');
const launchDir = path.join(root, 'docs', 'launch');
const idRe = /^AUG-\d+$/;
const shaRe = /^[0-9a-f]{40}$/;
const classes = new Set(['Done', 'OPEN-BOT', 'HELD']);

function snapshotFiles() {
  if (!fs.existsSync(launchDir)) return [];
  return fs
    .readdirSync(launchDir)
    .filter((name) => /^AUG-\d+-snapshot-.*\.json$/.test(name))
    .map((name) => path.join(launchDir, name));
}

test('every launch-readiness snapshot JSON has a matching markdown companion', () => {
  for (const file of snapshotFiles()) {
    const md = file.replace(/\.json$/, '.md');
    assert.ok(fs.existsSync(md), `missing markdown companion for ${path.basename(file)}`);
  }
});

test('launch-readiness snapshot JSON has required top-level fields', () => {
  for (const file of snapshotFiles()) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(shaRe.test(data.main_sha || ''), `${path.basename(file)}: main_sha must be a 40-char hex SHA`);
    assert.ok(Array.isArray(data.rows) && data.rows.length > 0, `${path.basename(file)}: rows must be a non-empty array`);
    assert.ok(Array.isArray(data.ci), `${path.basename(file)}: ci must be an array`);
    assert.ok(typeof data.captured_at === 'string' && data.captured_at.length > 0, `${path.basename(file)}: captured_at required`);
  }
});

test('launch-readiness snapshot rows are well-formed and unique', () => {
  for (const file of snapshotFiles()) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const seen = new Set();
    for (const row of data.rows) {
      assert.ok(idRe.test(row.id || ''), `${path.basename(file)}: row id "${row.id}" is not AUG-<n>`);
      assert.ok(!seen.has(row.id), `${path.basename(file)}: duplicate row id ${row.id}`);
      seen.add(row.id);
      assert.ok(classes.has(row.class), `${path.basename(file)}: row ${row.id} has unknown class "${row.class}"`);
    }
  }
});
