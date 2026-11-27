// The New Contest list ends where the pinned Continue footer begins. With a hard edge there, the
// player card that happens to sit at that edge when the screen is at rest looks sliced by the
// footer: the layout gate's screenshot review failed four wizard checkpoints on iPhone 16 Pro, two
// on iPhone SE and five on Android for exactly that (run 46008363328, rule 2), and it is what the
// owner's negative screenshots from build 32 show. Rows now dissolve into the footer through a
// short fade, and the list keeps enough space at its end for the last card to scroll fully clear
// of both the fade and the footer.
const fs = require('node:fs');
const ts = require('typescript');

const m = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/ui/tournament-setup-layout.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
const { WIZARD_FOOTER_FADE_PX, WIZARD_END_SPACE_PX, wizardFooterFadeColors } = m.exports;
const screen = fs.readFileSync('app/contest/new.tsx', 'utf8');

test('the fade is short, and the end space clears it with room to spare', () => {
  expect(WIZARD_FOOTER_FADE_PX).toBeGreaterThanOrEqual(16);
  expect(WIZARD_FOOTER_FADE_PX).toBeLessThanOrEqual(32);
  // Scrolled to the end, the last card's bottom edge sits WIZARD_END_SPACE_PX above the footer:
  // above the whole fade, by at least the 8pt the gate asks between independent elements.
  expect(WIZARD_END_SPACE_PX - WIZARD_FOOTER_FADE_PX).toBeGreaterThanOrEqual(8);
});

test('the fade runs from the background fully clear to the background fully solid', () => {
  expect(wizardFooterFadeColors('#FAF4E8')).toEqual(['#FAF4E800', '#FAF4E8']);
  expect(() => wizardFooterFadeColors('rgb(1,2,3)')).toThrow(/#RRGGBB/);
  const bg = /\n  bg: "(#[0-9A-Fa-f]{6})"/.exec(fs.readFileSync('src/ui/theme.ts', 'utf8'))[1];
  expect(wizardFooterFadeColors(bg)[1]).toBe(bg);
});

test('the screen draws the fade over the bottom of the list, and it never takes a touch', () => {
  const start = screen.indexOf('testID="contest-footer-fade"');
  expect(start).toBeGreaterThan(0);
  const tag = screen.slice(screen.lastIndexOf('<LinearGradient', start), screen.indexOf('/>', start) + 2);
  expect(tag).toMatch(/pointerEvents="none"/);
  expect(tag).toMatch(/colors=\{wizardFooterFadeColors\(COLORS\.bg\)\}/);
  expect(tag).toMatch(/position: "absolute", left: 0, right: 0, bottom: 0, height: WIZARD_FOOTER_FADE_PX/);
  // Hidden from assistive technology: it is decoration, not content.
  expect(tag).toMatch(/accessible=\{false\}/);
  expect(tag).toMatch(/importantForAccessibility="no-hide-descendants"/);
  // It sits inside the list's own area (after the ScrollView, before the footer), so it covers the
  // list's bottom edge and not the Continue button.
  const scrollEnd = screen.indexOf('</ScrollView>');
  const areaEnd = screen.indexOf('</KeyboardAvoidingView>');
  expect(scrollEnd).toBeLessThan(start);
  expect(start).toBeLessThan(areaEnd);
  expect(areaEnd).toBeLessThan(screen.indexOf('{/* Bottom Navigation */}'));
});

test('the list ends with the shared end space, not a bare number', () => {
  expect(screen).toMatch(/<View style=\{\{ height: WIZARD_END_SPACE_PX \}\} \/>\s*<\/ScrollView>/);
  expect(screen).not.toMatch(/<View style=\{\{ height: 96 \}\} \/>/);
});
