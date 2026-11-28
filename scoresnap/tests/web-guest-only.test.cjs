// On the public website only the join, player-link and spectator pages open.
// The native app and ordinary web test builds are never restricted.
const loader = require('./helpers/load-ts.cjs');
const { guestOnlyBlocks, GUEST_ROUTES } = loader({})('src/config/web-guest.ts');

test('guest-only website: join, player and spectator pages open; everything else is blocked', () => {
  expect(GUEST_ROUTES).toEqual(['join', 'p', 'r']);
  for (const open of ['join', 'p', 'r']) expect(guestOnlyBlocks('web', true, open)).toBe(false);
  for (const closed of [undefined, '(tabs)', 'contest', 'settings', 'paywall', 'auth', 'onboarding', 'scan', 'statistics', 'dev']) expect(guestOnlyBlocks('web', true, closed)).toBe(true);
});

test('the app on a phone, and a web build without the flag, are never restricted', () => {
  for (const platform of ['ios', 'android']) expect(guestOnlyBlocks(platform, true, 'settings')).toBe(false);
  expect(guestOnlyBlocks('web', false, 'settings')).toBe(false);
});

test('the site build turns the restriction on', () => {
  const script = require('node:fs').readFileSync(require.resolve('../scripts/build-web-site.cjs'), 'utf8');
  expect(script).toContain("EXPO_PUBLIC_WEB_GUEST_ONLY: 'true'");
});
