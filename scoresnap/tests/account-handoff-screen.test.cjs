const { shouldShowAccountHandoff } = require('../src/services/account-handoff-screen.ts');

test('account handoff appears only on home and settings routes', () => {
  expect(shouldShowAccountHandoff(['(tabs)'])).toBe(true);
  expect(shouldShowAccountHandoff(['(tabs)', 'index'])).toBe(true);
  expect(shouldShowAccountHandoff(['settings'])).toBe(true);
  expect(shouldShowAccountHandoff(['(tabs)', 'profile'])).toBe(false);
  expect(shouldShowAccountHandoff(['contest', '[id]', 'scorecard'])).toBe(false);
  expect(shouldShowAccountHandoff(['contest', 'new'])).toBe(false);
  expect(shouldShowAccountHandoff(['join', '[code]'])).toBe(false);
  expect(shouldShowAccountHandoff(['r', '[token]'])).toBe(false);
});
