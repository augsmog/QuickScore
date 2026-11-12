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
    expect(capped.stderr).toMatch(/inode use .* >= cap/);
    expect(fs.existsSync(path.join(tmp, 'out', 'checkout'))).toBe(false);

    fs.mkdirSync(path.join(tmp, 'out', 'checkout'), { recursive: true });
    const reused = run(env);
    expect(reused.status).toBe(65);
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
