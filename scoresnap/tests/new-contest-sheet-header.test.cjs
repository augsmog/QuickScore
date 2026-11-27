// The New Contest wizard is presented as a modal. On iPhone that is a sheet that already starts
// below the status bar, so adding the status-bar inset again inside it leaves a band of dead space
// above the header: about 59pt on an iPhone 16 Pro (inset 59 + padding 8 = 67pt, against a 32pt
// limit), about 20pt on an iPhone SE. The layout gate's screenshot review failed every wizard
// checkpoint on iPhone 16 Pro for it (run 46008363328, rule 4), and it is in the owner's negative
// screenshots from build 32. Android presents the same route full screen and does need the inset.
const fs = require('node:fs');
const ts = require('typescript');

function load(file) {
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', code)((id) => { throw new Error(`unexpected import ${id}`); }, m, m.exports);
  return m.exports;
}

const HEADER_PADDING_TOP = 8; // the header row's own paddingTop in app/contest/new.tsx
const MAX_HEADER_OFFSET = 32; // device-layout rubric rule 4, and config rule 4 headerMaxOffset

test('on iPhone the sheet adds no top inset; elsewhere it keeps it', () => {
  const { modalSheetSafeEdges } = load('src/ui/tournament-setup-layout.ts');
  expect(modalSheetSafeEdges('ios')).toEqual(['bottom']);
  expect(modalSheetSafeEdges('android')).toEqual(['top', 'bottom']);
  expect(modalSheetSafeEdges('web')).toEqual(['top', 'bottom']);
  expect(modalSheetSafeEdges(undefined)).toEqual(['top', 'bottom']);
});

test('the header starts within 32pt of the sheet on every iPhone, whatever its status-bar inset', () => {
  const { modalSheetSafeEdges } = load('src/ui/tournament-setup-layout.ts');
  // Status-bar insets: SE 20, notch 47, Dynamic Island 59 and 62.
  for (const insetTop of [20, 47, 59, 62]) {
    const applied = modalSheetSafeEdges('ios').includes('top') ? insetTop : 0;
    expect(applied + HEADER_PADDING_TOP).toBeLessThanOrEqual(MAX_HEADER_OFFSET);
  }
  const rule4 = JSON.parse(fs.readFileSync('e2e/device-layout/config/device-layout.config.json', 'utf8')).rules.find((r) => r.id === 4);
  expect(rule4.headerMaxOffset).toBe(MAX_HEADER_OFFSET);
});

test('the wizard uses it, and is still presented as a modal', () => {
  const screen = fs.readFileSync('app/contest/new.tsx', 'utf8');
  expect(screen).toMatch(/<SafeScreen style=\{\{ flex: 1, backgroundColor: COLORS\.bg \}\} edges=\{modalSheetSafeEdges\(Platform\.OS\)\}>/);
  expect(screen).not.toMatch(/<SafeScreen[^>]*edges=\{\["top", "bottom"\]\}/);
  // The header's own padding is what the arithmetic above assumes.
  expect(screen).toMatch(/\{\/\* Header \*\/\}\s*<View style=\{\{ paddingHorizontal: 20, paddingTop: 8, /);
  // If this route stops being a sheet (for example fullScreenModal), the header would sit under
  // the status bar on iPhone: this test must then be revisited, not deleted.
  const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
  expect(layout).toMatch(/name="contest\/new"\s*options=\{\{\s*presentation: "modal",/);
});
