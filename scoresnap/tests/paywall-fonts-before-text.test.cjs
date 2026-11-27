// The paywall is the only screen set in Inter, and it loads Inter itself. It used to draw its text
// straight away: Android measures each line with the fallback font, then draws it in Inter when the
// font arrives, and does not measure again. Inter is wider, so lines came out cut: "Fre" for
// "Free", "$79.99/y…" for "$79.99/year", "Cancel anytim" for "Cancel anytime." The layout gate's
// screenshot review failed the Android paywall for exactly those three (run 46008363328, rules 3
// and 2). A cut-off price or renewal line on a paywall is a defect on any platform.
// The screen now draws no text until its fonts are in, and draws anyway if they fail to load.
const fs = require('node:fs');
const ts = require('typescript');

const src = fs.readFileSync('app/paywall.tsx', 'utf8');
const file = ts.createSourceFile('paywall.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = file.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'PaywallScreen');
const body = screen.body.statements;
const text = (n) => n.getText(file);

test('the screen keeps the result of loading its fonts', () => {
  const load = body.find((n) => /useFonts\(/.test(text(n)));
  expect(text(load)).toMatch(/^const \[fontsLoaded, fontError\] = useFonts\(\{ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold \}\);$/);
});

test('it returns an empty paywall-coloured screen until the fonts are in, before any text is built', () => {
  const gate = body.findIndex((n) => ts.isIfStatement(n) && /fontsLoaded/.test(text(n.expression)));
  expect(gate).toBeGreaterThan(-1);
  const stmt = body[gate];
  // Loaded, or failed: either way the paywall is drawn. A font that fails must never leave a blank paywall.
  expect(text(stmt.expression)).toBe('!fontsLoaded && !fontError');
  expect(text(stmt.thenStatement)).toBe('return <SafeScreen style={s.safe} testID="paywall-loading-fonts" />;');
  // Every hook comes before the early return (React's rule), and the view is built after it.
  const hooks = body.map((n, i) => (/\buse[A-Z]\w*\(/.test(text(n)) ? i : -1)).filter((i) => i >= 0);
  expect(Math.max(...hooks)).toBeLessThan(gate);
  const view = body.findIndex((n) => /buildPaywallView\(/.test(text(n)));
  expect(view).toBeGreaterThan(gate);
});

test('no line of paywall text is drawn outside the gated view', () => {
  // The only <Text> elements in the file are in the main return and the small `tag` helper, both after the gate.
  const gateEnd = body.find((n) => ts.isIfStatement(n) && /fontsLoaded/.test(text(n.expression))).end;
  const firstText = src.indexOf('<Text');
  expect(firstText).toBeGreaterThan(gateEnd);
});
