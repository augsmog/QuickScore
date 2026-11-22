// Static validation of the four-simulator shared-round journey (AUG-1274). No device, network or backend access.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkFixtureWiring } from './validate-journey.mjs';

export const REQUIRED_PHASES = ['join', 'approval', 'edit', 'offline', 'reopen'];

export function loadSharedRound(file = new URL('./shared-round.journey.json', import.meta.url)) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function validateSharedRound(j) {
  const errs = [];
  if (j?.schema !== 'snapscore-shared-round-journey/1') errs.push('schema');
  const ex = j?.execution ?? {};
  if (ex.physicalPhones !== false) errs.push('physical phones are not acceptance');
  if (ex.deviceExecutionInThisSlice !== false) errs.push('no device execution in this slice');
  if (ex.productionWrites !== false) errs.push('no production writes');
  if (ex.newBuild !== false) errs.push('no new build');
  if (ex.target !== 'existing-sharing-enabled-simulator-app') errs.push('target must be existing sharing-enabled simulator app');
  if (ex.backend !== 'disposable-loopback-only') errs.push('backend must be disposable loopback only');
  if (ex.requiredFlags?.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING !== true) errs.push('sharing flag must be required');
  const ids = j?.identities ?? [];
  if (ids.length !== 4) errs.push('exactly four identities');
  if (new Set(ids.map(i => i.id)).size !== ids.length) errs.push('identity ids unique');
  if (new Set(ids.map(i => i.simulator)).size !== ids.length) errs.push('one simulator per identity');
  if (ids.filter(i => i.role === 'organizer').length !== 1) errs.push('exactly one organizer');
  if (ids.some(i => i.role !== 'organizer' && i.anonymous !== true)) errs.push('guests must be disposable anonymous identities');
  const mapped = ids.filter(i => i.player).map(i => i.player);
  if (mapped.length < 2 || new Set(mapped).size !== mapped.length) errs.push('distinct player mapping');
  for (const b of ['shared-round', 'tournament', 'league']) {
    const br = j?.branches?.[b];
    if (!br) errs.push(`branch ${b} undeclared`);
    else if (br.included === false && !(br.exclusion || '').trim()) errs.push(`branch ${b} excluded without reason`);
  }
  if (j?.branches?.['shared-round']?.included !== true) errs.push('shared-round branch must be included');
  const idSet = new Set(ids.map(i => i.id));
  const steps = j?.steps ?? [];
  if (new Set(steps.map(s => s.id)).size !== steps.length) errs.push('step ids unique');
  const phases = steps.map(s => s.phase);
  for (const p of REQUIRED_PHASES) if (!(j?.requiredPhases ?? []).includes(p) || !phases.includes(p)) errs.push(`missing phase ${p}`);
  const at = p => phases.indexOf(p);
  if (!REQUIRED_PHASES.every((p, i) => i === 0 || at(REQUIRED_PHASES[i - 1]) < at(p))) errs.push('phase order');
  for (const s of steps) {
    if (!(s.actions?.length)) errs.push(`${s.id}: actions`);
    if (!(s.expect?.length)) errs.push(`${s.id}: expect`);
    for (const a of s.actors ?? []) if (!idSet.has(a)) errs.push(`${s.id}: unknown actor ${a}`);
    for (const e of s.expect ?? []) if (e.actor !== 'all' && !idSet.has(e.actor)) errs.push(`${s.id}: unknown expect actor ${e.actor}`);
  }
  const has = (phase, assert) => steps.find(s => s.phase === phase)?.expect?.some(e => e.assert === assert);
  if (!has('join', 'pending-requests-listed')) errs.push('join needs pending requests');
  if (!has('join', 'no-roster-visible')) errs.push('join needs pre-approval isolation');
  if (!has('approval', 'roster-lists-all-players')) errs.push('approval needs roster assertion');
  if (!has('approval', 'write-denied')) errs.push('approval needs unmapped-write denial');
  if (!has('edit', 'cell-equals')) errs.push('edit needs cell assertions');
  if (!has('edit', 'snapshots-converged')) errs.push('edit needs convergence');
  if ((steps.find(s => s.phase === 'edit')?.actors ?? []).length < 2) errs.push('edit needs distinct writers');
  if (!has('offline', 'conflict-resolved-deterministically')) errs.push('offline needs conflict resolution');
  if (!has('offline', 'snapshots-converged')) errs.push('offline needs convergence');
  if (!has('reopen', 'membership-restored')) errs.push('reopen needs membership recovery');
  return errs;
}

export { checkFixtureWiring };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errs = validateSharedRound(loadSharedRound());
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log('shared-round journey valid');
}
