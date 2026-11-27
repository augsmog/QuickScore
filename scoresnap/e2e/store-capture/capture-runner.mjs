// The executable capture consumer for AUG-1279/AUG-1301: a registry of source strings
// (capture-config.json + SCREEN_ANCHORS) is not itself a capture harness -- something has to
// actually walk the sequence, resolve each frame's screen anchor and staged overlay, and drive a
// capture provider through them in order. This module is that something. It takes no device
// action itself: the real simulator capture is injected as `provider` (out of this code-only
// ticket's scope, owned by the AUG-399 device-evidence child / cross-product E2E system). Tests
// drive this with a stub provider over fixture anchors/overlays/accepted-release records, proving
// the wiring and its negative cases without any device run or real (DotBot) asset.
import { fileURLToPath } from 'node:url';
import {
  loadConfig, SCREEN_ANCHORS, loadOverlayManifest, loadAcceptedRelease, loadListing,
  validateConfig, validateOverlayBinding, validateAcceptedRelease,
  validateBuildForStoreCapture, validateCapturedScreen,
} from './validate-capture.mjs';

// Walk targets x frames in config order (the real capture sequence) and resolve each step's
// screen anchor, staged overlay and accepted-build binding. Returns { steps, errors }: any
// resolution failure (unknown anchor, missing overlay entry, no/incomplete accepted release, or a
// validateConfig-level defect such as a swapped frame id with its caption left in place) is
// collected into errors, so a caller can never silently run with a partially- or wrongly-bound
// plan -- per-frame checks alone can't see a swap, since each frame id/anchor/overlay still
// resolves individually; only the config-level caption-vs-canonical-id check catches it.
export function buildCapturePlan({
  config = loadConfig(),
  anchors = SCREEN_ANCHORS,
  overlayManifest = loadOverlayManifest(),
  overlaysBaseDir = '.',
  accepted = loadAcceptedRelease(),
  listingMd = loadListing(),
  env = process.env,
} = {}) {
  const acceptedErrors = validateAcceptedRelease(accepted);
  const errors = [
    ...validateConfig(config, listingMd),
    ...validateOverlayBinding(config, overlayManifest, overlaysBaseDir),
    ...acceptedErrors,
  ];
  // AUG-399: never plan a store capture against a build without ML Kit, or one that does not say.
  const buildErrors = acceptedErrors.length ? [] : validateBuildForStoreCapture(accepted, env);
  errors.push(...buildErrors);
  const acceptedOk = acceptedErrors.length === 0 && buildErrors.length === 0;

  const steps = [];
  for (const target of config.targets ?? []) {
    for (const frame of config.frames ?? []) {
      const anchor = anchors[frame.id];
      if (!anchor) { errors.push(`frame ${frame.n} id "${frame.id}" has no screen anchor`); continue; }
      const overlay = overlayManifest?.[frame.id];
      if (!overlay?.path || !overlay?.sha256) { errors.push(`frame ${frame.n} id "${frame.id}" has no staged overlay entry`); continue; }
      if (!acceptedOk) continue;
      steps.push({
        target: target.id,
        width: target.width,
        height: target.height,
        frame: frame.n,
        id: frame.id,
        caption: frame.caption,
        testID: anchor.testID,
        sourceFile: anchor.file,
        overlayPath: overlay.path,
        overlaySha256: overlay.sha256,
        acceptedBuildId: accepted.buildId,
        acceptedSourceSha: accepted.sourceSha,
        acceptedSimulatorRuntime: accepted.simulatorRuntime,
      });
    }
  }
  return { steps, errors };
}

// Drives `provider.capture(step) -> { file, width, height, sha256 }` once per planned step, in
// order, and assembles the resulting output manifest. Refuses to run (throws) if the plan has any
// unresolved binding -- a partial consumer that silently skips unbound frames is the same gap as
// not consuming the sequence at all. A caller-supplied `opts.provenance` can add fields the
// accepted release doesn't carry (e.g. configSha256, capturedAt), but it can never override the
// accepted build/source/runtime with an invented value -- that check runs, and rejects, before any
// capture happens, not after.
export async function runCapture(provider, opts = {}) {
  const plan = buildCapturePlan(opts);
  if (plan.errors.length) throw new Error(`capture plan has unresolved bindings:\n${plan.errors.join('\n')}`);
  const accepted = { buildId: plan.steps[0]?.acceptedBuildId, sourceSha: plan.steps[0]?.acceptedSourceSha, simulatorRuntime: plan.steps[0]?.acceptedSimulatorRuntime };
  const callerProvenance = opts.provenance ?? {};
  for (const key of ['buildId', 'sourceSha', 'simulatorRuntime']) {
    if (callerProvenance[key] !== undefined && callerProvenance[key] !== accepted[key])
      throw new Error(`caller-supplied provenance.${key} "${callerProvenance[key]}" conflicts with the accepted release ${key} "${accepted[key]}"`);
  }
  const entries = [];
  for (const step of plan.steps) {
    const result = await provider.capture(step);
    // AUG-399: look at what was on screen. One frame showing the simulator-only sentence stops the
    // whole run; a partial set is not a store set.
    const screenErrors = validateCapturedScreen(step, result);
    if (screenErrors.length) throw new Error(`capture refused:\n${screenErrors.join('\n')}`);
    entries.push({ target: step.target, frame: step.frame, file: result.file, width: result.width, height: result.height, sha256: result.sha256 });
  }
  return {
    provenance: { ...accepted, ...callerProvenance },
    entries,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plan = buildCapturePlan();
  if (plan.errors.length) { console.error(plan.errors.join('\n')); process.exit(1); }
  console.log(JSON.stringify(plan.steps, null, 2));
}
