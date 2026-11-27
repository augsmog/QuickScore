// AUG-1601: runs in the unit suite (`npm test`), so a commit that adds an automatic trigger to
// any workflow fails before it lands.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { lintWorkflow, lintWorkflowDir, normalizeOn, SCHEDULE_ALLOWED, OWNER_PINNED, PINNED_ON } = require('../scripts/ci/workflow-triggers-lint.cjs');

const NEED = `      - name: "Disk need (AUG-1601): record free GB; fail only if below NEED_GB"
        run: |
          if [ -n "\${NEED_GB:-}" ] && [ "$free" -lt "$NEED_GB" ]; then exit 1; fi
`;
const wf = (on, jobs = '  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: "true"\n') => `name: fixture\n${on}\njobs:\n${jobs}`;

const WORKFLOWS = path.resolve(__dirname, '..', '..', '.github', 'workflows');

test('every workflow in this repository passes: manual-only, apart from the named exceptions', () => {
  const { files, errors } = lintWorkflowDir(WORKFLOWS);
  assert.ok(files.length >= 17, `expected the repository's workflows, found ${files.length}`);
  assert.deepEqual(errors, []);
});

test('the exception lists are exactly the ones decided, and each named file exists', () => {
  assert.deepEqual(SCHEDULE_ALLOWED, ['mac-runner-hygiene.yml', 'mac-runner-watch.yml', 'launch-ready.yml', 'e2e-staging.yml']);
  assert.deepEqual(Object.keys(OWNER_PINNED), ['device-layout-gate.yml']);
  for (const file of [...SCHEDULE_ALLOWED, ...Object.keys(OWNER_PINNED)]) assert.ok(fs.existsSync(path.join(WORKFLOWS, file)), file);
});

test('a new scheduled workflow that is not on the list fails', () => {
  const scheduled = wf('on:\n  schedule:\n    - cron: "5 * * * *"\n  workflow_dispatch:');
  assert.deepEqual(lintWorkflow('nightly-anything.yml', scheduled), ['nightly-anything.yml: trigger "schedule" is not allowed; only mac-runner-hygiene.yml, mac-runner-watch.yml, launch-ready.yml, e2e-staging.yml may run on a schedule. See AUG-1601.']);
  assert.deepEqual(lintWorkflow('mac-runner-hygiene-2.yml', scheduled).length, 1);
  // The named workflows may keep their own schedule, and nothing more.
  for (const file of SCHEDULE_ALLOWED) {
    const cron = PINNED_ON[file].schedule[0].cron;
    const own = `on:\n  schedule:\n    - cron: "${cron}"\n  workflow_dispatch:`;
    assert.deepEqual(lintWorkflow(file, wf(own)), []);
    assert.match(lintWorkflow(file, wf(`${own}\n  pull_request:`))[0], /trigger "pull_request" is not allowed/);
    assert.match(lintWorkflow(file, wf(`${own}\n  push:`))[0], /trigger "push" is not allowed/);
    assert.match(lintWorkflow(file, wf(`on:\n  schedule:\n    - cron: "${cron}"`))[0], /must also be runnable by hand/);
    // Same trigger names, different schedule: every minute, or a second cron line.
    assert.match(lintWorkflow(file, wf('on:\n  schedule:\n    - cron: "* * * * *"\n  workflow_dispatch:'))[0], /the "on:" block is pinned, filters included/);
    assert.match(lintWorkflow(file, wf(`on:\n  schedule:\n    - cron: "${cron}"\n    - cron: "*/5 * * * *"\n  workflow_dispatch:`))[0], /is pinned, filters included/);
  }
});

test('the owner-pinned workflow must keep exactly its recorded triggers', () => {
  const gate = (on) => lintWorkflow('device-layout-gate.yml', wf(on));
  assert.deepEqual(gate('on:\n  pull_request:\n  push:\n    branches: [main]\n  workflow_dispatch:'), []);
  assert.match(gate('on:\n  pull_request:\n  push:\n  workflow_dispatch:\n  schedule:\n    - cron: "5 * * * *"')[0], /pinned to \[pull_request, push, workflow_dispatch\] by owner decision \(AUG-1380\)/);
  assert.match(gate('on:\n  workflow_dispatch:')[0], /pinned to/);
  // DotBot's two negatives (AUG-1601): the trigger NAMES are unchanged, the filters are not.
  // 1. push restricted to main replaced by unrestricted push.
  assert.match(gate('on:\n  pull_request:\n  push:\n  workflow_dispatch:')[0], /the "on:" block is pinned, filters included.*found \{"pull_request":null,"push":null,"workflow_dispatch":true\}/);
  // 2. pull_request narrowed to closed pull requests only.
  assert.match(gate('on:\n  pull_request:\n    types: [closed]\n  push:\n    branches: [main]\n  workflow_dispatch:')[0], /is pinned, filters included.*"types":\["closed"\]/);
  // And the neighbours: another branch, an extra branch, a paths filter, pull_request_target-style branches.
  for (const changed of [
    'on:\n  pull_request:\n  push:\n    branches: [release]\n  workflow_dispatch:',
    'on:\n  pull_request:\n  push:\n    branches: [main, "claude/**"]\n  workflow_dispatch:',
    'on:\n  pull_request:\n  push:\n    branches: [main]\n    paths: ["docs/**"]\n  workflow_dispatch:',
    'on:\n  pull_request:\n    branches: [main]\n  push:\n    branches: [main]\n  workflow_dispatch:',
    'on:\n  pull_request:\n  push:\n    tags: ["v*"]\n  workflow_dispatch:',
  ]) assert.match(gate(changed)[0], /is pinned, filters included/, changed);
  // Spelling and key order do not matter; workflow_dispatch inputs are free.
  assert.deepEqual(gate('"on":\n  workflow_dispatch:\n    inputs:\n      sha:\n        required: true\n  push:\n    branches:\n      - main\n  pull_request:'), []);
  // Its Mac jobs are not exempt from the disk-need step.
  const gateTriggers = 'on:\n  pull_request:\n  push:\n    branches: [main]\n  workflow_dispatch:';
  const macJob = (steps) => `  ios-sim:\n    runs-on: [self-hosted, ios-sim]\n    env:\n      NEED_GB: ""\n    steps:\n${steps}`;
  assert.match(lintWorkflow('device-layout-gate.yml', wf(gateTriggers, macJob('      - uses: actions/checkout@v4\n')))[0], /must start with the "Disk need \(AUG-1601\)" step/);
  assert.deepEqual(lintWorkflow('device-layout-gate.yml', wf(gateTriggers, macJob(`${NEED}      - uses: actions/checkout@v4\n`))), []);
  // The pin is by file name: the same triggers anywhere else are refused.
  assert.equal(lintWorkflow('another-gate.yml', wf('on:\n  pull_request:\n  push:\n  workflow_dispatch:')).length, 2);
});

test('a manual-only workflow passes, with or without inputs', () => {
  assert.deepEqual(lintWorkflow('ok.yml', wf('on:\n  workflow_dispatch:')), []);
  assert.deepEqual(lintWorkflow('ok.yml', wf('on: workflow_dispatch')), []);
  assert.deepEqual(lintWorkflow('ok.yml', wf('on: [workflow_dispatch]')), []);
  assert.deepEqual(lintWorkflow('ok.yml', wf('on:\n  workflow_dispatch:\n    inputs:\n      sha:\n        required: true')), []);
});

test('the lint fires on a fixture with on: push', () => {
  assert.deepEqual(lintWorkflow('bad.yml', wf('on: push')), ['bad.yml: trigger "push" is not allowed; workflows in this repository are manual-only (workflow_dispatch). See AUG-1601.']);
});

test('every automatic trigger is refused, in every YAML spelling, even beside workflow_dispatch', () => {
  for (const trigger of ['push', 'pull_request', 'pull_request_target', 'schedule', 'workflow_run', 'release', 'issue_comment', 'workflow_call', 'merge_group']) {
    for (const on of [`on: ${trigger}`, `on: [workflow_dispatch, ${trigger}]`, `on:\n  workflow_dispatch:\n  ${trigger}:`, `"on":\n  ${trigger}:\n  workflow_dispatch:`]) {
      const errors = lintWorkflow('bad.yml', wf(on));
      assert.equal(errors.length, 1, `${JSON.stringify(on)} -> ${JSON.stringify(errors)}`);
      assert.match(errors[0], new RegExp(`trigger "${trigger}" is not allowed`));
    }
  }
  assert.match(lintWorkflow('bad.yml', wf('on:\n  schedule:\n    - cron: "17 * * * *"'))[0], /trigger "schedule"/);
});

test('a workflow with no trigger, or that is not YAML, is refused', () => {
  assert.match(lintWorkflow('none.yml', 'name: x\njobs: {}\n')[0], /no trigger found/);
  assert.match(lintWorkflow('broken.yml', 'on: [push\n')[0], /not valid YAML/);
  assert.match(lintWorkflow('empty.yml', '')[0], /empty or not a workflow/);
});

test('a job on the self-hosted Mac must declare NEED_GB and start with the disk-need step', () => {
  const mac = (steps, env = '    env:\n      NEED_GB: ""\n') => wf('on:\n  workflow_dispatch:', `  ios:\n    runs-on: [self-hosted, ios-sim]\n${env}    steps:\n${steps}`);
  // Unset (record only) and a measured number both pass: no fixed threshold is enforced.
  assert.deepEqual(lintWorkflow('mac.yml', mac(`${NEED}      - uses: actions/checkout@v4\n`)), []);
  assert.deepEqual(lintWorkflow('mac.yml', mac(`${NEED}      - uses: actions/checkout@v4\n`, '    env:\n      NEED_GB: "38"\n')), []);
  assert.match(lintWorkflow('mac.yml', mac('      - uses: actions/checkout@v4\n'))[0], /must start with the "Disk need \(AUG-1601\)" step/);
  assert.match(lintWorkflow('mac.yml', mac(`      - uses: actions/checkout@v4\n${NEED}`))[0], /must start with/);
  assert.match(lintWorkflow('mac.yml', mac('      - name: "Disk need (AUG-1601): looks right"\n        run: echo ok\n'))[0], /does not read NEED_GB/);
  assert.match(lintWorkflow('mac.yml', mac(`${NEED}      - uses: actions/checkout@v4\n`, ''))[0], /must declare NEED_GB/);
  // Hosted macOS runners are not the Mac mini and need neither.
  assert.deepEqual(lintWorkflow('hosted.yml', wf('on:\n  workflow_dispatch:', '  ios:\n    runs-on: macos-15\n    steps:\n      - run: "true"\n')), []);
});

test('the pinned "on:" blocks are exactly what the files have today, and every file with an automatic trigger is pinned', () => {
  const yaml = require('js-yaml');
  const automatic = [];
  for (const file of fs.readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
    const doc = yaml.load(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8'));
    const on = normalizeOn(Object.hasOwn(doc, 'on') ? doc.on : doc.true);
    if (Object.keys(on).some((name) => name !== 'workflow_dispatch')) automatic.push(file);
    if (PINNED_ON[file]) assert.deepEqual(JSON.stringify(on), JSON.stringify(normalizeOn(PINNED_ON[file])), file);
  }
  assert.deepEqual(automatic.sort(), Object.keys(PINNED_ON).sort());
  assert.deepEqual(Object.keys(PINNED_ON).sort(), [...SCHEDULE_ALLOWED, ...Object.keys(OWNER_PINNED)].sort());
});
