// snapscore.autumn8.me/terms, /privacy and /support are in the App Store listing.
// Adding the web app to the same site must never change or shadow them.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compose } = require('../scripts/build-web-site.cjs');

const site = path.resolve(__dirname, '../site');
function fakeExport(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-export-'));
  fs.mkdirSync(path.join(dir, '_expo/static/js/web'), { recursive: true });
  fs.writeFileSync(path.join(dir, '_expo/static/js/web/entry.js'), '// app');
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>APP SHELL</html>');
  fs.writeFileSync(path.join(dir, 'favicon.ico'), 'ico');
  fs.writeFileSync(path.join(dir, 'metadata.json'), '{}');
  for (const [name, body] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}
const out = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'web-site-')), 'dist-site');

test('site pages are byte-identical and the app shell never becomes the home page', () => {
  const dir = out();
  compose(fakeExport(), site, dir);
  for (const page of ['index.html', 'terms/index.html', 'privacy/index.html', 'support/index.html', 'robots.txt', 'sitemap.xml', '_headers']) {
    expect(fs.readFileSync(path.join(dir, page))).toEqual(fs.readFileSync(path.join(site, page)));
  }
  expect(fs.readFileSync(path.join(dir, 'app.html'), 'utf8')).toContain('APP SHELL');
  expect(fs.existsSync(path.join(dir, '_expo/static/js/web/entry.js'))).toBe(true);
  expect(fs.existsSync(path.join(dir, 'metadata.json'))).toBe(false);
});

test('only the app routes are rewritten; there is no catch-all', () => {
  const dir = out();
  compose(fakeExport(), site, dir);
  const rules = fs.readFileSync(path.join(dir, '_redirects'), 'utf8').trim().split('\n');
  expect(rules).toEqual(['/join/* /app 200', '/p/* /app 200', '/r/* /app 200']);
  expect(rules.some(rule => /^\/\*|^\/(terms|privacy|support)/.test(rule))).toBe(false);
});

test('an app file that would replace a site file stops the build', () => {
  expect(() => compose(fakeExport({ 'robots.txt': 'app robots' }), site, out())).toThrow('would overwrite site file: robots.txt');
});
