#!/usr/bin/env node
// Builds one folder for snapscore.autumn8.me: the static site (home, terms,
// privacy, support) unchanged, plus the web app for guests who join, score and
// watch a round without installing the app.
//
//   node scripts/build-web-site.cjs            # export the web app, then compose dist-site/
//   node scripts/build-web-site.cjs --from DIR # compose from an existing web export
//
// The app shell is published as app.html and only the listed app routes are
// rewritten to it. There is no catch-all, so a static page can never be
// replaced by the app. This script uploads nothing.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** Paths the web app answers. Everything else belongs to the static site. */
const APP_ROUTES = ['/join/*', '/p/*', '/r/*'];
const APP_SHELL = 'app.html';
/** Build variables the web app needs. Values come from the environment, never from this file. */
const REQUIRED_ENV = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];

function compose(exportDir, siteDir, outDir) {
  for (const file of ['index.html', '_expo']) {
    if (!fs.existsSync(path.join(exportDir, file))) throw Error(`web export is missing ${file}: ${exportDir}`);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(siteDir, outDir, { recursive: true });
  for (const entry of fs.readdirSync(exportDir)) {
    if (entry === 'index.html' || entry === 'metadata.json') continue;
    const target = path.join(outDir, entry);
    // The static site wins: an app file may never replace a site file.
    if (fs.existsSync(target)) throw Error(`web export would overwrite site file: ${entry}`);
    fs.cpSync(path.join(exportDir, entry), target, { recursive: true });
  }
  fs.copyFileSync(path.join(exportDir, 'index.html'), path.join(outDir, APP_SHELL));
  // Target has no ".html": Cloudflare Pages serves app.html at /app.
  const shellPath = `/${APP_SHELL.replace(/\.html$/, '')}`;
  fs.writeFileSync(path.join(outDir, '_redirects'), APP_ROUTES.map(route => `${route} ${shellPath} 200`).join('\n') + '\n');
  return { outDir, routes: APP_ROUTES, shell: APP_SHELL };
}

function main(argv) {
  const root = path.resolve(__dirname, '..');
  const from = argv.includes('--from') ? path.resolve(argv[argv.indexOf('--from') + 1]) : null;
  const exportDir = from ?? path.join(root, 'dist-web-site-export');
  if (!from) {
    const missing = REQUIRED_ENV.filter(name => !process.env[name]);
    if (missing.length) { console.error(`Missing build variables: ${missing.join(', ')}`); process.exit(2); }
    fs.rmSync(exportDir, { recursive: true, force: true });
    // The public site only opens the guest pages; the rest of the app stays in the app.
    // --clear: a reused cache keeps old build variables and ships a dead backend address.
    const run = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', exportDir], { cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1', EXPO_PUBLIC_WEB_GUEST_ONLY: 'true' } });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
  const result = compose(exportDir, path.join(root, 'site'), path.join(root, 'dist-site'));
  console.log(`Composed ${result.outDir}: site pages kept, app at ${result.routes.join(' ')}`);
}

module.exports = { compose, APP_ROUTES, APP_SHELL, REQUIRED_ENV };
if (require.main === module) main(process.argv.slice(2));
