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
const { WIZARD_END_SPACE_PX } = m.exports;
const screen = fs.readFileSync('app/contest/new.tsx', 'utf8');

test('the end space is the 96pt it has always been', () => {
  expect(WIZARD_END_SPACE_PX).toBe(96);
  expect(m.exports.WIZARD_FOOTER_FADE_PX).toBeUndefined();
  expect(m.exports.wizardFooterFadeColors).toBeUndefined();
});

// Build 33, seen side by side with build 32: the fade washed out the card under it ("HCP 0 A B"
// ghosted) and read as a rendering glitch. It was added to satisfy a reviewer's rule, not because
// anyone asked for it. It is gone; the list ends at the footer's edge as it did in build 32.
test('the screen draws no fade over the list', () => {
  expect(screen).not.toContain('contest-footer-fade');
  expect(screen).not.toContain('LinearGradient');
  expect(screen).not.toContain('wizardFooterFadeColors');
  expect(screen).not.toContain('WIZARD_FOOTER_FADE_PX');
  // The list is the keyboard-avoiding view's last child again, directly above the footer.
  expect(screen).toMatch(/<\/ScrollView>\s*<\/KeyboardAvoidingView>\s*\{\/\* Bottom Navigation \*\/\}/);
});

test('the list ends with the shared end space, not a bare number', () => {
  expect(screen).toMatch(/<View style=\{\{ height: WIZARD_END_SPACE_PX \}\} \/>\s*<\/ScrollView>/);
  expect(screen).not.toMatch(/<View style=\{\{ height: 96 \}\} \/>/);
});
