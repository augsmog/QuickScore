// Review finding 5 (27 Nov, aec8e82), all older than this candidate: on Sign in the text links had
// about 8pt of padding and no 44pt minimum, the two legal links were words inside an 11pt
// sentence, and the Apple label could overflow its button at large text sizes. In Settings the
// plan title was forced onto one line.
const fs = require('node:fs');
const src = fs.readFileSync('app/auth/sign-in.tsx', 'utf8');
const settings = fs.readFileSync('app/settings.tsx', 'utf8');

test('every text link on Sign in is a button at least 44pt tall', () => {
  const links = [...src.matchAll(/<Pressable\b[\s\S]*?style=\{\{[^}]*\}\}/g)].map((m) => m[0]);
  expect(links.length).toBe(src.split('<Pressable').length - 1);
  expect(links.length).toBeGreaterThanOrEqual(6); // sign in, join, 2 x back, terms, privacy
  for (const tag of links) {
    expect(tag).toMatch(/minHeight: 44/);
    expect(tag).toMatch(/accessibilityRole="(button|link)"/);
  }
  expect(src).not.toMatch(/style=\{\{ alignItems: "center", paddingVertical: 8 \}\}/);
});

test('Terms and Privacy are their own 44pt links, not words inside the small sentence', () => {
  for (const [id, path] of [['sign-in-terms', '/terms'], ['sign-in-privacy', '/privacy']]) {
    const at = src.indexOf(`testID="${id}"`);
    expect(at).toBeGreaterThan(-1);
    const tag = src.slice(src.lastIndexOf('<Pressable', at), src.indexOf('>', src.indexOf('style=', at)));
    expect(tag).toContain('accessibilityRole="link"');
    expect(tag).toContain(`Linking.openURL(SUPPORT_BASE_URL + "${path}")`);
    expect(tag).toMatch(/minHeight: 44/);
    expect(tag).toMatch(/minWidth: 44/);
  }
  expect(src).not.toMatch(/<Text onPress=/); // no tappable words inside a sentence
  expect(src).toContain('By continuing, you agree to our Terms of Service and Privacy Policy.');
});

test('the Apple label can shrink and wrap inside its button instead of overflowing', () => {
  const at = src.indexOf('Continue with Apple');
  const label = src.slice(src.lastIndexOf('<Text', at), at);
  expect(label).toMatch(/flexShrink: 1/);
  expect(label).toMatch(/textAlign: "center"/);
});

test('the Settings plan title and its line below may wrap', () => {
  const at = settings.indexOf('{C.td}</Text>');
  expect(at).toBeGreaterThan(-1);
  const row = settings.slice(settings.lastIndexOf('<AnimatedPressable', at), settings.indexOf('</AnimatedPressable>', at));
  expect(row).not.toContain('numberOfLines={1}');
});
