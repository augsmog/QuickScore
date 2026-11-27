#!/usr/bin/env node
// Layer-1 runner: load captured checkpoints (normalized element trees + context), run the
// deterministic rules 1–8, apply waivers, and exit non-zero on any kept finding (rule 8:
// every checkpoint of a flow must be clean). Usage:
//   node run-geometry.mjs <capture-bundle.json> [--waivers waivers.json] [--out findings.json]
//     [--expect-sha <candidate sha>] [--profile <profile id>] [--cadence per-pr|nightly|none]
//
// A capture bundle is produced by the Maestro adapter per candidate SHA:
//   { sourceSha, buildHash, profile, platform, device, checkpoints:[ { flow, checkpoint, screen,
//     deviceId (== profile), state, platform, context:{...}, nodes:[ normalized... ],
//     screenshot (path relative to the bundle), screenshotSha256 } ] }
// Evidence is candidate-bound: missing metadata, empty node trees, a stale sourceSha, or any
// omitted expected checkpoint fails the gate before geometry is judged.
// The rule engine itself is covered by lib/geometry-rules.test.mjs (node --test).

import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluateCheckpoint, finiteRect } from './lib/geometry-rules.mjs';
import { wizardScrollCoverage } from './lib/ios-wizard-scroll-coverage.mjs';
import { androidWizardRevealCoverage, loadRevealCapture } from './lib/android-wizard-reveal-coverage.mjs';
import { applyWaivers, validateWaivers } from './lib/waivers.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

const CONFIG = resolve(__dir, 'config/device-layout.config.json');

// Expected checkpoint set for a cadence ("per-pr" | "nightly"): every checkpoint of every flow
// whose cadence is at or below the requested one. Used to bind a capture bundle to the full
// declared flow set — a bundle that omits a checkpoint fails (rule 8, Codex check 7116885).
export function expectedFlows(config, cadence = 'per-pr') {
  const want = cadence === 'nightly' ? new Set(['per-pr', 'nightly']) : new Set(['per-pr']);
  return (config.flows || []).filter((f) => want.has(f.cadence))
    .map((f) => ({ id: f.id, checkpoints: [...f.checkpoints] }));
}

const nonEmpty = (v) => typeof v === 'string' && v.length > 0;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const posFinite = (v) => finite(v) && v > 0;
const nonNegFinite = (v) => finite(v) && v >= 0;
// A measured rectangle must be finite with positive area (shared with the rule engine).
const validBox = (b) => finiteRect(b);
// An RGB color leaf consumed by rule 7: exactly three finite channels in 0–255.
const validColor = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => finite(v) && v >= 0 && v <= 255);

// Validate every OPTIONAL measured numeric geometry leaf a rule (1–8) reads off a checkpoint's
// context or node meta. A malformed leaf (NaN/Infinity/null/string/negative/partial/{}) would make
// its rule's comparison evade silently, so we reject the bundle here — fail closed before judging.
// `push(msg)` is the caller's error collector, already prefixed with the checkpoint location.
function validateGeometryLeaves(cp, push) {
  const ctx = cp?.context || {};
  // Rule 2 sticky footer rectangle.
  if (ctx.footer != null && !validBox(ctx.footer)) {
    push('malformed context.footer (need finite left/top/right/bottom with positive area)');
  }
  // Rule 4 modal header rectangle + content origin.
  if (ctx.header != null && !validBox(ctx.header.bbox)) push('malformed context.header.bbox');
  if (ctx.modalOrigin != null && !finite(ctx.modalOrigin)) push('non-finite context.modalOrigin');
  // Rule 3 font scale.
  if (ctx.fontScale != null && !posFinite(ctx.fontScale)) push('non-finite/non-positive context.fontScale');
  // Rule 7 declared switch-contrast minimum.
  if (ctx.minSwitchContrast != null && !posFinite(ctx.minSwitchContrast)) {
    push('non-finite/non-positive context.minSwitchContrast');
  }
  // Per-node measured geometry leaves (hitRegion, section-grid anchor, switch colors).
  for (const n of (Array.isArray(cp?.nodes) ? cp.nodes : [])) {
    if (!n) continue;
    const nid = nonEmpty(n.id) ? n.id : '?';
    // Rules 1/5 select the effective rect via rectOf; a non-null hitRegion must be a finite box.
    if (n.hitRegion != null && !validBox(n.hitRegion)) {
      push(`node "${nid}" malformed hitRegion (need finite left/top/right/bottom with positive width/height)`);
    }
    if (n.meta?.sectionGrid != null && !finite(n.meta.sectionGrid)) {
      push(`node "${nid}" non-finite meta.sectionGrid anchor`);
    }
    for (const key of ['thumbColor', 'trackColor']) {
      if (n.meta?.[key] != null && !validColor(n.meta[key])) push(`node "${nid}" malformed meta.${key} (need [r,g,b] 0–255)`);
    }
  }
}
// Measured Android emulator geometry may round (density); iOS simulator logical size is exact.
const VIEWPORT_TOL = { ios: 1, android: 0.02 };

function viewportMatches(vp, size, platform) {
  if (!vp || !finite(vp.width) || !finite(vp.height) || !Array.isArray(size)) return false;
  const tol = VIEWPORT_TOL[platform] ?? 1;
  const ok = (got, want) => (tol < 1 ? Math.abs(got - want) <= want * tol : Math.abs(got - want) <= tol);
  return ok(vp.width, size[0]) && ok(vp.height, size[1]);
}

export function configSha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// Candidate-bound evidence check. A bundle must carry its source SHA, build hash, profile and
// platform; every checkpoint must name its flow/checkpoint/device, match the bundle's profile
// and platform, and carry a non-empty captured node tree. With `expect`, the bundle must also
// be for the expected SHA/profile and contain every expected flow checkpoint.
export function validateBundle(bundle, expect = {}) {
  const errors = [];
  if (!bundle || typeof bundle !== 'object') return ['bundle is not an object'];
  for (const k of ['sourceSha', 'buildHash', 'profile', 'platform']) {
    if (!nonEmpty(bundle[k])) errors.push(`bundle missing "${k}"`);
  }
  if (expect.sourceSha && bundle.sourceSha !== expect.sourceSha) {
    errors.push(`stale evidence: bundle sourceSha ${bundle.sourceSha} != candidate ${expect.sourceSha}`);
  }
  if (expect.profile && bundle.profile !== expect.profile) {
    errors.push(`bundle profile ${bundle.profile} != expected ${expect.profile}`);
  }
  if (expect.buildHash && bundle.buildHash !== expect.buildHash) {
    errors.push(`bundle buildHash ${bundle.buildHash} != candidate build ${expect.buildHash}`);
  }
  if (expect.configSha256 && bundle.configSha256 !== expect.configSha256) {
    errors.push(`bundle configSha256 ${bundle.configSha256} != gate config ${expect.configSha256} (stale/mismatched config)`);
  }
  // Declared device profile: the bundle must be for a configured profile on its platform.
  let prof = null;
  if (expect.config) {
    prof = (expect.config.profiles || []).find((p) => p.id === bundle.profile) || null;
    if (!prof) errors.push(`profile ${bundle.profile} is not declared in the gate config`);
    else if (prof.platform !== bundle.platform) errors.push(`bundle platform ${bundle.platform} != declared ${prof.platform} for ${prof.id}`);
  }
  const cps = Array.isArray(bundle.checkpoints) ? bundle.checkpoints : [];
  if (cps.length === 0) errors.push('no checkpoints — missing flow evidence');
  cps.forEach((cp, i) => {
    const at = `checkpoint[${i}]${cp && cp.flow ? ` ${cp.flow}/${cp.checkpoint}` : ''}`;
    for (const k of ['flow', 'checkpoint', 'deviceId', 'platform']) {
      if (!nonEmpty(cp?.[k])) errors.push(`${at} missing "${k}"`);
    }
    if (nonEmpty(cp?.deviceId) && nonEmpty(bundle.profile) && cp.deviceId !== bundle.profile) {
      errors.push(`${at} deviceId ${cp.deviceId} != bundle profile ${bundle.profile}`);
    }
    if (nonEmpty(cp?.platform) && nonEmpty(bundle.platform) && cp.platform !== bundle.platform) {
      errors.push(`${at} platform ${cp.platform} != bundle platform ${bundle.platform}`);
    }
    if (!Array.isArray(cp?.nodes) || cp.nodes.length === 0) {
      errors.push(`${at} has no captured nodes`);
    } else {
      const bad = cp.nodes.filter((n) => !n || !nonEmpty(n.id) || !validBox(n.bbox));
      if (bad.length) errors.push(`${at} has ${bad.length} node(s) without an id and finite measured bbox`);
    }
    // Device geometry context is mandatory: rules 2/5 judge against the real viewport + insets.
    const ctx = cp?.context || {};
    if (ctx.platform !== undefined && ctx.platform !== cp?.platform) {
      errors.push(`${at} context.platform ${ctx.platform} conflicts with checkpoint platform ${cp?.platform}`);
    }
    if (!ctx.viewport || !posFinite(ctx.viewport.width) || !posFinite(ctx.viewport.height)) {
      errors.push(`${at} missing measured context.viewport`);
    } else if (prof && !viewportMatches(ctx.viewport, prof.logicalSize, prof.platform)) {
      errors.push(`${at} viewport ${ctx.viewport.width}x${ctx.viewport.height} != declared ${prof.id} ${prof.logicalSize.join('x')}`);
    }
    const sa = ctx.safeArea;
    if (!sa || !['top', 'bottom', 'left', 'right'].every((k) => nonNegFinite(sa[k]))) {
      errors.push(`${at} missing measured context.safeArea {top,bottom,left,right}`);
    }
    // Reject any other malformed measured numeric geometry leaf before the rules run.
    validateGeometryLeaves(cp, (msg) => errors.push(`${at} ${msg}`));
  });
  for (const f of expect.flows || []) {
    for (const c of f.checkpoints) {
      if (!cps.some((cp) => cp && cp.flow === f.id && cp.checkpoint === c)) {
        errors.push(`missing checkpoint ${f.id}/${c} (rule 8 flow completion)`);
      }
    }
  }
  return errors;
}

export function runBundle(bundle, waiverDoc, now = new Date(), expect = {}) {
  const results = [];
  let kept = 0;
  // Fail closed on incomplete / unbound evidence before judging geometry.
  const errors = validateBundle(bundle, expect);
  if (errors.length) {
    return { ok: false, keptCount: 0, results, error: errors.join('; '), errors };
  }
  let revealed;
  try {
    revealed = wizardScrollCoverage(bundle, expect);
    // Android: slivers proved whole by a scroll-only reveal capture (--reveal). Separate platforms,
    // separate proofs; a checkpoint is only ever in one of the two maps.
    for (const [cp, proofs] of androidWizardRevealCoverage(bundle, expect)) revealed.set(cp, proofs);
  }
  catch (e) { return { ok: false, keptCount: 0, results, error: `wizard scroll evidence failed closed: ${e.message}` }; }
  for (const cp of bundle.checkpoints) {
    // Platform is bound to the validated checkpoint/bundle platform; context can never override it.
    let findings;
    try {
      ({ findings } = evaluateCheckpoint(cp.nodes, { ...cp.context, platform: cp.platform }, revealed.get(cp)));
    } catch (e) {
      // A malformed geometry leaf that slipped past validateBundle must FAIL the checkpoint, never
      // silently pass. Record it as an unwaivable kept finding (rule 0 = evaluator integrity).
      results.push({
        flow: cp.flow, checkpoint: cp.checkpoint, deviceId: cp.deviceId,
        kept: [{ rule: 0, severity: 'critical', reason: `geometry evaluation failed closed: ${e.message}` }],
        waived: [], verdict: 'fail',
      });
      kept += 1;
      continue;
    }
    const acceptedReveals = revealed.get(cp);
    const applied = applyWaivers(findings, waiverDoc, {
      screen: cp.screen, deviceId: cp.deviceId, state: cp.state,
    }, now);
    results.push({
      flow: cp.flow, checkpoint: cp.checkpoint, deviceId: cp.deviceId,
      kept: applied.kept, waived: applied.waived.map((w) => w.finding.rule),
      verdict: applied.kept.length === 0 ? 'pass' : 'fail',
      ...(acceptedReveals?.size ? { verifiedScrollReveals: [...acceptedReveals.values()] } : {}),
    });
    kept += applied.kept.length;
  }
  return { ok: kept === 0, keptCount: kept, results };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.error('usage: node run-geometry.mjs <bundle.json> [--waivers w.json] [--out f.json] ' +
      '[--expect-sha SHA] [--profile ID] [--cadence per-pr|nightly|none] [--reveal <reveal-bundle.json>]...');
    process.exit(2);
  }
  const bundlePath = args[0];
  const waiverPath = flag(args, '--waivers') || resolve(__dir, 'waivers.json');
  const outPath = flag(args, '--out');
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const waiverDoc = JSON.parse(readFileSync(waiverPath, 'utf8'));
  const wv = validateWaivers(waiverDoc);
  if (!wv.ok) { console.error('FAIL waivers.json invalid:', wv.errors.join('; ')); process.exit(1); }
  // --reveal may be given more than once. A reveal file that cannot be read fails the run: a gate
  // told to use evidence it cannot open must not carry on as if none had been offered.
  let reveals;
  try { reveals = flags(args, '--reveal').map(loadRevealCapture); }
  catch (e) { console.error(`FAIL: ${e.message}`); process.exit(1); }
  const expect = { ...expectFromArgs(args), evidenceDir: dirname(resolve(bundlePath)), reveals };
  const out = runBundle(bundle, waiverDoc, new Date(), expect);
  if (outPath) writeFileSync(outPath, JSON.stringify(out, null, 2));
  if (out.error) console.error(`FAIL: ${out.error}`);
  for (const r of out.results) {
    const tag = r.verdict === 'pass' ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${r.flow} / ${r.checkpoint} (${r.deviceId}) — ${r.kept.length} finding(s)`);
    for (const f of r.kept) console.log(`    rule ${f.rule} ${f.severity}: ${f.reason}`);
  }
  console.log(out.ok ? 'GEOMETRY GATE: PASS' : `GEOMETRY GATE: FAIL (${out.keptCount} finding(s))`);
  process.exit(out.ok ? 0 : 1);
}

// Shared by run-geometry and run-vision: bind evidence to the candidate SHA/build, the declared
// profile, the exact gate config (sha256) and the full expected checkpoint set.
export function expectFromArgs(args) {
  const cadence = flag(args, '--cadence') || 'per-pr';
  const text = readFileSync(CONFIG, 'utf8');
  const config = JSON.parse(text);
  return {
    sourceSha: flag(args, '--expect-sha') || undefined,
    buildHash: flag(args, '--expect-build') || undefined,
    profile: flag(args, '--profile') || undefined,
    config,
    configSha256: configSha256(text),
    flows: cadence === 'none' ? [] : expectedFlows(config, cadence),
  };
}

function flags(args, name) {
  return args.flatMap((arg, i) => (arg === name && i + 1 < args.length ? [args[i + 1]] : []));
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main();
