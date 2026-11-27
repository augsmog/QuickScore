// Owner, build 33, Account settings on his iPhone: every switch "sits on top of a taller beige
// rounded rectangle that sticks out below it", with an oversized dark-green thumb, and a grey pill
// on a near-white track when off. Cause (code unchanged since 16 Nov, AUG-1163 "44px targets"):
// the Switch itself was given minHeight 44 plus ios_backgroundColor, so iOS painted that colour
// on a 51x44 box behind a 31pt switch; and thumbColor/trackColor replaced the system colours.
// On iPhone the switch is now the stock one: no size on it, no background, system thumb, brand
// green for "on", and (since 27 Nov) a visible off colour painted on the stock 51x31 box. The 44pt touch target is the row's slot around it.
const fs = require('node:fs');
const ts = require('typescript');

const m = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/ui/settings-layout.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
const { settingsSwitchProps, SETTINGS_SWITCH_TARGET } = m.exports;
const COLORS = { primary: '#14532D', textDim: '#5B665F', surfaceHigh: '#EEEAE0' };
const screen = fs.readFileSync('app/settings.tsx', 'utf8');

test('iPhone: a stock switch, with the brand colour only on the "on" track', () => {
  for (const value of [true, false]) {
    expect(settingsSwitchProps('ios', value, COLORS)).toEqual({ trackColor: { true: COLORS.primary } });
  }
  const props = settingsSwitchProps('ios', true, COLORS);
  for (const key of ['style', 'thumbColor', 'ios_backgroundColor']) expect(props).not.toHaveProperty(key);
  expect(props.trackColor).not.toHaveProperty('false');
});

test('Android and web keep what they had', () => {
  for (const os of ['android', 'web']) {
    expect(settingsSwitchProps(os, true, COLORS)).toEqual({ style: SETTINGS_SWITCH_TARGET, trackColor: { false: COLORS.surfaceHigh, true: COLORS.primary + '55' }, thumbColor: COLORS.primary });
    expect(settingsSwitchProps(os, false, COLORS).thumbColor).toBe(COLORS.textDim);
  }
});

test('the 44pt touch target is the row itself, a pressable switch; nothing sits between it and the stock switch', () => {
  const row = screen.slice(screen.indexOf('// The whole row is the switch'), screen.indexOf('function PickerRow'));
  expect(row).toMatch(/<AnimatedPressable\s+accessibilityRole="switch"/);
  expect(row).toContain('onPress={() => onToggle(!value)}');
  expect(row).toContain('accessibilityState={{ checked: value }}');
  expect(row).toContain('minHeight: 44');
  // the only thing around the switch is the alignment-only wrapper
  expect(row.match(/<View[^>]*>\s*<Switch/g)).toEqual([expect.stringMatching(/^<View style=\{SETTINGS_SWITCH_CENTRE\}>\s*<Switch$/)]);
  expect(m.exports).not.toHaveProperty('SETTINGS_SWITCH_SLOT');
});

test('the screen takes the switch look from the one helper and sets none of it by hand', () => {
  expect(screen).toContain('{...settingsSwitchProps(Platform.OS, value, COLORS)}');
  const start = screen.indexOf('<Switch'); const tag = screen.slice(start, screen.indexOf('/>', start));
  for (const prop of ['style=', 'thumbColor=', 'trackColor=', 'ios_backgroundColor=']) expect(tag).not.toContain(prop);
  expect(screen.split('<Switch').length - 1).toBe(2); // ToggleRow only: its iPhone shape and its web shape
});
