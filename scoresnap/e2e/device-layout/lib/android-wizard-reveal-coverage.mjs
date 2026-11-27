// Android: which controls of a New Contest checkpoint are proved to be whole and reachable after
// a scroll-only move. Android reports only the visible part of a view, so a control half scrolled
// out of the list arrives here as a thin sliver and fails the 48dp rule on its own.
//
// This module decides nothing itself. Every proof is android-wizard-reveal.mjs's
// (verifyAndroidWizardReveal): same candidate, build, gate config, profile and font scale; two
// different native screenshots bound by hash; the same control, a sliver at one edge of the
// measured scroll area before, a full 48dp target after; two unchanged witnesses that moved by the
// same distance. A control it cannot prove is left out, and its finding stays. A required control
// is never included.
import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { verifyAndroidWizardReveal } from './android-wizard-reveal.mjs';

const MIN_TARGET_DP = 48;
const FLOW = 'new-contest';
const MAX_WITNESS_CANDIDATES = 8;
const stable = (n) => typeof n?.id === 'string' && /^[a-z][a-z0-9_-]+$/i.test(n.id) && !/^n\d+$/.test(n.id) && n.meta?.resourceId === n.id;
const height = (n) => n.bbox.bottom - n.bbox.top;
const finite = (r) => r && ['left', 'top', 'right', 'bottom'].every((k) => Number.isFinite(r[k]));

// Reads a screenshot only as a direct file of the capture directory, never through a link or a path.
function pngReader(dir) {
  const root = realpathSync(dir);
  return (name) => {
    const file = join(root, name);
    if (name !== basename(name) || realpathSync(file) !== file) throw new Error('Android wizard reveal: native PNG must be a direct capture file');
    return readFileSync(file);
  };
}

// A reveal capture is a bundle made by the same bundler from a second capture directory.
export function loadRevealCapture(bundlePath) {
  try {
    const path = resolve(bundlePath);
    return { bundle: JSON.parse(readFileSync(path, 'utf8')), readPng: pngReader(dirname(path)), path };
  } catch (error) {
    throw new Error(`Android wizard reveal: cannot read reveal capture ${bundlePath}: ${error.message}`);
  }
}

// Map<checkpoint, Map<node, proof>>, the same shape the iPhone coverage returns.
export function androidWizardRevealCoverage(bundle, { evidenceDir, reveals = [] } = {}) {
  const proved = new Map();
  if (bundle?.platform !== 'android' || !evidenceDir || !Array.isArray(reveals) || reveals.length === 0) return proved;
  let readBeforePng;
  try { readBeforePng = pngReader(evidenceDir); } catch { return proved; }
  for (const cp of bundle.checkpoints ?? []) {
    if (cp?.flow !== FLOW || cp.platform !== 'android' || !Array.isArray(cp.nodes)) continue;
    const named = cp.nodes.filter((n) => stable(n) && n.role === 'control' && finite(n.bbox));
    const slivers = named.filter((n) => height(n) < MIN_TARGET_DP && n.meta?.required !== true && n.meta?.requiredAtCheckpoint !== true);
    for (const target of slivers) {
      const witnesses = named.filter((n) => n !== target && height(n) >= MIN_TARGET_DP).slice(0, MAX_WITNESS_CANDIDATES);
      const proof = prove({ bundle, cp, target, witnesses, reveals, readBeforePng });
      if (!proof) continue;
      if (!proved.has(cp)) proved.set(cp, new Map());
      proved.get(cp).set(target, proof);
    }
  }
  return proved;
}

function prove({ bundle, cp, target, witnesses, reveals, readBeforePng }) {
  for (const reveal of reveals) {
    for (let i = 0; i < witnesses.length; i += 1) for (let j = i + 1; j < witnesses.length; j += 1) {
      const witnessIds = [witnesses[i].id, witnesses[j].id];
      try {
        const result = verifyAndroidWizardReveal({ before: bundle, reveal: reveal.bundle, checkpoint: cp.checkpoint, targetId: target.id, witnessIds, readBeforePng, readRevealPng: reveal.readPng });
        if (result.required === true) return null;
        return { ...result, witnessIds };
      } catch { /* this pair, or this reveal, proves nothing; try the next */ }
    }
  }
  return null;
}
