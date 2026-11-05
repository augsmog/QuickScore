'use strict';

const { summarize, toMarkdown } = require('../e2e/consumer-ux-metrics.cjs');

test('consumer observations count activations and scrolls without claiming human findability', () => {
  const rows = summarize([
    [
      { type: 'activate', label: 'Find contest', y: 40, viewportHeight: 667 },
      { type: 'activate', label: 'Continue', y: 700, viewportHeight: 667 },
      { type: 'scroll' },
    ],
  ], ['iPhone SE (375×667)']);

  expect(rows[0]).toMatchObject({
    persona: 'group organizer',
    device: 'iPhone SE (375×667)',
    activations: 2,
    scrolls: 1,
    findability: expect.stringContaining('NOT ASSESSED'),
  });
  expect(rows[0].targets.map(target => target.aboveFold)).toEqual([true, false]);
  expect(toMarkdown(rows)).toContain('Browser simulation only');
  expect(toMarkdown(rows)).toContain('NOT ASSESSED');
});

test('missing participants still receive a row and unknown target positions stay unknown', () => {
  const rows = summarize([[], [{ type: 'activate', label: 'Join', y: null, viewportHeight: 852 }]], ['iPhone SE', 'iPhone 15 Pro']);
  expect(rows).toHaveLength(2);
  expect(rows[0].activations).toBe(0);
  expect(rows[1].targets[0].aboveFold).toBeNull();
  expect(toMarkdown(rows)).toContain('0/0 known (1 unknown)');
});
