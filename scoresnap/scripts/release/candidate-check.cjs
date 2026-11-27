#!/usr/bin/env node
// Enforced candidate check (AUG-1602).
//
// A SHA may be called a "candidate" only when this check has written a receipt for that exact SHA
// and a different service has recomputed it. Build 32 went to TestFlight with launch-blocking
// bugs, and the frozen 1.0.1 source had red tests and lacked the paywall fix: both were called
// ready by people reading tickets. This replaces that reading with a command that refuses.
//
//   node scripts/release/candidate-check.cjs check  --sha <40-hex> [--fixes release/required-fixes.json]
//                                                   [--receipt candidate-receipt.json] [--reuse-node-modules <dir>]
//   node scripts/release/candidate-check.cjs verify --sha <40-hex> --receipt candidate-receipt.json
//
// `check` exits 0 and writes the receipt only if every required fix is in the SHA, the full unit
// suite passes on the SHA with no failures and no skips beyond the named allow-list, and the
// version matches. On any failure it exits non-zero and leaves NO receipt at the receipt path.
// `verify` is what build, archive and upload steps call: it refuses unless the receipt is for
// that exact SHA and tree and was written by this file as it currently is.
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SHA = /^[0-9a-f]{40}$/;
const RECEIPT_SCHEMA = 'snapscore-candidate-receipt/1';
const FIXES_SCHEMA = 'snapscore-required-fixes/1';

class Refusal extends Error {}
const refuse = (message) => { throw new Refusal(message); };

function git(repo, args, options = {}) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
}
function gitOk(repo, args) {
  try { git(repo, args); return true; } catch { return false; }
}
function patchId(repo, commit) {
  const diff = execFileSync('git', ['-C', repo, 'show', '--no-color', '--format=', commit], { maxBuffer: 256 * 1024 * 1024 });
  const out = execFileSync('git', ['-C', repo, 'patch-id', '--stable'], { input: diff, encoding: 'utf8' }).trim();
  return out.split(/\s+/)[0] || null;
}

function validateFixes(doc) {
  if (!doc || doc.schema !== FIXES_SCHEMA) refuse(`required-fixes file must have schema ${FIXES_SCHEMA}`);
  if (typeof doc.release?.version !== 'string' || !doc.release.version) refuse('required-fixes: release.version is missing');
  if (typeof doc.release?.ticket !== 'string' || !doc.release.ticket) refuse('required-fixes: release.ticket is missing');
  if (!SHA.test(doc.base ?? '')) refuse('required-fixes: base must be a full 40-character commit SHA');
  if (!Array.isArray(doc.fixes) || doc.fixes.length === 0) refuse('required-fixes: fixes must be a non-empty list');
  const seen = new Set();
  for (const fix of doc.fixes) {
    if (typeof fix?.ticket !== 'string' || !fix.ticket) refuse('required-fixes: every fix needs a ticket');
    if (typeof fix?.what !== 'string' || !fix.what) refuse(`required-fixes: ${fix.ticket} needs a "what"`);
    if (!SHA.test(fix?.commit ?? '')) refuse(`required-fixes: ${fix.ticket} commit must be a full 40-character SHA`);
    if (seen.has(fix.commit)) refuse(`required-fixes: commit ${fix.commit} is listed twice`);
    seen.add(fix.commit);
  }
  for (const name of doc.allowedSkips ?? []) if (typeof name !== 'string' || !name) refuse('required-fixes: allowedSkips must be full test names');
  return doc;
}

// A fix is present if its commit is an ancestor of the SHA, or if a commit between the base and
// the SHA carries the identical patch. The second form exists because fixes are combined by
// cherry-pick, which gives each a new commit SHA; an altered fix has a different patch id and is
// refused.
function locateFixes(repo, sha, doc) {
  if (!gitOk(repo, ['cat-file', '-e', `${doc.base}^{commit}`])) refuse(`base ${doc.base} is not in this repository; fetch it first`);
  if (!gitOk(repo, ['merge-base', '--is-ancestor', doc.base, sha])) refuse(`base ${doc.base} is not an ancestor of ${sha}`);
  const range = git(repo, ['rev-list', '--no-merges', `${doc.base}..${sha}`]).split('\n').filter(Boolean);
  let rangeIds = null;
  return doc.fixes.map((fix) => {
    if (!gitOk(repo, ['cat-file', '-e', `${fix.commit}^{commit}`])) refuse(`required fix ${fix.ticket} (${fix.what}): commit ${fix.commit} is not in this repository; fetch it first`);
    if (gitOk(repo, ['merge-base', '--is-ancestor', fix.commit, sha])) return { ...fix, present: 'yes', how: 'ancestor', as: fix.commit };
    rangeIds ??= new Map(range.map((commit) => [patchId(repo, commit), commit]));
    const as = rangeIds.get(patchId(repo, fix.commit));
    if (!as) refuse(`required fix missing: ${fix.ticket} (${fix.what}), commit ${fix.commit}, is neither an ancestor of ${sha} nor present as an identical patch after ${doc.base}`);
    return { ...fix, present: 'yes', how: 'identical-patch', as };
  });
}

function checkVersion(repo, sha, doc) {
  let app; let eas;
  try { app = JSON.parse(git(repo, ['show', `${sha}:scoresnap/app.json`])).expo; } catch { refuse(`cannot read scoresnap/app.json at ${sha}`); }
  try { eas = JSON.parse(git(repo, ['show', `${sha}:scoresnap/eas.json`])); } catch { refuse(`cannot read scoresnap/eas.json at ${sha}`); }
  if (app?.version !== doc.release.version) refuse(`version mismatch: source says ${app?.version}, release ${doc.release.ticket} says ${doc.release.version}`);
  const source = eas?.cli?.appVersionSource;
  if (source === 'remote') return { version: app.version, buildNumber: 'assigned at build time (eas appVersionSource: remote); verify on the archive' };
  const build = String(app?.ios?.buildNumber ?? '');
  if (doc.release.buildNumber === undefined) refuse('build number is set in source (appVersionSource is not remote) but required-fixes release.buildNumber is missing');
  if (build !== String(doc.release.buildNumber)) refuse(`build number mismatch: source says ${build}, release says ${doc.release.buildNumber}`);
  return { version: app.version, buildNumber: build };
}

// Runs the full Jest suite in a clean checkout of exactly `sha`. Never the working tree.
function runSuiteAtSha(repo, sha, { reuseNodeModules } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-check-'));
  const tree = path.join(dir, 'src');
  try {
    git(repo, ['worktree', 'add', '--detach', tree, sha]);
    const app = path.join(tree, 'scoresnap');
    if (reuseNodeModules) {
      const lockHere = crypto.createHash('sha256').update(fs.readFileSync(path.join(app, 'package-lock.json'))).digest('hex');
      const lockThere = crypto.createHash('sha256').update(fs.readFileSync(path.join(path.dirname(reuseNodeModules), 'package-lock.json'))).digest('hex');
      if (lockHere !== lockThere) refuse('--reuse-node-modules refused: its package-lock.json differs from the lockfile at the SHA');
      fs.symlinkSync(path.resolve(reuseNodeModules), path.join(app, 'node_modules'), 'dir');
    } else {
      execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: app, stdio: 'inherit' });
    }
    const out = path.join(dir, 'jest.json');
    try {
      execFileSync('npx', ['jest', '--ci', '--json', `--outputFile=${out}`, `--cacheDirectory=${path.join(dir, 'jest-cache')}`], { cwd: app, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CI: 'true' } });
    } catch { /* a red suite exits non-zero; the JSON report below is what is judged */ }
    if (!fs.existsSync(out)) refuse('the unit suite did not produce a report; it did not run to completion');
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    const skipped = [];
    for (const file of report.testResults ?? []) for (const test of file.assertionResults ?? []) {
      if (test.status === 'pending' || test.status === 'skipped' || test.status === 'todo') skipped.push(test.fullName);
    }
    return {
      suites: report.numTotalTestSuites, suitesFailed: report.numFailedTestSuites, suitesErrored: report.numRuntimeErrorTestSuites,
      tests: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, skipped,
    };
  } finally {
    try { git(repo, ['worktree', 'remove', '--force', tree]); } catch { /* best effort */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function judgeSuite(suite, allowedSkips) {
  for (const key of ['suites', 'tests', 'passed', 'failed', 'suitesFailed', 'suitesErrored']) {
    if (!Number.isInteger(suite?.[key]) || suite[key] < 0) refuse(`unit suite report is incomplete (${key})`);
  }
  if (suite.tests === 0 || suite.suites === 0) refuse('unit suite ran zero tests');
  if (suite.failed > 0 || suite.suitesFailed > 0 || suite.suitesErrored > 0) refuse(`unit suite is red: ${suite.failed} test(s) failed, ${suite.suitesFailed} suite(s) failed, ${suite.suitesErrored} suite(s) could not run`);
  const extra = (suite.skipped ?? []).filter((name) => !allowedSkips.includes(name));
  if (extra.length) refuse(`unit suite has ${extra.length} skipped test(s) not on the allow-list: ${extra.slice(0, 5).join(' | ')}`);
  if (suite.passed + suite.skipped.length !== suite.tests) refuse('unit suite counts do not add up (passed + skipped != total)');
}

const selfSha256 = () => crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');

function candidateCheck({ repo, sha, fixesFile, receiptPath, runSuite = runSuiteAtSha, reuseNodeModules, now = () => new Date() }) {
  // A stale receipt must never survive a failed run.
  if (receiptPath) fs.rmSync(receiptPath, { force: true });
  if (!SHA.test(sha ?? '')) refuse('--sha must be one full 40-character commit SHA');
  if (!gitOk(repo, ['cat-file', '-e', `${sha}^{commit}`])) refuse(`${sha} is not a commit in this repository`);
  const fixesBytes = fs.readFileSync(fixesFile);
  const doc = validateFixes(JSON.parse(fixesBytes.toString('utf8')));
  const fixes = locateFixes(repo, sha, doc);
  const release = checkVersion(repo, sha, doc);
  const suite = runSuite(repo, sha, { reuseNodeModules });
  judgeSuite(suite, doc.allowedSkips ?? []);
  const receipt = {
    schema: RECEIPT_SCHEMA,
    sha,
    tree: git(repo, ['rev-parse', `${sha}^{tree}`]),
    base: doc.base,
    release: { ticket: doc.release.ticket, ...release },
    suite: { suites: suite.suites, tests: suite.tests, passed: suite.passed, failed: 0, skipped: suite.skipped },
    fixes: fixes.map(({ ticket, what, commit, present, how, as }) => ({ ticket, what, commit, present, how, as })),
    requiredFixesSha256: crypto.createHash('sha256').update(fixesBytes).digest('hex'),
    checkSha256: selfSha256(),
    node: process.version,
    checkedAt: now().toISOString(),
  };
  if (receiptPath) fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

// What build, archive and upload steps call before they do anything.
function verifyReceipt({ repo, sha, receiptPath }) {
  if (!SHA.test(sha ?? '')) refuse('--sha must be one full 40-character commit SHA');
  if (!receiptPath || !fs.existsSync(receiptPath)) refuse(`no candidate receipt at ${receiptPath}; ${sha} is not a candidate`);
  let receipt;
  try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch { refuse('candidate receipt is not valid JSON'); }
  if (receipt.schema !== RECEIPT_SCHEMA) refuse('candidate receipt has the wrong schema');
  if (receipt.sha !== sha) refuse(`candidate receipt is for ${receipt.sha}, not ${sha}`);
  if (receipt.tree !== git(repo, ['rev-parse', `${sha}^{tree}`])) refuse('candidate receipt tree does not match the SHA');
  if (receipt.suite?.failed !== 0 || !(receipt.suite?.tests > 0)) refuse('candidate receipt does not record a green suite');
  if (!Array.isArray(receipt.fixes) || receipt.fixes.length === 0 || receipt.fixes.some((fix) => fix.present !== 'yes')) refuse('candidate receipt does not record every required fix as present');
  if (receipt.checkSha256 !== selfSha256()) refuse('candidate receipt was written by a different version of candidate-check; run the check again');
  return receipt;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    if (!/^--[a-z-]+$/.test(key ?? '') || rest[i + 1] === undefined) refuse(`bad argument: ${key}`);
    options[key.slice(2)] = rest[i + 1];
  }
  return { command, options };
}

function main(argv) {
  const scoresnap = path.resolve(__dirname, '..', '..');
  try {
    const { command, options } = parseArgs(argv);
    const repo = git(scoresnap, ['rev-parse', '--show-toplevel']);
    const receiptPath = path.resolve(options.receipt ?? 'candidate-receipt.json');
    if (command === 'check') {
      const receipt = candidateCheck({
        repo, sha: options.sha, receiptPath,
        fixesFile: path.resolve(options.fixes ?? path.join(scoresnap, 'release', 'required-fixes.json')),
        reuseNodeModules: options['reuse-node-modules'],
      });
      console.log(`CANDIDATE CHECK PASSED for ${receipt.sha} (tree ${receipt.tree}): ${receipt.suite.tests} tests, 0 failed, ${receipt.fixes.length} required fixes present. Receipt: ${receiptPath}`);
      console.log('This SHA is a candidate only once a different service has recomputed this receipt.');
    } else if (command === 'verify') {
      const receipt = verifyReceipt({ repo, sha: options.sha, receiptPath });
      console.log(`RECEIPT OK for ${receipt.sha} (tree ${receipt.tree}), checked ${receipt.checkedAt}`);
    } else {
      refuse('usage: candidate-check.cjs check|verify --sha <40-hex> [--fixes file] [--receipt file] [--reuse-node-modules dir]');
    }
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    console.error(`CANDIDATE CHECK REFUSED: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { candidateCheck, verifyReceipt, validateFixes, judgeSuite, Refusal, RECEIPT_SCHEMA, FIXES_SCHEMA };
if (require.main === module) main(process.argv.slice(2));
