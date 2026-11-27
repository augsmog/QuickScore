// Sign-off sheet for 0853a23 (iPhone 17 Pro, iOS 26.4): every Settings switch sat high in its row,
// 3pt from the top and 14pt from the bottom. The iOS 26 switch is 28pt tall and is drawn at the top
// of a taller layout box (39pt, measured from the sheet). On iOS 26 and later the box is now the
// switch's own 28pt, so the row centres the switch itself. Older iOS is left exactly as it was.
const fs = require('node:fs');
const ts = require('typescript');
const m = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/ui/settings-layout.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);

test('the switch box is the height of the switch on iOS 26+, untouched elsewhere, and the iPhone row uses it', () => {
  const { settingsSwitchFrame } = m.exports;
  for (const version of ['26.0', '26.4', 26, '27.1']) expect(settingsSwitchFrame('ios', version)).toEqual({ height: 28 });
  for (const version of ['18.5', 17, undefined, 'x']) expect(settingsSwitchFrame('ios', version)).toBeUndefined();
  for (const os of ['android', 'web']) expect(settingsSwitchFrame(os, '26.4')).toBeUndefined();
  const screen = fs.readFileSync('app/settings.tsx', 'utf8');
  const row = screen.slice(screen.indexOf('// The whole row is the switch'), screen.indexOf('function PickerRow'));
  expect(row).toContain('style={settingsSwitchFrame(Platform.OS, Platform.Version)}');
  expect(row).toMatch(/alignItems: "center"/);
  expect(row).not.toMatch(/backgroundColor: |ios_backgroundColor/); // a height only: nothing painted
});
