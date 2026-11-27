const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowPath = path.resolve(__dirname, '../../../.github/workflows/pro-shipping-config.yml');
const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';

// AUG-1601: workflows are manual-only. This guard no longer runs on pull requests by itself;
// it is run by hand (or by the release check) and must stay runnable that way.
test('Pro shipping guard workflow is manual-only and still runs the shipping-config checks', () => {
  assert.match(workflow, /^name: Pro shipping config guard$/m);
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (pull_request|push|schedule):/m);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /node --test scoresnap\/scripts\/ci\/pro-enabled-shipping-config\.node\.cjs/);
});
