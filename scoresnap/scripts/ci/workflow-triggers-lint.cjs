// AUG-1601: every GitHub Actions workflow in this repository is manual-only.
//
// Twice in one night an automatic trigger did something nobody asked for: a release workflow in
// another repository would have deployed production on a push, and opening four pull requests
// here silently started four builds on the self-hosted Mac while its disk was full. The rule is
// therefore mechanical, with every exception written down by file name below:
//   - a workflow may trigger on `workflow_dispatch` only;
//   - the workflows in SCHEDULE_ALLOWED may also keep `schedule`, and nothing else;
//   - the workflows in OWNER_PINNED are not changed by this rule and must keep exactly the
//     triggers recorded here, so they cannot quietly gain one either;
//   - no other workflow may have `push`, `pull_request`, `schedule` or any other trigger;
//   - a job on the self-hosted Mac must declare NEED_GB and begin with the disk-need step, which
//     records free disk and fails only when NEED_GB is set and less than that is free.
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const ALLOWED_TRIGGER = 'workflow_dispatch';
const DISK_NEED_STEP = /^Disk need \(AUG-1601\)/;
// Jobs on the Mac that are exempt from the disk-need step, each with the reason. The hygiene job
// is the thing that frees the disk; refusing to run it when the disk is low would defeat it.
const DISK_NEED_EXEMPT = { 'mac-runner-hygiene.yml': { hygiene: 'this job is the disk cleanup itself' } };
// Workflows that may keep `schedule` (lead architect's decisions, Nov 27 2026). The two
// mac-runner files are the only automatic cleaning and watching of the Mac; launch-ready is the
// daily launch-readiness report; e2e-staging keeps a registry result fresher than its 36h limit.
// Adding a file here is a decision, not a convenience.
const SCHEDULE_ALLOWED = ['mac-runner-hygiene.yml', 'mac-runner-watch.yml', 'launch-ready.yml', 'e2e-staging.yml'];
// Owner-approved required check (AUG-1380). Changing its triggers, its jobs or branch protection
// is the owner's decision, so this rule leaves its triggers alone and only pins what it has today.
// Its two self-hosted Mac jobs do carry the disk-need step: that is a safety step which changes
// neither the triggers nor the required-check status.
const OWNER_PINNED = { 'device-layout-gate.yml': { triggers: ['pull_request', 'push', 'workflow_dispatch'], ticket: 'AUG-1380' } };
// For every workflow that has any automatic trigger, the WHOLE approved `on:` block is pinned
// here, filters included, not just the trigger names. `push` limited to main is not the same
// trigger as `push` on every branch, and `pull_request` with no filter is not the same as one
// limited to closed pull requests; with names alone both changes passed (DotBot, AUG-1601).
// Only the inputs of workflow_dispatch are left free. Changing an entry is a decision.
const PINNED_ON = {
  'mac-runner-hygiene.yml': { schedule: [{ cron: '17 * * * *' }], workflow_dispatch: true },
  'mac-runner-watch.yml': { schedule: [{ cron: '47 * * * *' }], workflow_dispatch: true },
  'launch-ready.yml': { schedule: [{ cron: '30 15 * * *' }], workflow_dispatch: true },
  'e2e-staging.yml': { schedule: [{ cron: '23 12 * * *' }], workflow_dispatch: true },
  'device-layout-gate.yml': { pull_request: null, push: { branches: ['main'] }, workflow_dispatch: true },
};

// YAML 1.1 parsers read the bare key `on` as boolean true; accept either spelling.
const triggersOf = (doc) => (doc && Object.hasOwn(doc, 'on') ? doc.on : doc?.true);

function triggerNames(on) {
  if (on === undefined || on === null) return [];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.map(String);
  if (typeof on === 'object') return Object.keys(on);
  return [String(on)];
}
// The `on:` block in one comparable form: every spelling becomes an object, keys are sorted at
// every depth, and workflow_dispatch is reduced to "present" (its inputs are not a trigger).
function normalizeOn(on) {
  let object;
  if (on === undefined || on === null) object = {};
  else if (typeof on === 'string') object = { [on]: null };
  else if (Array.isArray(on)) object = Object.fromEntries(on.map((name) => [String(name), null]));
  else object = { ...on };
  if (Object.hasOwn(object, 'workflow_dispatch')) object.workflow_dispatch = true;
  const sort = (value) => (Array.isArray(value) ? value.map(sort)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]))
      : value);
  return sort(object);
}
const sameOn = (a, b) => JSON.stringify(normalizeOn(a)) === JSON.stringify(normalizeOn(b));
const runsOnMac = (job) => [].concat(job?.['runs-on'] ?? []).map(String).includes('self-hosted');

function lintWorkflow(name, text) {
  const errors = [];
  let doc;
  try { doc = yaml.load(text); } catch (error) { return [`${name}: not valid YAML (${error.message.split('\n')[0]})`]; }
  if (!doc || typeof doc !== 'object') return [`${name}: empty or not a workflow`];
  const names = triggerNames(triggersOf(doc));
  if (OWNER_PINNED[name]) {
    const pinned = OWNER_PINNED[name];
    if ([...names].sort().join(',') !== [...pinned.triggers].sort().join(',')) {
      errors.push(`${name}: triggers are pinned to [${pinned.triggers.join(', ')}] by owner decision (${pinned.ticket}); found [${names.join(', ')}]. Changing them is the owner's call.`);
    }
  } else {
  if (names.length === 0) errors.push(`${name}: no trigger found; a workflow must declare "on: workflow_dispatch"`);
  const allowed = SCHEDULE_ALLOWED.includes(name) ? [ALLOWED_TRIGGER, 'schedule'] : [ALLOWED_TRIGGER];
  for (const trigger of names) {
    if (allowed.includes(trigger)) continue;
    if (trigger === 'schedule') errors.push(`${name}: trigger "schedule" is not allowed; only ${SCHEDULE_ALLOWED.join(', ')} may run on a schedule. See AUG-1601.`);
    else errors.push(`${name}: trigger "${trigger}" is not allowed; workflows in this repository are manual-only (workflow_dispatch). See AUG-1601.`);
  }
  if (!names.includes(ALLOWED_TRIGGER) && names.length && errors.length === 0) errors.push(`${name}: must also be runnable by hand (workflow_dispatch)`);
  }
  // Names can match while the filters do not. For the pinned files the whole block must match.
  if (PINNED_ON[name] && errors.length === 0 && !sameOn(triggersOf(doc), PINNED_ON[name])) {
    errors.push(`${name}: the "on:" block is pinned, filters included, to ${JSON.stringify(normalizeOn(PINNED_ON[name]))}; found ${JSON.stringify(normalizeOn(triggersOf(doc)))}. A trigger's branches, types, paths or schedule may not change without a decision. See AUG-1601.`);
  }
  for (const [id, job] of Object.entries(doc.jobs ?? {})) {
    if (!runsOnMac(job)) continue;
    if (DISK_NEED_EXEMPT[name]?.[id]) continue;
    // No fixed threshold is enforced here. A job states its own need; an empty NEED_GB means
    // "not measured yet", and the step then only records.
    const first = job.steps?.[0];
    if (!first || !DISK_NEED_STEP.test(String(first.name ?? ''))) {
      errors.push(`${name}: job "${id}" runs on the self-hosted Mac and must start with the "Disk need (AUG-1601)" step`);
    } else if (!/NEED_GB/.test(String(first.run ?? ''))) {
      errors.push(`${name}: job "${id}" has a disk-need step that does not read NEED_GB`);
    }
    if (!job.env || !Object.hasOwn(job.env, 'NEED_GB')) {
      errors.push(`${name}: job "${id}" runs on the self-hosted Mac and must declare NEED_GB in its env (empty = not measured yet)`);
    }
  }
  return errors;
}

function lintWorkflowDir(dir) {
  const files = fs.readdirSync(dir).filter((file) => /\.ya?ml$/.test(file)).sort();
  const errors = [];
  for (const file of files) errors.push(...lintWorkflow(file, fs.readFileSync(path.join(dir, file), 'utf8')));
  return { files, errors };
}

module.exports = { lintWorkflow, lintWorkflowDir, normalizeOn, ALLOWED_TRIGGER, DISK_NEED_EXEMPT, SCHEDULE_ALLOWED, OWNER_PINNED, PINNED_ON };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] ?? path.join(__dirname, '..', '..', '..', '.github', 'workflows'));
  const { files, errors } = lintWorkflowDir(dir);
  for (const error of errors) console.error(`WORKFLOW LINT: ${error}`);
  if (errors.length) process.exitCode = 1;
  else console.log(`workflow lint: ${files.length} workflow(s) pass; scheduled by name: ${SCHEDULE_ALLOWED.join(', ')}; owner-pinned: ${Object.keys(OWNER_PINNED).join(', ')}`);
}
