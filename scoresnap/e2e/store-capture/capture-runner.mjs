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
  loadConfig, SCREEN_ANCHORS, loadOverlayManifest, loadAcceptedRelease, validateOverlayBinding,
} from './validate-capture.mjs';

// Walk targets x frames in config order (the real capture sequence) and resolve each step's
// screen anchor, staged overlay and accepted-build binding. Returns { steps, errors }: any
// resolution failure (unknown anchor, missing overlay entry, no accepted release) is collected
// into errors and that step is omitted from steps, so a caller can never silently run with a
// partially-bound plan.
export function buildCapturePlan({
  config = loadConfig(),
  anchors = SCREEN_ANCHORS,
  overlayManifest = loadOverlayManifest(),
  overlaysBaseDir = '.',
  accepted = loadAcceptedRelease(),
} = {}) {
  const errors = [...validateOverlayBinding(config, overlayManifest, overlaysBaseDir)];
  if (!accepted) errors.push('no accepted-release record staged; capture plan cannot be bound to a real accepted build');

  const steps = [];
  for (const target of config.targets ?? []) {
    for (const frame of config.frames ?? []) {
      const anchor = anchors[frame.id];
      if (!anchor) { errors.push(`frame ${frame.n} id "${frame.id}" has no screen anchor`); continue; }
      const overlay = overlayManifest?.[frame.id];
      if (!overlay?.path || !overlay?.sha256) { errors.push(`frame ${frame.n} id "${frame.id}" has no staged overlay entry`); continue; }
      if (!accepted) continue;
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
      });
    }
  }
  return { steps, errors };
}

// Drives `provider.capture(step) -> { file, width, height, sha256 }` once per planned step, in
// order, and assembles the resulting output manifest. Refuses to run (throws) if the plan has any
// unresolved binding -- a partial consumer that silently skips unbound frames is the same gap as
// not consuming the sequence at all.
export async function runCapture(provider, opts = {}) {
  const plan = buildCapturePlan(opts);
  if (plan.errors.length) throw new Error(`capture plan has unresolved bindings:\n${plan.errors.join('\n')}`);
  const entries = [];
  for (const step of plan.steps) {
    const result = await provider.capture(step);
    entries.push({ target: step.target, frame: step.frame, file: result.file, width: result.width, height: result.height, sha256: result.sha256 });
  }
  return {
    provenance: {
      buildId: plan.steps[0]?.acceptedBuildId,
      sourceSha: plan.steps[0]?.acceptedSourceSha,
      ...opts.provenance,
    },
    entries,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plan = buildCapturePlan();
  if (plan.errors.length) { console.error(plan.errors.join('\n')); process.exit(1); }
  console.log(JSON.stringify(plan.steps, null, 2));
}
