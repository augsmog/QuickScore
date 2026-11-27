// Review finding (b), 27 Nov, 5b57487: in a Settings row with a value on the right ("Default Tee
// White", "Manage plan Tournament Director", "Default Unit Amount 5"), the value text could not
// shrink or wrap. At large text sizes on a narrow phone it pushed the label out or ran off the row.
// The value may now take at most half the row, shrinks before the label disappears, and wraps
// right-aligned onto more lines, so the row grows taller instead of overflowing.
const fs = require('node:fs');
const src = fs.readFileSync('app/settings.tsx', 'utf8');
const body = (name, next) => src.slice(src.indexOf(`function ${name}(`), src.indexOf(`function ${next}`));

test.each([['PickerRow', 'NumberRow', '{displayValue}'], ['NumberRow', 'SettingsScreen', '{value}']])('%s: the value column can shrink and wrap', (name, next, value) => {
  const row = body(name, next === 'SettingsScreen' ? 'SettingsScreen' : next);
  expect(row.length).toBeGreaterThan(200);
  const at = row.lastIndexOf(value);
  const tag = row.slice(row.lastIndexOf('<Text', at), at);
  expect(tag).toContain('...SETTINGS_VALUE_COLUMN');
  expect(tag).not.toContain('numberOfLines');
  // the row itself can grow: a minimum height, never a fixed one
  expect(row).toContain('minHeight: 44');
  expect(row).not.toMatch(/[^n]height: \d/);
});

test('the shared rule: at most half the row, shrinkable, right-aligned', () => {
  const ts = require('typescript');
  const m = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/ui/settings-layout.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
  expect(m.exports.SETTINGS_VALUE_COLUMN).toEqual({ flexShrink: 1, maxWidth: '50%', textAlign: 'right' });
});

test('the label side keeps the rest of the row', () => {
  expect(body('PickerRow', 'NumberRow')).toMatch(/color: COLORS\.text, flex: 1 \}\}>\s*\{label\}/);
  expect(body('NumberRow', 'SettingsScreen')).toMatch(/<View style=\{\{ flex: 1 \}\}>\s*<Text[^>]*>\s*\{label\}/);
});
