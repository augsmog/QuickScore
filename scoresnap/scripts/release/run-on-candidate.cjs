#!/usr/bin/env node
// The one entry point for anything that builds, archives or uploads SnapScore (AUG-1602).
//
//   node scripts/release/run-on-candidate.cjs --receipt <candidate-receipt.json>
//        [--repo <any checkout of this repository>] [--keep] [--fixes release/required-fixes.json]
//        -- <build / archive / upload command ...>
//
// Default (fresh mode): after `verify` accepts the receipt, the script itself makes a new checkout
// of exactly the receipt's SHA in a new temporary directory, runs the command there, and removes
// the directory afterwards. Nothing from an earlier build (ios/, node_modules, .env, any other
// git-ignored path) can exist there, because the directory did not exist before. --repo names the
// repository to take the commit from (default: the one this script is in); nothing in that
// checkout's working files is used. --keep leaves the directory in place and prints its path.
//
//   ... --source <existing checkout> --receipt <file> -- <command ...>
//
// Existing-checkout mode, for cases that need one. It refuses unless HEAD is exactly the receipt's
// SHA and there are no changes to tracked files and no untracked files that are not git-ignored.
// It CANNOT see git-ignored paths, so it prints a warning every time.
//
// In both modes the command runs in <checkout>/scoresnap with CANDIDATE_SHA, CANDIDATE_TREE,
// CANDIDATE_RECEIPT and CANDIDATE_CHECKOUT set, and this script exits with the command's status.
// On any refusal it exits non-zero and the command is not started.
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyReceipt, Refusal } = require('./candidate-check.cjs');

const USAGE = 'usage: run-on-candidate.cjs --receipt <file> [--repo <dir> | --source <dir>] [--keep] [--fixes <file>] -- <command ...>';
const refuse = (message) => { throw new Refusal(message); };
const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

function parse(argv) {
  const split = argv.indexOf('--');
  if (split === -1) refuse(USAGE);
  const flags = argv.slice(0, split); const command = argv.slice(split + 1);
  const options = {};
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] === '--keep') { options.keep = true; continue; }
    if (!/^--(source|repo|receipt|fixes)$/.test(flags[i]) || flags[i + 1] === undefined) refuse(`bad argument: ${flags[i]}`);
    options[flags[i].slice(2)] = flags[i + 1]; i += 1;
  }
  if (!options.receipt) refuse('--receipt is required');
  if (options.source && options.repo) refuse('give --repo (fresh checkout, the default) or --source (existing checkout), not both');
  if (options.source && options.keep) refuse('--keep only applies to a fresh checkout; --source is never removed');
  if (command.length === 0) refuse('no command given after --');
  return { options, command };
}

function readReceipt(receiptPath) {
  if (!fs.existsSync(receiptPath)) refuse(`no candidate receipt at ${receiptPath}; nothing may be built, archived or uploaded without one`);
  try { return JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch { return refuse('candidate receipt is not valid JSON'); }
}

function topLevel(dir) {
  try { return git(dir, ['rev-parse', '--show-toplevel']); } catch { return refuse(`${dir} is not a git checkout`); }
}

// Refuses unless the checkout is exactly `sha` with nothing added or changed that git can see.
function assertExact(repo, sha) {
  const head = git(repo, ['rev-parse', 'HEAD']);
  if (head !== sha) refuse(`the checkout at ${repo} is at ${head}, but the receipt is for ${sha}; build only the SHA that has the receipt`);
  const status = git(repo, ['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean);
  const dirty = status.filter((line) => !line.startsWith('??'));
  if (dirty.length) refuse(`the checkout at ${repo} has changes to tracked files; what gets built must be exactly ${head}:\n${dirty.join('\n')}`);
  const untracked = status.filter((line) => line.startsWith('??'));
  if (untracked.length) refuse(`the checkout at ${repo} has untracked files that are not git-ignored; they can change what gets built, so remove them (keep the receipt outside the checkout):\n${untracked.join('\n')}`);
}

// Existing-checkout mode.
function admit({ source, receiptPath, fixesFile }) {
  const sha = readReceipt(receiptPath).sha;
  const repo = topLevel(source);
  assertExact(repo, sha);
  return { repo, receipt: verifyReceipt({ repo, sha, receiptPath, fixesFile }) };
}

// Fresh mode: verify, then a new checkout of the receipt's SHA in a directory that did not exist.
function freshCheckout({ from, receiptPath, fixesFile, tmpRoot = os.tmpdir() }) {
  const sha = readReceipt(receiptPath).sha;
  const origin = topLevel(from);
  if (!/^[0-9a-f]{40}$/.test(String(sha))) refuse('the receipt does not name a full commit SHA');
  try { git(origin, ['cat-file', '-e', `${sha}^{commit}`]); } catch { refuse(`the repository at ${origin} does not have commit ${sha}; fetch it first`); }
  const receipt = verifyReceipt({ repo: origin, sha, receiptPath, fixesFile });
  const holder = fs.mkdtempSync(path.join(fs.realpathSync(tmpRoot), 'snapscore-candidate-'));
  const repo = path.join(holder, 'checkout');
  const remove = () => {
    try { git(origin, ['worktree', 'remove', '--force', repo]); } catch { /* removed below */ }
    fs.rmSync(holder, { recursive: true, force: true });
    try { git(origin, ['worktree', 'prune']); } catch { /* nothing to prune */ }
  };
  try {
    git(origin, ['worktree', 'add', '--detach', repo, sha]);
    assertExact(repo, sha);
  } catch (error) { remove(); throw error; }
  return { repo, receipt, remove };
}

function runOnCandidate(argv, { spawn = spawnSync, log = console.log, warn = console.error, tmpRoot } = {}) {
  const { options, command } = parse(argv);
  const scoresnap = path.resolve(__dirname, '..', '..');
  const receiptPath = path.resolve(options.receipt);
  const fixesFile = path.resolve(options.fixes ?? path.join(scoresnap, 'release', 'required-fixes.json'));
  const fresh = !options.source;
  const { repo, receipt, remove } = fresh
    ? freshCheckout({ from: path.resolve(options.repo ?? scoresnap), receiptPath, fixesFile, tmpRoot })
    : admit({ source: path.resolve(options.source), receiptPath, fixesFile });
  try {
    if (!fresh) warn(`WARNING: --source uses an existing checkout (${repo}). Git-ignored paths in it (ios/, node_modules, .env, .expo) are NOT checked and can change what gets built. For an archive or upload, leave --source out so a fresh checkout is made.`);
    const app = path.join(repo, 'scoresnap');
    const cwd = fs.existsSync(app) ? app : repo;
    log(`CANDIDATE ADMITTED: ${receipt.sha} (tree ${receipt.tree}), ${receipt.suite.tests} tests, test list ${receipt.suite.testIdsSha256}. ${fresh ? 'Fresh checkout' : 'Existing checkout'}. Running in ${cwd}: ${command.join(' ')}`);
    const result = spawn(command[0], command.slice(1), {
      cwd, stdio: 'inherit',
      env: { ...process.env, CANDIDATE_SHA: receipt.sha, CANDIDATE_TREE: receipt.tree, CANDIDATE_RECEIPT: receiptPath, CANDIDATE_CHECKOUT: repo },
    });
    if (result.error) refuse(`could not start the command: ${result.error.message}`);
    return result.status ?? 1;
  } finally {
    if (fresh && options.keep) log(`KEPT: the fresh checkout is at ${repo}; remove it with: git worktree remove --force ${repo}`);
    else if (fresh) remove();
  }
}

module.exports = { runOnCandidate, admit, freshCheckout };
if (require.main === module) {
  try { process.exitCode = runOnCandidate(process.argv.slice(2)); } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    console.error(`REFUSED: ${error.message}`);
    process.exitCode = 1;
  }
}
