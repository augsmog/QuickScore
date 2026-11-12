const { execFileSync } = require('node:child_process');

test('every game info sheet uses a visible forest border and upward shadow', () => {
  const result = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    const sheet = await import('./src/ui/gameSheetStyle.ts');
    const theme = await import('./src/ui/theme.ts');
    console.log(JSON.stringify({ style: (sheet.default ?? sheet).GAME_SHEET_STYLE, colors: (theme.default ?? theme).COLORS }));
  `], { encoding: 'utf8' });
  const { style, colors } = JSON.parse(result);
  for (const edge of ['Top', 'Left', 'Right']) expect(style[`border${edge}Width`]).toBe(1);
  expect(style.borderColor).toBe(colors.sheetBorder);
  const rgba = style.borderColor.match(/^rgba\(23,\s*92,\s*58,\s*([\d.]+)\)$/);
  expect(rgba).not.toBeNull();
  expect(Number(rgba[1])).toBeGreaterThanOrEqual(0.25);
  expect(Number(rgba[1])).toBeLessThanOrEqual(0.35);
  expect(style.borderTopLeftRadius).toBe(24);
  expect(style.borderTopRightRadius).toBe(24);
  expect(style.shadowOffset.height).toBeLessThan(0);
  expect(style.shadowOpacity).toBeGreaterThan(0);
  expect(style.shadowRadius).toBe(12);
  expect(style.elevation).toBe(12);
});
