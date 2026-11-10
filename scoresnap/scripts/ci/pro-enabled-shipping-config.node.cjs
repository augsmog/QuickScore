const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const scoresnap = path.resolve(__dirname, '../..');
const root = path.resolve(scoresnap, '..');
const flag = 'EXPO_PUBLIC_PRO_ENABLED';
const allowedFlagOnWorkflows = [
  '.github/workflows/tournament-e2e.yml',
  '.github/workflows/web-smoke.yml',
  '.github/workflows/xdevice-stack.yml',
].sort();

function filesBelow(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(filename) : [filename];
  });
}

function isTruthy(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return Boolean(value);
  return !['', 'false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
}

test('shipping EAS profiles cannot enable the Pro flag', () => {
  const eas = JSON.parse(fs.readFileSync(path.join(scoresnap, 'eas.json'), 'utf8'));
  for (const name of ['production', 'testflight', 'preview', 'simulator', 'simulator-offline']) {
    const profile = eas.build[name];
    assert.ok(profile, `missing EAS build profile: ${name}`);
    assert.equal(isTruthy(profile.env?.[flag]), false, `${name} must not set ${flag} to a truthy value`);
  }
});

test('sample env and TypeScript unset default keep Pro disabled', () => {
  const envExample = fs.readFileSync(path.join(scoresnap, '.env.example'), 'utf8');
  assert.match(envExample, new RegExp(`^${flag}=false$`, 'm'));

  const source = fs.readFileSync(path.join(scoresnap, 'src/config/pro-membership.ts'), 'utf8');
  assert.match(source, /String\(process\.env\.EXPO_PUBLIC_PRO_ENABLED\s*\?\?\s*["']false["']\)\.toLowerCase\(\)\s*===\s*["']true["']/);
});

test('only the explicit CI workflow allowlist may enable the flag', () => {
  const workflowRoot = path.join(root, '.github/workflows');
  const enabledWorkflows = filesBelow(workflowRoot)
    .filter((filename) => /\.(yml|yaml)$/.test(filename))
    .filter((filename) => new RegExp(`${flag}\\s*:\\s*["']?true\\b`, 'i').test(fs.readFileSync(filename, 'utf8')))
    .map((filename) => path.relative(root, filename))
    .sort();

  assert.deepEqual(enabledWorkflows, allowedFlagOnWorkflows);
});
