const { validateReceipt } = require('../scripts/ci/receipt-validation.cjs');
const sha = '0123456789abcdef0123456789abcdef01234567';

test('accepts a non-empty report with an exact SHA and workflow run id', () => {
  expect(validateReceipt(`Receipt evidence\nSHA: ${sha}\nWorkflow run ID: 42914496272\n`)).toEqual([]);
});

test('rejects a report without a 40-hex SHA and names the missing field', () => {
  expect(validateReceipt('Receipt evidence\nWorkflow run ID: 42914496272\n')).toContain('missing 40-hex SHA');
});

test('rejects a report without a workflow run id or URL and names the missing field', () => {
  expect(validateReceipt(`Receipt evidence\nSHA: ${sha}\n`)).toContain('missing workflow run id or URL');
});
