// device-layout/v1 — reusable, repo-agnostic cross-device layout gate contract.
// Barrel export. See README.md and
// /workspace/aos-state/reports/2026-11-19-device-gate-t1547u/RECONCILED-PLAN.md.

export {
  VERSION,
  validate,
  validateElementTree,
  CONFIG_SCHEMA,
  RECEIPT_SCHEMA,
  WAIVER_SCHEMA,
  ELEMENT_NODE_SCHEMA,
} from './schema.mjs';

export {
  TOLERANCES,
  intersectRect,
  rectArea,
  overlapsBeyond,
  checkOverlap,
  checkTapTargets,
  checkReachability,
  runGeometry,
} from './geometry.mjs';

export {
  requiredReviewerCompany,
  checkReviewer,
  waiverErrors,
  evaluateGate,
  rubricDriftErrors,
} from './policy.mjs';

export { rnMaestroToTree, parseBounds } from './adapters/rn-maestro.mjs';
export { godotControlToTree } from './adapters/godot-control.mjs';

// Adapter registry — the normalizer each product's harness invokes.
export const ADAPTERS = {
  'rn-maestro': async () => (await import('./adapters/rn-maestro.mjs')).rnMaestroToTree,
  'godot-control': async () => (await import('./adapters/godot-control.mjs')).godotControlToTree,
};

export async function normalizerFor(adapter) {
  const loader = ADAPTERS[adapter];
  if (!loader) throw new Error(`no device-layout/v1 adapter: ${adapter}`);
  return loader();
}
