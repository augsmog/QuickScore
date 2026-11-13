import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml');

test('host regression runs after browser setup and before full disposable acceptance', () => {
  const workflow = load(readFileSync(new URL('../../.github/workflows/xdevice-stack.yml', import.meta.url), 'utf8'));
  const steps = workflow.jobs['xdevice-browser-two-users'].steps;
  const setup = steps.findIndex(step => step.uses === './.github/actions/playwright-chromium');
  const regression = steps.findIndex(step => step.run?.includes('tests/xdevice-host-player.test.mjs'));
  const acceptance = steps.findIndex(step => step.run?.includes('node e2e/xdevice-four-context.mjs'));
  assert.ok(setup >= 0, 'shared pinned browser setup is required');
  assert.ok(regression > setup, 'real Chromium host regression must follow browser setup');
  assert.ok(acceptance > regression, 'full acceptance must follow the host regression');
  assert.equal(steps[regression]['working-directory'], 'scoresnap');
  assert.ok(steps[regression].run.includes('tests/xdevice-workflow.test.mjs'), 'CI must exercise this workflow contract');
  assert.ok(!steps.some(step => /npx playwright install/.test(step.run ?? '')), 'use shared browser installation');
  assert.ok(steps.some(step => step.uses === 'actions/upload-artifact@v4' && step.if === 'always()'), 'retain failed-run evidence');
});
