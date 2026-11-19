require('tsx/cjs');
const { maxFullRowsAboveBottomChrome } = require('../src/ui/tab-bar-metrics.ts');

// Regression for AUG-1159: on iPhone SE, the "Journey course" recent-round
// card rendered 33px visible (raw 68px), overlapping the Home tab bar by
// 73.75x6px, because Home always sliced to 3 cards regardless of fit.
test('unmeasured list stays at the always-safe single row', () => {
  expect(maxFullRowsAboveBottomChrome(null, 667, 68, 68, 8)).toBe(1);
});

test('iPhone SE recent-rounds list only fits one full card above the tab bar', () => {
  // 667 viewport, 68 tab bar reserve, list starts at y=481 (measured SE layout).
  expect(maxFullRowsAboveBottomChrome(481, 667, 68, 68, 8)).toBe(1);
});

test('a taller viewport allows more full cards without ever cutting one short', () => {
  expect(maxFullRowsAboveBottomChrome(481, 900, 68, 68, 8)).toBe(4);
});

test('never returns zero even when the list starts past the safe area', () => {
  expect(maxFullRowsAboveBottomChrome(640, 667, 68, 68, 8)).toBe(1);
});
