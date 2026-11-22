// Static validation of the four-simulator league journey (AUG-1273). No device, network or backend access.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REQUIRED_PHASES = ['isolation', 'approval', 'sync', 'offline', 'relaunch'];

export function loadJourney(file = new URL('./four-sim-league.journey.json', import.meta.url)) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// Returns a list of problems; empty means valid.
export function validateJourney(j) {
  const errs = [];
  if (j?.schema !== 'snapscore-league-journey/1') errs.push('schema');
  const ex = j.execution ?? {};
  if (ex.physicalPhones !== false) errs.push('physical phones are not acceptance');
  if (ex.deviceExecutionInThisSlice !== false) errs.push('no device execution in this slice');
  if (ex.target !== 'existing-sharing-enabled-simulator-app') errs.push('target must be existing sharing-enabled simulator app');
  if (ex.requiredFlags?.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING !== true) errs.push('sharing flag must be required');
  if (ex.backend !== 'disposable-loopback-only') errs.push('backend must be disposable loopback only');
  const ids = j.identities ?? [];
  if (ids.length !== 4) errs.push('exactly four identities');
  if (new Set(ids.map(i => i.id)).size !== ids.length) errs.push('identity ids unique');
  if (new Set(ids.map(i => i.simulator)).size !== ids.length) errs.push('one simulator per identity');
  if (ids.filter(i => i.role === 'organizer').length !== 1) errs.push('exactly one organizer');
  if (ids.some(i => i.role !== 'organizer' && i.anonymous !== true)) errs.push('guests must be disposable anonymous identities');
  const idSet = new Set(ids.map(i => i.id));
  const steps = j.steps ?? [];
  if (new Set(steps.map(s => s.id)).size !== steps.length) errs.push('step ids unique');
  const phases = steps.map(s => s.phase);
  const need = j.requiredPhases ?? [];
  for (const p of REQUIRED_PHASES) if (!need.includes(p) || !phases.includes(p)) errs.push(`missing phase ${p}`);
  // Ordering: isolation strictly before approval; approval before sync; relaunch last.
  const at = p => phases.indexOf(p);
  if (!(at('isolation') < at('approval') && at('approval') < at('sync') && at('sync') < at('offline') && at('offline') < at('relaunch'))) errs.push('phase order');
  for (const s of steps) {
    if (!(s.actions?.length)) errs.push(`${s.id}: actions`);
    if (!(s.expect?.length)) errs.push(`${s.id}: expect`);
    for (const a of s.actors ?? []) if (!idSet.has(a)) errs.push(`${s.id}: unknown actor ${a}`);
    for (const e of s.expect ?? []) if (e.actor !== 'all' && !idSet.has(e.actor)) errs.push(`${s.id}: unknown expect actor ${e.actor}`);
  }
  // Isolation: every non-host identity must be asserted roster-less and denied before approval.
  const iso = steps.find(s => s.phase === 'isolation');
  for (const g of ids.filter(i => i.role !== 'organizer'))
    if (!iso?.expect.some(e => e.actor === g.id && e.assert === 'no-roster-visible')) errs.push(`isolation missing for ${g.id}`);
  if (!iso?.expect.some(e => e.assert === 'fetch-snapshot-denied')) errs.push('isolation needs snapshot denial');
  // Event-specific mapping: each player identity maps to a distinct player, and an unmapped write is denied.
  const mapped = ids.filter(i => i.player).map(i => i.player);
  if (new Set(mapped).size !== mapped.length) errs.push('player mapping must be distinct');
  const appr = steps.find(s => s.phase === 'approval');
  if (!appr?.expect.some(e => e.assert === 'write-denied')) errs.push('approval needs unmapped-write denial');
  const sync = steps.find(s => s.phase === 'sync');
  if (!sync?.expect.some(e => e.assert === 'snapshots-converged')) errs.push('sync needs convergence');
  const off = steps.find(s => s.phase === 'offline');
  if (!off?.expect.some(e => e.assert === 'score-event-count-delta' && e.count === 1)) errs.push('offline needs exactly-once count');
  if (!off?.expect.some(e => e.assert === 'replayed-request-identical')) errs.push('offline needs identical replay');
  const rel = steps.find(s => s.phase === 'relaunch');
  if (!rel?.expect.some(e => e.assert === 'membership-restored')) errs.push('relaunch needs membership recovery');
  return errs;
}

// Fixture reuse + isolation guard against the xdevice stack source (static text checks only).
export function checkFixtureWiring(fixtureSrc) {
  const errs = [];
  if (!/hostname\), 'disposable loopback stack only'/.test(fixtureSrc) && !/disposable loopback stack only/.test(fixtureSrc)) errs.push('fixture lacks loopback guard');
  for (const needle of ['requestJoin', 'decide', 'rejoinHost', 'write_score', 'fetch_snapshot'])
    if (!fixtureSrc.includes(needle)) errs.push(`fixture missing ${needle}`);
  return errs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errs = validateJourney(loadJourney());
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log('league journey valid');
}
