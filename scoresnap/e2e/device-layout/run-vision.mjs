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
//   --review-cmd "<cmd>"           Invoke the reviewer in batch: the command receives a manifest
//                                  {items:[{image, meta}]} as $1 and must print a JSON array of
//                                  review objects (same order). Reviewer unavailable => fail.
//
//   --candidate <bundle.json> --review-cmd "<cmd>" [--reviews <dir>] [--expect-sha SHA]
//                                  Candidate acceptance: FIRST re-runs the live self-check on
//                                  the negative fixtures with the same reviewer, THEN reviews
//                                  every candidate checkpoint screenshot (hash-bound). No
//                                  --review-cmd => FAIL (reviewer unavailable; fail closed).
// Usage:
//   node run-vision.mjs --self-check --reviews ./reviews
//   node run-vision.mjs --review-cmd "$VISION_CMD" --reviews ./out  (produces + self-checks)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { runSelfCheck } from './lib/vision-selfcheck.mjs';
import { reviewCandidate, reviewerPolicyErrors } from './lib/vision-candidate.mjs';
import { validateBundle, expectFromArgs } from './run-geometry.mjs';

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

// Reviewer contract (batch, so one model call covers a whole bundle): the command receives ONE
// argument, a manifest JSON file {items:[{image, meta}]}, and must print a JSON array of review
// objects in the same order on stdout. Each review is written to <outDir>/<artifactHash>.json.
export function batchReview(cmd, items, outDir) {
  mkdirSync(outDir, { recursive: true });
  const manifest = join(outDir, `manifest-${Date.now()}-${process.pid}.json`);
  writeFileSync(manifest, JSON.stringify({ items }, null, 2));
  const stdout = execFileSync('bash', ['-c', `${cmd} "$1"`, 'review', manifest],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let reviews = JSON.parse(stdout);
  if (!Array.isArray(reviews) && Array.isArray(reviews?.reviews)) reviews = reviews.reviews;
  if (!Array.isArray(reviews) || reviews.length !== items.length) {
    throw new Error(`reviewer returned ${Array.isArray(reviews) ? reviews.length : 'non-array'} reviews for ${items.length} images`);
  }
  items.forEach((it, i) => writeFileSync(join(outDir, `${it.meta.artifactHash}.json`), JSON.stringify(reviews[i], null, 2)));
  return reviews;
}

function invokeReviewer(cmd, fixtures, outDir) {
  batchReview(cmd, fixtures.map((fx) => ({
    image: join(fx.baseDir, fx.file),
    meta: {
      sourceSha: fx.meta.sourceSha, buildHash: fx.meta.buildHash, artifactHash: fx.artifactHash,
      device: fx.meta.device, flow: fx.meta.flow, checkpoint: fx.checkpoint,
    },
  })), outDir);
}

function candidateMain(args) {
  const bundlePath = resolve(flag(args, '--candidate'));
  const reviewCmd = flag(args, '--review-cmd');
  const outDir = resolve(flag(args, '--reviews') || join(dirname(bundlePath), 'reviews'));
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const expect = expectFromArgs(args);
  const policy = expect.config.reviewerPolicy;
  const bErr = validateBundle(bundle, expect);
  if (bErr.length) { console.error(`FAIL candidate bundle: ${bErr.join('; ')}`); process.exit(1); }
  if (!reviewCmd) {
    console.error('FAIL vision reviewer unavailable: --review-cmd / DEVICE_LAYOUT_VISION_CMD not set (fail closed)');
    process.exit(1);
  }
  // 1. Live rubric-drift self-check with the SAME reviewer (fresh, not the committed reviews).
  const fixtures = loadFixtures();
  try { invokeReviewer(reviewCmd, fixtures, join(outDir, 'selfcheck')); }
  catch (e) { console.error('FAIL vision reviewer unavailable:', e.message); process.exit(1); }
  const scReviews = loadReviews(fixtures, join(outDir, 'selfcheck'));
  const sc = runSelfCheck(fixtures, scReviews);
  for (const [h, r] of Object.entries(scReviews)) {
    const pe = reviewerPolicyErrors(r, policy);
    if (pe.length) { sc.ok = false; sc.results.push({ file: h, ok: false, errors: pe }); }
  }
  if (!sc.ok) {
    for (const r of sc.results) for (const e of r.errors || []) console.error(`  self-check ${r.file}: ${e}`);
    console.error('FAIL live rubric self-check — reviewer drifted; candidate not trusted');
    process.exit(1);
  }
  // 2. Candidate screenshots, hash-bound: hash-check every checkpoint, review all valid ones in
  //    ONE batch call, then judge each review against its own checkpoint.
  const base = dirname(bundlePath);
  const readFile = (p) => readFileSync(resolve(base, p));
  const pre = reviewCandidate(bundle, { readFile, review: () => null });
  const toReview = [];
  bundle.checkpoints.forEach((cp, i) => {
    if (pre.results[i] && pre.results[i].errors.every((e) => e === 'reviewer returned no review')) {
      toReview.push({ image: resolve(base, cp.screenshot), meta: {
        sourceSha: bundle.sourceSha, buildHash: bundle.buildHash, artifactHash: cp.screenshotSha256,
        device: cp.deviceId, platform: cp.platform, flow: cp.flow, checkpoint: cp.checkpoint } });
    }
  });
  const byHash = {};
  let batchErr = null;
  if (toReview.length) {
    try {
      const reviews = batchReview(reviewCmd, toReview, outDir);
      toReview.forEach((it, i) => { byHash[`${it.meta.artifactHash}|${it.meta.flow}|${it.meta.checkpoint}`] = reviews[i]; });
    } catch (e) { batchErr = e; }
  }
  const res = reviewCandidate(bundle, {
    readFile,
    policy,
    review: (_p, meta) => {
      if (batchErr) throw batchErr;
      return byHash[`${meta.artifactHash}|${meta.flow}|${meta.checkpoint}`] || null;
    },
  });
  for (const e of res.errors) console.error(`FAIL ${e}`);
  for (const r of res.results) {
    console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.id}`);
    for (const e of r.errors) console.log(`    - ${e}`);
  }
  console.log(res.ok ? 'CANDIDATE VISION: PASS' : 'CANDIDATE VISION: FAIL');
  process.exit(res.ok ? 0 : 1);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--candidate')) return candidateMain(args);
  const reviewsDir = flag(args, '--reviews') || resolve(__dir, 'reviews');
  const reviewCmd = flag(args, '--review-cmd');
  const fixtures = loadFixtures();
  if (reviewCmd) {
    try { invokeReviewer(reviewCmd, fixtures, reviewsDir); }
    catch (e) { console.error('FAIL vision reviewer unavailable:', e.message); process.exit(1); }
  }
  const reviews = loadReviews(fixtures, reviewsDir);
  const result = runSelfCheck(fixtures, reviews);
  const policy = JSON.parse(readFileSync(resolve(__dir, 'config/device-layout.config.json'), 'utf8')).reviewerPolicy;
  for (const [h, r] of Object.entries(reviews)) {
    const pe = reviewerPolicyErrors(r, policy);
    if (pe.length) { result.ok = false; result.results.push({ file: h, ok: false, errors: pe }); }
  }
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
