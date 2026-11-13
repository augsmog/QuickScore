const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowPath = path.resolve(__dirname, '../../../.github/workflows/pro-shipping-config.yml');
const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';

test('Pro shipping guard workflow covers workflow and app changes on pull requests', () => {
  assert.match(workflow, /^name: Pro shipping config guard$/m);
  assert.match(workflow, /^  pull_request:\n    paths:\n      - ['"]\.github\/workflows\/\*\*['"]\n      - ['"]scoresnap\/\*\*['"]/m);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /node --test scoresnap\/scripts\/ci\/pro-enabled-shipping-config\.node\.cjs/);
});
