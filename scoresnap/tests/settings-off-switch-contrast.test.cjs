// Off state of a Settings switch on iPhone, second pass (27 Nov).
// First pass painted an off colour behind the switch with ios_backgroundColor. Native close-up of
// 4da06bd on iOS 26: a thin darker crescent past the RIGHT edge of every switch, because React
// Native paints that colour on its own fixed 51x31 box and the iOS 26 switch is not that shape.
// Rule now: nothing is ever painted behind or around the switch. The only off-state colour is
// trackColor.false, which React Native hands to UISwitch itself (its tintColor), so whatever iOS
// does with it is drawn inside the control and cannot bleed past it.
const fs = require('node:fs');
const ts = require('typescript');
const load = (file) => { const m = { exports: {} }; new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports); return m.exports; };
const { settingsSwitchProps, SETTINGS_SWITCH_OFF_TRACK, SETTINGS_SWITCH_SLOT } = load('src/ui/settings-layout.ts');
const { COLORS } = load('src/ui/theme.ts');
const screen = fs.readFileSync('app/settings.tsx', 'utf8');

const luminance = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('iPhone: nothing painted behind the switch, in either state', () => {
  for (const value of [true, false]) {
    const props = settingsSwitchProps('ios', value, COLORS);
    for (const key of ['ios_backgroundColor', 'style', 'thumbColor']) expect(props).not.toHaveProperty(key);
    expect(Object.keys(props)).toEqual(['trackColor']);
  }
  expect(fs.readFileSync('src/ui/settings-layout.ts', 'utf8')).not.toMatch(/ios_backgroundColor:/);
  expect(screen).not.toContain('ios_backgroundColor');
});

test('the slot around the switch paints nothing either', () => {
  for (const key of ['backgroundColor', 'borderWidth', 'borderColor', 'borderRadius']) expect(SETTINGS_SWITCH_SLOT).not.toHaveProperty(key);
});

test('the off colour goes to the control itself, and is 3:1 against the row and the knob', () => {
  expect(settingsSwitchProps('ios', false, COLORS).trackColor).toEqual({ false: SETTINGS_SWITCH_OFF_TRACK, true: COLORS.primary });
  const row = screen.slice(screen.indexOf('function ToggleRow'), screen.indexOf('<Switch'));
  expect(row).toContain('backgroundColor: COLORS.surfaceLow');
  expect(ratio(SETTINGS_SWITCH_OFF_TRACK, COLORS.surfaceLow)).toBeGreaterThanOrEqual(3);
  expect(ratio(SETTINGS_SWITCH_OFF_TRACK, '#FFFFFF')).toBeGreaterThanOrEqual(3);
});
