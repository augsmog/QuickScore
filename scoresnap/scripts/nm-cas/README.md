# Content-addressed node_modules pilot (AUG-1354, AUG-1214 v3.2-6)

One `node_modules` per lockfile + platform + arch + Node version, hardlinked into each
checkout, instead of one full install per job. npm remains the only source of truth: no
pnpm lockfile, no `packageManager` pin, no CI or EAS change. Complements the pnpm pilot
in `../inode-pnpm-pilot` (npm-shared-cache fallback until that is green).

    node scripts/nm-cas/nm-cas.cjs ensure  "$PWD" /abs/store     # npm ci --ignore-scripts, once per key
    node scripts/nm-cas/nm-cas.cjs link    "$PWD" /abs/store /abs/checkout
    node scripts/nm-cas/nm-cas.cjs measure /abs/a/node_modules /abs/b/node_modules

Safety: absolute paths only; store and checkout must share a filesystem; failed installs
are never published; the tool never deletes anything; linked trees are read-only by
convention (a postinstall that rewrites files would edit the shared copy, hence
`--ignore-scripts`).

Accounting: per v3.2 §3 the booked reclaim is **0** until `measure` before/after on the
whole store shows net physical reclaim (unique `(dev,inode)` pairs).

Rollback: revert the PR; nothing else reads this directory.
