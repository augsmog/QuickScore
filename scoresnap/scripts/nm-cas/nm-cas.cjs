#!/usr/bin/env node
// AUG-1354 (AUG-1214 v3.2-6): content-addressed node_modules pilot.
// One node_modules per lockfile+platform+runtime identity, hardlinked into checkouts.
// npm stays the source of truth (no pnpm lockfile, no packageManager pin). Never deletes.
//   node nm-cas.cjs key     <projectDir>
//   node nm-cas.cjs ensure  <projectDir> <storeRoot>        (npm ci once per key)
//   node nm-cas.cjs link    <projectDir> <storeRoot> <destDir>
//   node nm-cas.cjs measure <dir>...                         (unique (dev,inode) accounting)
// Booked saving is 0 until `measure` shows a net physical reclaim (v3.2 §3).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const MARKER = '.nm-cas-complete';

function identity(projectDir, env = process) {
  const lock = fs.readFileSync(path.join(projectDir, 'package-lock.json'));
  return { lockSha: crypto.createHash('sha256').update(lock).digest('hex'), platform: env.platform, arch: env.arch, node: env.version };
}
function cacheKey(projectDir, env = process) {
  const id = identity(projectDir, env);
  return crypto.createHash('sha256').update(`${id.lockSha}|${id.platform}|${id.arch}|${id.node}`).digest('hex').slice(0, 24);
}
const abs = (p, what) => { if (!p || !path.isAbsolute(p)) throw new Error(`${what} must be an absolute path`); return p; };

function ensure(projectDir, storeRoot, install) {
  abs(projectDir, 'projectDir'); abs(storeRoot, 'storeRoot');
  const key = cacheKey(projectDir);
  const entry = path.join(storeRoot, key);
  const nm = path.join(entry, 'node_modules');
  if (fs.existsSync(path.join(nm, MARKER))) return { key, entry, built: false };
  if (fs.existsSync(entry)) throw new Error(`incomplete store entry ${entry}; refusing to overwrite (remove it by hand)`);
  const tmp = `${entry}.tmp-${process.pid}`;
  fs.mkdirSync(tmp, { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(projectDir, f), path.join(tmp, f));
  const run = install || ((cwd) => spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd, stdio: 'inherit' }));
  const res = run(tmp);
  if (res && res.status !== 0) throw new Error(`install failed (status ${res.status}); partial tree left at ${tmp}`);
  fs.mkdirSync(path.join(tmp, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'node_modules', MARKER), key + '\n');
  fs.renameSync(tmp, entry);
  return { key, entry, built: true };
}

function hardlinkTree(src, dst) {
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) { fs.symlinkSync(fs.readlinkSync(src), dst); return 0; }
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { mode: st.mode & 0o7777 });
    let n = 0;
    for (const e of fs.readdirSync(src)) n += hardlinkTree(path.join(src, e), path.join(dst, e));
    return n;
  }
  fs.linkSync(src, dst);
  return 1;
}

function link(projectDir, storeRoot, destDir) {
  abs(destDir, 'destDir');
  const { key, entry } = ensure(projectDir, storeRoot, () => { throw new Error('store entry missing; run ensure first'); });
  const src = path.join(entry, 'node_modules');
  const dst = path.join(destDir, 'node_modules');
  if (fs.existsSync(dst) || isLink(dst)) throw new Error(`refusing to reuse ${dst}`);
  fs.mkdirSync(destDir, { recursive: true });
  if (fs.statSync(src).dev !== fs.statSync(destDir).dev) throw new Error('store and destination are on different filesystems; hardlinks impossible');
  const files = hardlinkTree(src, dst);
  return { key, files, dst };
}
function isLink(p) { try { fs.lstatSync(p); return true; } catch { return false; } }

function measure(dirs) {
  const seen = new Set();
  let entries = 0;
  const walk = (p) => {
    const st = fs.lstatSync(p);
    entries++;
    seen.add(`${st.dev}:${st.ino}`);
    if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e));
  };
  dirs.forEach(walk);
  return { entries, uniqueInodes: seen.size };
}

function main(argv) {
  const [cmd, ...a] = argv;
  if (cmd === 'key') return console.log(cacheKey(abs(a[0], 'projectDir')));
  if (cmd === 'ensure') return console.log(JSON.stringify(ensure(a[0], a[1])));
  if (cmd === 'link') return console.log(JSON.stringify(link(a[0], a[1], a[2])));
  if (cmd === 'measure') {
    const m = measure(a.map((d) => abs(d, 'dir')));
    return console.log(JSON.stringify({ ...m, savedInodes: m.entries - m.uniqueInodes, booked: 0, note: 'booked stays 0 until whole-store before/after accounting proves net reclaim' }));
  }
  console.error('usage: nm-cas.cjs key|ensure|link|measure ...');
  process.exit(64);
}
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error(`nm-cas: ${e.message}`); process.exit(1); } }
module.exports = { cacheKey, ensure, link, measure, hardlinkTree };
