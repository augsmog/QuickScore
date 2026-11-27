#!/usr/bin/env node
// The one entry point for anything that builds, archives or uploads SnapScore (AUG-1602).
//
//   node scripts/release/run-on-candidate.cjs --source <checkout being built> --receipt <candidate-receipt.json>
//        [--fixes release/required-fixes.json] -- <build / archive / upload command ...>
//
// It runs the command only if ALL of these hold, and otherwise exits non-zero without running it:
//   - the checkout at --source has HEAD exactly equal to the receipt's SHA;
//   - that checkout has no modified, staged or deleted tracked files (what gets built is the SHA);
//   - candidate-check `verify` accepts the receipt for that SHA (tree, fix manifest, test list).
// The command runs in <source>/scoresnap with CANDIDATE_SHA, CANDIDATE_TREE and CANDIDATE_RECEIPT
// set, and this script exits with the command's exit status.
//
// This tool lives on the default branch; --source is a separate checkout of the release SHA, so
// the source being shipped is not changed by the thing that guards it.
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { verifyReceipt, Refusal } = require('./candidate-check.cjs');

const refuse = (message) => { throw new Refusal(message); };
const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

function parse(argv) {
  const split = argv.indexOf('--');
  if (split === -1) refuse('usage: run-on-candidate.cjs --source <dir> --receipt <file> [--fixes <file>] -- <command ...>');
  const flags = argv.slice(0, split); const command = argv.slice(split + 1);
  const options = {};
  for (let i = 0; i < flags.length; i += 2) {
    if (!/^--(source|receipt|fixes)$/.test(flags[i] ?? '') || flags[i + 1] === undefined) refuse(`bad argument: ${flags[i]}`);
    options[flags[i].slice(2)] = flags[i + 1];
  }
  if (!options.source || !options.receipt) refuse('--source and --receipt are both required');
  if (command.length === 0) refuse('no command given after --');
  return { options, command };
}

function admit({ source, receiptPath, fixesFile }) {
  if (!fs.existsSync(receiptPath)) refuse(`no candidate receipt at ${receiptPath}; nothing may be built, archived or uploaded without one`);
  let repo; let head;
  try { repo = git(source, ['rev-parse', '--show-toplevel']); head = git(repo, ['rev-parse', 'HEAD']); } catch { refuse(`${source} is not a git checkout`); }
  let receipt;
  try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch { refuse('candidate receipt is not valid JSON'); }
  if (receipt.sha !== head) refuse(`the checkout at ${repo} is at ${head}, but the receipt is for ${receipt.sha}; build only the SHA that has the receipt`);
  const dirty = git(repo, ['status', '--porcelain', '--untracked-files=no']);
  if (dirty) refuse(`the checkout at ${repo} has changes to tracked files; what gets built must be exactly ${head}:\n${dirty}`);
  return { repo, receipt: verifyReceipt({ repo, sha: head, receiptPath, fixesFile }) };
}

function runOnCandidate(argv, { spawn = spawnSync, log = console.log } = {}) {
  const { options, command } = parse(argv);
  const scoresnap = path.resolve(__dirname, '..', '..');
  const receiptPath = path.resolve(options.receipt);
  const { repo, receipt } = admit({
    source: path.resolve(options.source), receiptPath,
    fixesFile: path.resolve(options.fixes ?? path.join(scoresnap, 'release', 'required-fixes.json')),
  });
  const app = path.join(repo, 'scoresnap');
  const cwd = fs.existsSync(app) ? app : repo;
  log(`CANDIDATE ADMITTED: ${receipt.sha} (tree ${receipt.tree}), ${receipt.suite.tests} tests, test list ${receipt.suite.testIdsSha256}. Running in ${cwd}: ${command.join(' ')}`);
  const result = spawn(command[0], command.slice(1), {
    cwd, stdio: 'inherit',
    env: { ...process.env, CANDIDATE_SHA: receipt.sha, CANDIDATE_TREE: receipt.tree, CANDIDATE_RECEIPT: receiptPath },
  });
  if (result.error) refuse(`could not start the command: ${result.error.message}`);
  return result.status ?? 1;
}

module.exports = { runOnCandidate, admit };
if (require.main === module) {
  try { process.exitCode = runOnCandidate(process.argv.slice(2)); } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    console.error(`REFUSED: ${error.message}`);
    process.exitCode = 1;
  }
}
