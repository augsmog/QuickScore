// Off state of a Settings switch on iPhone, third pass (27 Nov).
// 1st: off colour painted behind the switch (ios_backgroundColor) -> crescent past the right edge
//      on iOS 26, because React Native paints it on its own 51x31 box.
// 2nd: off colour handed to the control (trackColor.false) -> no crescent, but the off track read
//      exactly the cream row colour (250,244,232): a white knob on a pale outline.
// Now: nothing about the off state is set at all. The rows sit on white, the standard iOS grouped
// list look on a tinted page, so the stock switch is seen the way it is in every iOS list.
// Brand colour is the ON track only.
const fs = require('node:fs');
const ts = require('typescript');
const load = (file) => { const m = { exports: {} }; new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports); return m.exports; };
const layout = load('src/ui/settings-layout.ts');
const { COLORS } = load('src/ui/theme.ts');
const screen = fs.readFileSync('app/settings.tsx', 'utf8');

const luminance = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('iPhone switch: the ON colour and nothing else, in either state', () => {
  for (const value of [true, false]) expect(layout.settingsSwitchProps('ios', value, COLORS)).toEqual({ trackColor: { true: COLORS.primary } });
  expect(fs.readFileSync('src/ui/settings-layout.ts', 'utf8')).not.toMatch(/ios_backgroundColor:/);
  expect(screen).not.toContain('ios_backgroundColor');
  expect(layout).not.toHaveProperty('SETTINGS_SWITCH_OFF_TRACK');
});

test('every Settings row is white with a hairline edge, on the cream page', () => {
  expect(layout.settingsRowSurface(COLORS)).toEqual({ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.border });
  expect(COLORS.bg).toBe('#FAF4E8');
  expect(screen).not.toContain('backgroundColor: COLORS.surfaceLow');
  expect(screen.split('...SETTINGS_ROW_SURFACE').length - 1).toBe(13); // twelve rows and cards; the toggle row is written twice (iPhone, web)
  const row = screen.slice(screen.indexOf('function ToggleRow'), screen.indexOf('function PickerRow'));
  expect(row.split('...SETTINGS_ROW_SURFACE').length - 1).toBe(2); // iPhone shape and web shape
});

test('what the numbers are on a white row', () => {
  // The stock off track is a 16% grey (120,120,128) laid over the row: #E9E9EB on white.
  const over = (c) => Math.round(255 - (255 - c) * 0.16).toString(16).toUpperCase();
  const stockOff = `#${over(120)}${over(120)}${over(128)}`;
  expect(stockOff).toBe('#E9E9EB');
  expect(ratio(stockOff, '#FFFFFF')).toBeGreaterThan(1.2); // 1.21:1, the same as any stock iOS list
  expect(ratio(stockOff, '#FFFFFF')).toBeLessThan(1.25);
  // Row text keeps its contrast on white.
  expect(ratio(COLORS.text, '#FFFFFF')).toBeGreaterThanOrEqual(7);
  expect(ratio(COLORS.textDim, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  expect(ratio(COLORS.primary, '#FFFFFF')).toBeGreaterThanOrEqual(3); // ON track against the row
});
