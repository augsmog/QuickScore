# Inode plan phase C: shared-store pnpm pilot (AUG-227)

Goal: several disposable run copies of QuickScore share one content-addressed
pnpm store by hardlink, so each extra copy costs directories only, not a full
`node_modules` worth of file slots (inodes).

`run.sh` works only inside a fresh disposable copy under `AOS_PILOT_OUTPUT`:

1. Refuses relative paths, a reused output path, a store on another filesystem,
   inode use at or above the cap (78%), or any pnpm other than 10.34.6.
2. Copies tracked files, derives `pnpm-lock.yaml` from `package-lock.json`
   (`pnpm import`), then installs frozen with a hoisted layout and hardlinks.
3. Proves hardlinks exist, loads the native resolver and esbuild, runs Jest and
   exports the iOS JS bundle (`js` mode, Linux or macOS).
4. `native` mode (macOS): `expo prebuild`, `pod install`, and the same Release
   simulator `xcodebuild` as `.github/workflows/e2e-ios-sim.yml`.

    AOS_PNPM_STORE=/abs/store AOS_PILOT_OUTPUT=/abs/new-dir \
      AOS_PNPM_CMD="npx -y pnpm@10.34.6" bash scripts/inode-pnpm-pilot/run.sh native

What it does not do: it does not pin `packageManager`, does not add a pnpm
lockfile to the app root, does not change any npm CI job or EAS build, and does
not delete anything (the caller owns removal of the output path). pnpm's default
block on dependency lifecycle scripts stays on. Rollback: revert the PR.

Difference from draft PR #56: that draft commits `pnpm-lock.yaml` and a
`packageManager` pin in the app root, which is now 500+ commits stale and could
change which package manager other tools pick. This version keeps npm as the
only source of truth and produces the macOS native proof #56 was missing.

Guarded by `tests/inode-pnpm-pilot.test.cjs` (runs in the normal Jest suite).
