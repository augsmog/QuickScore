#!/usr/bin/env node
// Layer-2 runner: the vision reviewer + rubric-drift self-check.
//
// The gate first sends the committed owner negative fixtures through the vision reviewer and
// asserts each one is flagged (lib/vision-selfcheck.mjs). Only then are real per-PR
// screenshots reviewed. The reviewer itself is cross-company (Codex gpt-6-astra/high for
// Claude-built SnapScore; never Grok) and is invoked through a *reviewer-agnostic* command so
// no model SDK is hard-wired into the repo.
//
// Modes:
//   --self-check --reviews <dir>   Validate pre-produced reviews/<artifactHash>.json against
//                                  fixtures/negative/fixtures.json (+ optional positive). Used
//                                  by CI after the reviewer step and by calibration.
//   --review-cmd "<cmd>"           Invoke a reviewer per image: the command receives the image
//                                  path as $1 and a metadata JSON file as $2 and must print the
//                                  review JSON object to stdout. Reviewer unavailable => fail.
//
// Usage:
//   node run-vision.mjs --self-check --reviews ./reviews
//   node run-vision.mjs --review-cmd "$VISION_CMD" --reviews ./out  (produces + self-checks)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { runSelfCheck } from './lib/vision-selfcheck.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const NEG = resolve(__dir, 'fixtures/negative/fixtures.json');
const POS = resolve(__dir, 'fixtures/positive/fixtures.json');

export function loadFixtures() {
  const neg = JSON.parse(readFileSync(NEG, 'utf8'));
  const list = neg.fixtures.map((f) => ({ ...f, baseDir: dirname(NEG), meta: neg }));
  if (existsSync(POS)) {
    const pos = JSON.parse(readFileSync(POS, 'utf8'));
    for (const f of pos.fixtures) list.push({ ...f, kind: 'positive', baseDir: dirname(POS), meta: pos });
  }
  return list;
}

function loadReviews(fixtures, dir) {
  const reviews = {};
  for (const fx of fixtures) {
    const p = join(dir, `${fx.artifactHash}.json`);
    if (existsSync(p)) reviews[fx.artifactHash] = JSON.parse(readFileSync(p, 'utf8'));
  }
  return reviews;
}

function invokeReviewer(cmd, fixtures, outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const fx of fixtures) {
    const img = join(fx.baseDir, fx.file);
    const metaFile = join(outDir, `${fx.artifactHash}.meta.json`);
    writeFileSync(metaFile, JSON.stringify({
      sourceSha: fx.meta.sourceSha, buildHash: fx.meta.buildHash, artifactHash: fx.artifactHash,
      device: fx.meta.device, flow: fx.meta.flow, checkpoint: fx.checkpoint,
    }, null, 2));
    const stdout = execFileSync('bash', ['-c', `${cmd} "${img}" "${metaFile}"`], { encoding: 'utf8' });
    writeFileSync(join(outDir, `${fx.artifactHash}.json`), stdout);
  }
}

function main() {
  const args = process.argv.slice(2);
  const reviewsDir = flag(args, '--reviews') || resolve(__dir, 'reviews');
  const reviewCmd = flag(args, '--review-cmd');
  const fixtures = loadFixtures();
  if (reviewCmd) {
    try { invokeReviewer(reviewCmd, fixtures, reviewsDir); }
    catch (e) { console.error('FAIL vision reviewer unavailable:', e.message); process.exit(1); }
  }
  const reviews = loadReviews(fixtures, reviewsDir);
  const result = runSelfCheck(fixtures, reviews);
  for (const r of result.results) {
    const tag = r.ok ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${r.kind || 'negative'} fixture ${r.file}` +
      (r.majorRules ? ` — major rules [${r.majorRules.join(',')}]` : ''));
    for (const e of r.errors || []) console.log(`    - ${e}`);
  }
  console.log(result.ok ? 'VISION SELF-CHECK: PASS' : 'VISION SELF-CHECK: FAIL');
  process.exit(result.ok ? 0 : 1);
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
