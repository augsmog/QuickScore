const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

function jsBundleText(directory) {
  const absolute = path.join(root, directory);
  assert.ok(fs.existsSync(absolute), `missing export directory: ${directory}`);
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fs.readFileSync(filename, 'utf8'));
    }
  }
  visit(absolute);
  assert.ok(files.length > 0, `no JavaScript bundles in ${directory}`);
  return files.join('\n');
}

function compiledFlagInput(bundle) {
  // Expo's release bundle keeps the exported PRO_ENABLED module and inlines
  // the public env var into the String(...) operand used to compute it.
  const exportAt = bundle.indexOf('"PRO_ENABLED"');
  assert.notEqual(exportAt, -1, 'bundle must include the exported PRO_ENABLED module');
  const module = bundle.slice(exportAt, exportAt + 900);
  const match = module.match(/String\(["'](true|false)["']\)\.toLowerCase\(\)/);
  return match?.[1] ?? null;
}

test('web exports bake opposite Pro flag values into their bundles', () => {
  const off = jsBundleText('dist-web-pro-off');
  const on = jsBundleText('dist-web-pro-on');
  assert.equal(compiledFlagInput(off), 'false', 'flag-off bundle must bake false and must not bake true');
  assert.equal(compiledFlagInput(on), 'true', 'flag-on bundle must bake true and must not bake false');
});

test('workflow keeps exports, output directories, and Metro caches isolated', () => {
  const workflow = fs.readFileSync(path.resolve(root, '../.github/workflows/web-smoke.yml'), 'utf8');
  assert.match(workflow, /EXPO_PUBLIC_PRO_ENABLED=false EXPO_PUBLIC_OFFLINE_MODE=true TMPDIR=.*metro-cache-pro-off[\s\S]*?--output-dir dist-web-pro-off --clear/);
  assert.match(workflow, /EXPO_PUBLIC_PRO_ENABLED=true EXPO_PUBLIC_OFFLINE_MODE=true TMPDIR=.*metro-cache-pro-on[\s\S]*?--output-dir dist-web-pro-on --clear/);
  assert.match(workflow, /node --test scripts\/ci\/pro-flag-web-export\.cjs/);
});
