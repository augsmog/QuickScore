import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// AUG-1177: Default Unit Amount (NumberRow) and Distance Unit (PickerRow) must never
// render below the 44px minimum target. Source-level guard; rendered measurement in PR body.
const src = fs.readFileSync(new URL('../app/settings.tsx', import.meta.url), 'utf8');

function body(name) {
  const start = src.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} exists`);
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

for (const row of ['ToggleRow', 'PickerRow', 'NumberRow']) {
  test(`settings ${row} declares minHeight >= 44`, () => {
    const m = [...body(row).matchAll(/minHeight:\s*(\d+)/g)].map((x) => Number(x[1]));
    assert(m.length > 0 && Math.max(...m) >= 44, `${row} minHeight ${m}`);
  });
}

test('Default Unit Amount and Distance Unit use the guarded row components', () => {
  assert(/<NumberRow[\s\S]{0,200}label="Default Unit Amount"/.test(src));
  assert(/<PickerRow[\s\S]{0,200}label="Distance Unit"/.test(src));
});
