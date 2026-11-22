#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${AOS_PNPM_STORE:?Set an absolute same-filesystem shared store path}"
: "${AOS_PILOT_OUTPUT:?Set an absolute path for disposable output for this run}"
python3 - <<'PY'
import os
from pathlib import Path
store=Path(os.environ['AOS_PNPM_STORE'])
output=Path(os.environ['AOS_PILOT_OUTPUT'])
assert store.is_absolute() and output.is_absolute()
s=os.statvfs('/'); assert 1-s.f_ffree/s.f_files < .78, 'inode capacity >=78%'
store.mkdir(parents=True,exist_ok=True)
assert store.stat().st_dev == Path.cwd().stat().st_dev, 'hardlinks require same filesystem'
output.mkdir(parents=True,exist_ok=True)
PY
[[ "$(pnpm --version)" == 10.34.6 ]]
pnpm install --frozen-lockfile --store-dir="$AOS_PNPM_STORE"
node - <<'JS'
const fs = require('node:fs');
const path = require('node:path');
let linked = 0;
function scan(dir) {
  for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) scan(p);
    else if (item.isFile() && fs.statSync(p).nlink > 1) linked++;
  }
}
scan('node_modules');
if (!linked) throw new Error('No imported hardlinks found');
const resolver = require('unrs-resolver');
if (typeof resolver.ResolverFactory !== 'function') throw new Error('Native resolver missing');
require('esbuild').transformSync('const nativeProbe = 1');
fs.writeFileSync(path.join(process.env.AOS_PILOT_OUTPUT, 'native-hardlinks.json'), JSON.stringify({linked, nativeResolver:true, esbuild:true}));
JS
pnpm exec jest --runInBand
python3 - <<'PY'
import os
s=os.statvfs('/'); assert 1-s.f_ffree/s.f_files < .78, 'inode capacity >=78%'
PY
pnpm exec expo export --platform ios --no-bytecode --output-dir="$AOS_PILOT_OUTPUT/ios"
