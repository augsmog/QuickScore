// Native screenshots of the fix branch (iPhone 17 Pro simulator, 27 Nov): an OFF Settings switch
// was a white knob on a track that nearly vanished into the cream row. The stock off track
// (#E9E9EA) is 1.11:1 against the row colour. The off track now has its own colour, at least 3:1
// against the row (WCAG 1.4.11, non-text contrast) and at least 3:1 against the white knob.
// It is given as ios_backgroundColor with NO size on the Switch, so React Native paints it on the
// stock 51x31 box only; the build 33 defect was the same colour on a 51x44 box.
const fs = require('node:fs');
const ts = require('typescript');
const load = (file) => { const m = { exports: {} }; new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports); return m.exports; };
const { settingsSwitchProps, SETTINGS_SWITCH_OFF_TRACK } = load('src/ui/settings-layout.ts');
const { COLORS } = load('src/ui/theme.ts');

const luminance = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('the Settings row colour is the one the ratio is measured against', () => {
  const screen = fs.readFileSync('app/settings.tsx', 'utf8');
  const row = screen.slice(screen.indexOf('function ToggleRow'), screen.indexOf('<Switch'));
  expect(row).toContain('backgroundColor: COLORS.surfaceLow');
});

test('off track: at least 3:1 against the cream row and against the white knob', () => {
  expect(SETTINGS_SWITCH_OFF_TRACK).toMatch(/^#[0-9A-F]{6}$/);
  expect(ratio(SETTINGS_SWITCH_OFF_TRACK, COLORS.surfaceLow)).toBeGreaterThanOrEqual(3);
  expect(ratio(SETTINGS_SWITCH_OFF_TRACK, '#FFFFFF')).toBeGreaterThanOrEqual(3);
  expect(ratio('#E9E9EA', COLORS.surfaceLow)).toBeLessThan(1.2); // what the stock off track gave
});

test('off and on are told apart by more than the knob position', () => {
  expect(ratio(SETTINGS_SWITCH_OFF_TRACK, COLORS.primary)).toBeGreaterThanOrEqual(2);
});

test('iPhone gets the off colour as ios_backgroundColor and still no size, thumb or style', () => {
  for (const value of [true, false]) {
    const props = settingsSwitchProps('ios', value, COLORS);
    expect(props).toEqual({ trackColor: { true: COLORS.primary }, ios_backgroundColor: SETTINGS_SWITCH_OFF_TRACK });
  }
});
