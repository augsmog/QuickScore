// Same-run standard-web artifact verification. No cross-run/event cache reuse.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STANDARD_FLAGS = Object.freeze({
  EXPO_PUBLIC_OFFLINE_MODE: 'true',
  EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING: 'false',
  EXPO_PUBLIC_DEMO_MODE: 'false',
});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function inventory(root) {
  const files = [];
  function walk(directory, prefix = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const relative = prefix + name;
      const full = path.join(directory, name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error(`Artifact symlink: ${relative}`);
      if (stat.isDirectory()) walk(full, relative + '/');
      else if (stat.isFile()) files.push({ path: relative, sha256: sha256(fs.readFileSync(full)), bytes: stat.size });
      else throw new Error(`Unsupported artifact entry: ${relative}`);
    }
  }
  walk(root);
  if (!files.some(file => file.path === 'index.html')) throw new Error('Missing app index');
  const entries = files.filter(file => /^_expo\/static\/js\/web\/entry-[^/]+\.js$/.test(file.path));
  if (entries.length !== 1) throw new Error('Expected exactly one app entry bundle');
  if (!fs.readFileSync(path.join(root, entries[0].path), 'utf8').includes('Build contests. Settle up.')) {
    throw new Error('Missing current application marker; router-only export is not evidence');
  }
  return files;
}

export function createManifest(root, identity) {
  return { schema: 1, identity, files: inventory(root) };
}

// Runner-local facts that legitimately differ between the build and browser jobs of ONE run: hosted jobs can land on
// different runner image versions while GitHub rolls out a new image (run 41674766596: 20261025.353.1 vs 20261101.360.1),
// and setup-node may resolve a different patch of the same major from each image's tool cache. They stay recorded in the
// manifest for audit; every artifact-provenance field (run, attempt, commit, tree, workflow, lock, expo, playwright,
// flags, imageOS) and the node major must still match exactly.
const nodeMajor = version => /^v?(\d+)\./.exec(String(version ?? ''))?.[1] ?? null;
const RUNNER_LOCAL = ['imageVersion', 'node'];
export function sameProvenance(built, current) {
  if (!built || typeof built !== 'object' || !current || typeof current !== 'object') return false;
  const keys = identity => JSON.stringify(Object.keys(identity).sort());
  if (keys(built) !== keys(current)) return false;                       // no extra or missing identity fields
  for (const identity of [built, current]) {
    if (typeof identity.imageVersion !== 'string' || !identity.imageVersion) return false;
    if (nodeMajor(identity.node) === null) return false;
  }
  if (nodeMajor(built.node) !== nodeMajor(current.node)) return false;
  return Object.keys(built).every(key => RUNNER_LOCAL.includes(key) || JSON.stringify(built[key]) === JSON.stringify(current[key]));
}

export function verifyManifest(root, identity, manifest) {
  if (manifest?.schema !== 1) throw new Error('Unsupported artifact manifest');
  if (!sameProvenance(manifest.identity, identity)) throw new Error('Artifact provenance mismatch');
  if (JSON.stringify(manifest.files) !== JSON.stringify(inventory(root))) throw new Error('Artifact content mismatch');
}

export function currentIdentity(cwd = process.cwd(), env = process.env) {
  const required = ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA', 'ImageOS', 'ImageVersion'];
  for (const key of required) if (!env[key]) throw new Error(`Missing CI identity: ${key}`);
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const commit = git('rev-parse', 'HEAD');
  if (commit !== env.GITHUB_SHA) throw new Error('Checkout does not match the workflow commit');
  const repo = git('rev-parse', '--show-toplevel');
  execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', '.'], { cwd: repo, stdio: 'pipe' });
  const lockBytes = fs.readFileSync(path.join(cwd, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  return {
    run: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
    commit,
    tree: git('rev-parse', 'HEAD^{tree}'),
    workflow: sha256(fs.readFileSync(path.join(repo, '.github/workflows/web-smoke.yml'))),
    lock: sha256(lockBytes),
    node: process.version,
    imageOS: env.ImageOS,
    imageVersion: env.ImageVersion,
    expo: lock.packages['node_modules/expo'].version,
    playwright: lock.packages['node_modules/playwright'].version,
    flags: STANDARD_FLAGS,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, root, manifestFile] = process.argv.slice(2);
  if (!['create', 'verify'].includes(command) || !root || !manifestFile) throw new Error('Usage: web-artifact.mjs create|verify ROOT MANIFEST');
  const identity = currentIdentity();
  if (command === 'create') {
    for (const [key, value] of Object.entries(STANDARD_FLAGS)) {
      if (process.env[key] !== value) throw new Error(`Build flag mismatch: ${key}`);
    }
    fs.writeFileSync(manifestFile, JSON.stringify(createManifest(root, identity), null, 2) + '\n');
  } else verifyManifest(root, identity, JSON.parse(fs.readFileSync(manifestFile, 'utf8')));
  console.log(`Standard web artifact ${command}: PASS`);
}
