#!/usr/bin/env node
// Layer-1 runner: load captured checkpoints (normalized element trees + context), run the
// deterministic rules 1–8, apply waivers, and exit non-zero on any kept finding (rule 8:
// every checkpoint of a flow must be clean). Usage:
//   node run-geometry.mjs <capture-bundle.json> [--waivers waivers.json] [--out findings.json]
//
// A capture bundle is produced by the Maestro adapter per candidate SHA:
//   { sourceSha, buildHash, device, checkpoints:[ { flow, checkpoint, screen, deviceId,
//     state, platform, context:{...}, nodes:[ normalized... ] } ] }
// The rule engine itself is covered by lib/geometry-rules.test.mjs (node --test).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluateCheckpoint } from './lib/geometry-rules.mjs';
import { applyWaivers, validateWaivers } from './lib/waivers.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

export function runBundle(bundle, waiverDoc, now = new Date()) {
  const results = [];
  let kept = 0;
  for (const cp of bundle.checkpoints || []) {
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
    console.error('usage: node run-geometry.mjs <bundle.json> [--waivers w.json] [--out f.json]');
    process.exit(2);
  }
  const bundlePath = args[0];
  const waiverPath = flag(args, '--waivers') || resolve(__dir, 'waivers.json');
  const outPath = flag(args, '--out');
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const waiverDoc = JSON.parse(readFileSync(waiverPath, 'utf8'));
  const wv = validateWaivers(waiverDoc);
  if (!wv.ok) { console.error('FAIL waivers.json invalid:', wv.errors.join('; ')); process.exit(1); }
  const out = runBundle(bundle, waiverDoc);
  if (outPath) writeFileSync(outPath, JSON.stringify(out, null, 2));
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
