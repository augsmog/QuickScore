// AUG-227 inode plan phase C: the shared-store pnpm pilot must stay a disposable-copy
// experiment. These checks keep it from changing the production npm install path and
// prove the script fails closed before it installs anything.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts', 'inode-pnpm-pilot', 'run.sh');
const source = fs.readFileSync(script, 'utf8');
const run = (env, args = []) =>
  spawnSync('bash', [script, ...args], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });

describe('inode pnpm pilot (AUG-227 phase C)', () => {
  // Inside a pilot copy the derived pnpm lockfile exists by design, so this guard is for real checkouts.
  (process.env.AOS_PILOT_COPY === '1' ? test.skip : test)('production install path is untouched: npm lockfile only, no pnpm pin', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.packageManager).toBeUndefined();
    expect(fs.existsSync(path.join(root, 'package-lock.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'pnpm-lock.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))).toBe(false);
  });

  test('script parses and never deletes anything', () => {
    expect(spawnSync('bash', ['-n', script]).status).toBe(0);
    expect(source).not.toMatch(/\brm\s|rmdir|unlink|--force|git\s+clean/);
    expect(source).toMatch(/--frozen-lockfile/);
    expect(source).toMatch(/package-import-method=hardlink/);
    expect(source).toMatch(/node-linker=hoisted/);
  });

  test('refuses missing, relative or unknown inputs before any install', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inode-pilot-'));
    const ok = { AOS_PNPM_STORE: path.join(tmp, 'store'), AOS_PILOT_OUTPUT: path.join(tmp, 'out') };
    expect(run({}).status).not.toBe(0);
    expect(run({ ...ok, AOS_PNPM_STORE: 'relative/store' }).status).toBe(64);
    expect(run({ ...ok, AOS_PILOT_OUTPUT: 'relative/out' }).status).toBe(64);
    expect(run(ok, ['bogus']).status).toBe(64);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  test('refuses at the inode cap and refuses to reuse an output path', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inode-pilot-'));
    const env = { AOS_PNPM_STORE: path.join(tmp, 'store'), AOS_PILOT_OUTPUT: path.join(tmp, 'out') };
    const capped = run({ ...env, AOS_PILOT_INODE_CAP: '0' });
    expect(capped.status).not.toBe(0);
    expect(capped.stderr).toMatch(/inode use .* >= cap|inode cap/);
    expect(fs.existsSync(path.join(tmp, 'out', 'checkout'))).toBe(false);

    fs.mkdirSync(path.join(tmp, 'out', 'checkout'), { recursive: true });
    const reused = run(env);
    expect(reused.status).not.toBe(0);
    expect(reused.stderr).toMatch(/refusing to reuse/);
  });

  test('wrong pnpm version stops before a checkout copy is made', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inode-pilot-'));
    const env = { AOS_PNPM_STORE: path.join(tmp, 'store'), AOS_PILOT_OUTPUT: path.join(tmp, 'out') };
    const res = run({ ...env, AOS_PNPM_CMD: 'echo 0.0.0' });
    expect(res.status).toBe(65);
    expect(res.stderr).toMatch(/pnpm 10\.34\.6 required/);
    expect(fs.existsSync(path.join(tmp, 'out', 'checkout'))).toBe(false);
  });
});


// Real shell and git; package/build commands are stubs so these tests never install.
describe('pilot command regression controls', () => {
  let tmp, repo, app, env;
  const git = (...args) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    if (r.status) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pnpm-controls-'));
    repo = path.join(tmp, 'source'); app = path.join(repo, 'scoresnap');
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(path.join(app, 'scripts/inode-pnpm-pilot'), { recursive: true });
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(app, 'scripts/inode-pnpm-pilot/run.sh'), source);
    fs.writeFileSync(path.join(app, 'package-lock.json'), '{"lockfileVersion":3}\n');
    fs.writeFileSync(path.join(app, 'package.json'), '{}\n');
    fs.mkdirSync(path.join(app, 'node_modules'));
    fs.writeFileSync(path.join(app, 'node_modules/untouched'), 'installed source');
    git('init', '-q'); git('add', 'scoresnap/package.json', 'scoresnap/package-lock.json', 'scoresnap/scripts');
    git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    fs.writeFileSync(path.join(bin, 'pnpm'), `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$CALLS"
case "$1" in
 --version) echo 10.34.6;;
 import) echo derived > pnpm-lock.yaml;;
 install) mkdir node_modules;;
 exec)
   if [ "$2" = jest ]; then
     test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"
     git show "$EXPECTED_SHA:scoresnap/package-lock.json" | cmp - package-lock.json
     echo 'Tests: stub command control'
     exit "\${JEST_EXIT:-0}"
   fi;;
esac
`);
    fs.writeFileSync(path.join(bin, 'node'), '#!/usr/bin/env bash\ncat >/dev/null\n');
    for (const n of ['pnpm', 'node']) fs.chmodSync(path.join(bin, n), 0o755);
    env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: path.join(tmp, 'calls'),
      EXPECTED_SHA: git('rev-parse', 'HEAD'), AOS_PNPM_CMD: 'pnpm',
      AOS_PNPM_STORE: path.join(tmp, 'store'), AOS_PILOT_OUTPUT: path.join(tmp, 'out') };
    delete env.AOS_PILOT_INODE_CAP;
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const invoke = () => spawnSync('bash', [path.join(app, 'scripts/inode-pnpm-pilot/run.sh')], { env, encoding: 'utf8' });
  const refusedBeforeCommands = () => {
    const r = invoke();
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(env.CALLS)).toBe(false);
  };
  test.each(['NaN', 'Infinity', '-Infinity', '0.77', '1', '0', '-1', 'bad'])('rejects unsafe inode cap %s before commands', cap => {
    env.AOS_PILOT_INODE_CAP = cap; refusedBeforeCommands();
  });
  test.each(['out-in-source', 'store-in-source', 'source-in-store', 'same', 'store-in-out', 'out-in-store', 'symlink-out', 'symlink-parent', 'existing-out', 'dangling-out'])('rejects %s before commands or source changes', kind => {
    if (kind === 'out-in-source') env.AOS_PILOT_OUTPUT = path.join(app, 'out');
    if (kind === 'store-in-source') env.AOS_PNPM_STORE = path.join(repo, 'store');
    if (kind === 'source-in-store') env.AOS_PNPM_STORE = tmp;
    if (kind === 'same') env.AOS_PNPM_STORE = env.AOS_PILOT_OUTPUT;
    if (kind === 'store-in-out') env.AOS_PNPM_STORE = path.join(env.AOS_PILOT_OUTPUT, 'store');
    if (kind === 'out-in-store') env.AOS_PILOT_OUTPUT = path.join(env.AOS_PNPM_STORE, 'out');
    if (kind === 'symlink-out') fs.symlinkSync(repo, env.AOS_PILOT_OUTPUT);
    if (kind === 'symlink-parent') { fs.symlinkSync(repo, path.join(tmp, 'alias')); env.AOS_PILOT_OUTPUT = path.join(tmp, 'alias', 'out'); }
    if (kind === 'existing-out') fs.mkdirSync(env.AOS_PILOT_OUTPUT);
    if (kind === 'dangling-out') fs.symlinkSync(path.join(tmp, 'absent'), env.AOS_PILOT_OUTPUT);
    refusedBeforeCommands();
    expect(git('status', '--porcelain', '--untracked-files=no')).toBe('');
    expect(fs.readFileSync(path.join(app, 'node_modules/untouched'), 'utf8')).toBe('installed source');
  });
  test('successful stub pilot retains history and never changes source install or lockfile', () => {
    const r = invoke();
    expect(r.stderr).toBe(''); expect(r.status).toBe(0); expect(r.stdout).toContain('PILOT_JS_OK');
    expect(fs.readFileSync(path.join(app, 'node_modules/untouched'), 'utf8')).toBe('installed source');
    expect(git('status', '--porcelain', '--untracked-files=no')).toBe('');
    expect(fs.readFileSync(env.CALLS, 'utf8')).toContain('exec expo export');
  });
  test('Jest failure cannot be waived and prevents export or success marker', () => {
    env.JEST_EXIT = '7'; env.AOS_PILOT_ALLOW_JEST_FAIL = '1';
    const r = invoke();
    expect(r.status).not.toBe(0); expect(r.stdout).not.toContain('PILOT_JS_OK');
    expect(fs.readFileSync(env.CALLS, 'utf8')).not.toContain('exec expo export');
  });
  test('dirty tracked source refuses before import or install', () => {
    fs.appendFileSync(path.join(app, 'package.json'), ' ');
    const r = invoke(); expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('tracked source must be clean');
    expect(fs.readFileSync(env.CALLS, 'utf8').trim()).toBe('--version');
  });
  test.each(['zero', 'inconsistent', 'error'])('invalid statvfs %s refuses before commands', kind => {
    const inject = path.join(tmp, 'inject'); fs.mkdirSync(inject);
    fs.writeFileSync(path.join(inject, 'sitecustomize.py'), `import os
original = os.statvfs
def fake(path):
 if '${kind}' == 'error': raise OSError('statvfs unavailable')
 s=list(original(path)); s[5]=0 if '${kind}' == 'zero' else 100; s[6]=101; return os.statvfs_result(s)
os.statvfs=fake
`);
    env.PYTHONPATH = inject; refusedBeforeCommands();
  });
  test('76 percent inode use refuses at the default cap', () => {
    const inject = path.join(tmp, 'inject'); fs.mkdirSync(inject);
    fs.writeFileSync(path.join(inject, 'sitecustomize.py'), `import os
original = os.statvfs
def fake(path):
 s=list(original(path)); s[5]=100; s[6]=24; return os.statvfs_result(s)
os.statvfs=fake
`);
    env.PYTHONPATH = inject; refusedBeforeCommands();
  });
});
