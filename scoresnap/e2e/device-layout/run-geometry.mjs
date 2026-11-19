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

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluateCheckpoint } from './lib/geometry-rules.mjs';
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
    if (!Array.isArray(cp?.nodes) || cp.nodes.length === 0) errors.push(`${at} has no captured nodes`);
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
  for (const cp of bundle.checkpoints) {
    const { findings } = evaluateCheckpoint(cp.nodes, { platform: cp.platform, ...cp.context });
    const applied = applyWaivers(findings, waiverDoc, {
      screen: cp.screen, deviceId: cp.deviceId, state: cp.state,
    }, now);
    results.push({
      flow: cp.flow, checkpoint: cp.checkpoint, deviceId: cp.deviceId,
      kept: applied.kept, waived: applied.waived.map((w) => w.finding.rule),
      verdict: applied.kept.length === 0 ? 'pass' : 'fail',
    });
    kept += applied.kept.length;
  }
  return { ok: kept === 0, keptCount: kept, results };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.error('usage: node run-geometry.mjs <bundle.json> [--waivers w.json] [--out f.json] ' +
      '[--expect-sha SHA] [--profile ID] [--cadence per-pr|nightly|none]');
    process.exit(2);
  }
  const bundlePath = args[0];
  const waiverPath = flag(args, '--waivers') || resolve(__dir, 'waivers.json');
  const outPath = flag(args, '--out');
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const waiverDoc = JSON.parse(readFileSync(waiverPath, 'utf8'));
  const wv = validateWaivers(waiverDoc);
  if (!wv.ok) { console.error('FAIL waivers.json invalid:', wv.errors.join('; ')); process.exit(1); }
  const cadence = flag(args, '--cadence') || 'per-pr';
  const expect = {
    sourceSha: flag(args, '--expect-sha') || undefined,
    profile: flag(args, '--profile') || undefined,
    flows: cadence === 'none' ? [] : expectedFlows(JSON.parse(readFileSync(CONFIG, 'utf8')), cadence),
  };
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

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
