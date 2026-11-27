// Settings switches sat at the top of their rows on iOS 26 (measured on the simulator: 2pt above,
// 14pt below, in a 43.7pt row). Giving the switch a 28pt box did not move it, and that style also
// replaced Android's 51x44 target. Now: the switch sits in a wrapper that centres itself in the row
// and sets no size and paints nothing; the switch keeps exactly the props its platform rule gives.
const fs = require('node:fs');
const ts = require('typescript');
const m = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/ui/settings-layout.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
const { COLORS } = (() => { const t = { exports: {} }; new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/ui/theme.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(t, t.exports); return t.exports; })();

test('the switch is centred by a wrapper that only aligns, and receives its platform props untouched', () => {
  expect(m.exports.SETTINGS_SWITCH_CENTRE).toEqual({ alignSelf: 'center', alignItems: 'center', justifyContent: 'center' });
  expect(m.exports).not.toHaveProperty('settingsSwitchFrame');
  const screen = fs.readFileSync('app/settings.tsx', 'utf8');
  const row = screen.slice(screen.indexOf('// The whole row is the switch'), screen.indexOf('function PickerRow'));
  const tag = row.slice(row.indexOf('<Switch'), row.indexOf('/>', row.indexOf('<Switch')));
  expect(row.slice(0, row.indexOf('<Switch'))).toMatch(/<View style=\{SETTINGS_SWITCH_CENTRE\}>\s*$/);
  expect(tag).toContain('{...settingsSwitchProps(Platform.OS, value, COLORS)}');
  expect(tag).not.toMatch(/\bstyle=/); // nothing may replace the style the platform rule gives
  // what the Switch actually receives
  expect(m.exports.settingsSwitchProps('android', true, COLORS).style).toEqual({ minWidth: 51, minHeight: 44 });
  expect(m.exports.settingsSwitchProps('ios', true, COLORS)).toEqual({ trackColor: { true: COLORS.primary } });
});
