const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const workflow = () => yaml.load(fs.readFileSync(path.join(__dirname, '../../.github/workflows/tournament-e2e.yml'), 'utf8'));
function assertSetupContract(value) {
  const job = value.jobs['tournament-e2e'];
  expect(value.permissions).toEqual({ contents: 'read', packages: 'read' });
  expect(job.if).toBeUndefined();
  expect(job['continue-on-error'] ?? false).toBe(false);
  const installers = job.steps.filter(step => step.name === 'Install Supabase CLI');
  expect(installers).toHaveLength(1);
  expect(installers[0].uses).toBe('supabase/setup-cli@v1');
  expect(installers[0].with).toEqual({ version: '2.122.0' });
  expect(installers[0].if).toBeUndefined();
  expect(installers[0]['continue-on-error'] ?? false).toBe(false);
  const tests = [
    ['Run 16-player tournament E2E test', 'BASE_URL=http://127.0.0.1:8089 node e2e/tournament-16-player.mjs'],
    ['Run Hopwood Cup 56-player E2E test', 'BASE_URL=http://127.0.0.1:8089 node e2e/hopwood-cup-56-player.mjs'],
  ];
  for (const [name, command] of tests) {
    const steps = job.steps.filter(step => step.name === name);
    expect(steps).toHaveLength(1);
    expect(steps[0].run).toBe(command);
    expect(steps[0].if).toBeUndefined();
    expect(steps[0]['continue-on-error'] ?? false).toBe(false);
    expect(job.steps.indexOf(steps[0])).toBeGreaterThan(job.steps.indexOf(installers[0]));
  }
}
test('Tournament uses the proven fixed CLI without changing failure or app-test semantics', () => {
  assertSetupContract(workflow());
});
test.each(['latest', '2.121.0', undefined])('reject floating, changed or absent CLI version %s', version => {
  const value = workflow(); value.jobs['tournament-e2e'].steps.find(s => s.name === 'Install Supabase CLI').with.version = version;
  expect(() => assertSetupContract(value)).toThrow();
});
test.each(['setup ignored', 'setup skipped', 'job ignored', 'job skipped', 'test ignored', 'test skipped', 'test removed', 'test command weakened', 'permissions broadened', 'action changed'])('reject %s mutation', mutation => {
  const value = workflow(), job = value.jobs['tournament-e2e'];
  const install = job.steps.find(s => s.name === 'Install Supabase CLI');
  const testStep = job.steps.find(s => s.name === 'Run 16-player tournament E2E test');
  if (mutation === 'setup ignored') install['continue-on-error'] = true;
  if (mutation === 'setup skipped') install.if = 'false';
  if (mutation === 'job ignored') job['continue-on-error'] = true;
  if (mutation === 'job skipped') job.if = 'false';
  if (mutation === 'test ignored') testStep['continue-on-error'] = true;
  if (mutation === 'test skipped') testStep.if = 'false';
  if (mutation === 'test removed') job.steps = job.steps.filter(s => s !== testStep);
  if (mutation === 'test command weakened') testStep.run += ' || true';
  if (mutation === 'permissions broadened') value.permissions.contents = 'write';
  if (mutation === 'action changed') install.uses = 'supabase/setup-cli@v2';
  expect(() => assertSetupContract(value)).toThrow();
});
