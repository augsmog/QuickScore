// AUG-1354: content-addressed node_modules pilot keeps one tree per lockfile identity.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cacheKey, ensure, link, measure } = require('../scripts/nm-cas/nm-cas.cjs');

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nm-cas-'));
const project = (lock) => {
  const d = mk();
  fs.writeFileSync(path.join(d, 'package.json'), '{"name":"x"}');
  fs.writeFileSync(path.join(d, 'package-lock.json'), lock);
  return d;
};
const fakeInstall = (cwd) => {
  fs.mkdirSync(path.join(cwd, 'node_modules', 'pkg', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'node_modules', 'pkg', 'lib', 'a.js'), 'module.exports=1');
  fs.mkdirSync(path.join(cwd, 'node_modules', '.bin'));
  fs.symlinkSync('../pkg/lib/a.js', path.join(cwd, 'node_modules', '.bin', 'a'));
  return { status: 0 };
};

describe('nm-cas (AUG-1354)', () => {
  test('key is stable for same lockfile and changes with lockfile or runtime', () => {
    const a = project('{"v":1}'); const b = project('{"v":1}'); const c = project('{"v":2}');
    expect(cacheKey(a)).toBe(cacheKey(b));
    expect(cacheKey(a)).not.toBe(cacheKey(c));
    expect(cacheKey(a, { ...process, version: 'v0.0.0' })).not.toBe(cacheKey(a));
    expect(cacheKey(a, { ...process, platform: 'plan9' })).not.toBe(cacheKey(a));
  });

  test('ensure installs once per key, then reuses', () => {
    const p = project('{"v":1}'); const store = mk();
    const calls = jest.fn(fakeInstall);
    expect(ensure(p, store, calls).built).toBe(true);
    expect(ensure(p, store, calls).built).toBe(false);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  test('failed install never publishes a store entry', () => {
    const p = project('{"v":3}'); const store = mk();
    expect(() => ensure(p, store, () => ({ status: 1 }))).toThrow(/install failed/);
    expect(fs.readdirSync(store).every((n) => n.includes('.tmp-'))).toBe(true);
    expect(() => link(p, store, mk())).toThrow(/store entry missing/);
  });

  test('link hardlinks files, keeps symlinks, refuses reuse, and saves inodes', () => {
    const p = project('{"v":1}'); const store = mk();
    ensure(p, store, fakeInstall);
    const d1 = mk(); const d2 = mk();
    const r1 = link(p, store, d1); link(p, store, d2);
    const f1 = fs.statSync(path.join(d1, 'node_modules/pkg/lib/a.js'));
    const f2 = fs.statSync(path.join(d2, 'node_modules/pkg/lib/a.js'));
    expect(f1.ino).toBe(f2.ino);
    expect(f1.nlink).toBeGreaterThanOrEqual(3);
    expect(fs.readlinkSync(path.join(d1, 'node_modules/.bin/a'))).toBe('../pkg/lib/a.js');
    expect(r1.files).toBeGreaterThan(0);
    expect(() => link(p, store, d1)).toThrow(/refusing to reuse/);
    const m = measure([path.join(d1, 'node_modules'), path.join(d2, 'node_modules')]);
    expect(m.uniqueInodes).toBeLessThan(m.entries);
  });

  test('rejects relative paths and half-built entries', () => {
    const p = project('{"v":1}');
    expect(() => ensure('rel', mk(), fakeInstall)).toThrow(/absolute/);
    const store = mk();
    fs.mkdirSync(path.join(store, cacheKey(p)));
    expect(() => ensure(p, store, fakeInstall)).toThrow(/incomplete store entry/);
  });
});
