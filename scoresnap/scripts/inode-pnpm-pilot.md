# Shared-store pilot

The pilot pins pnpm 10.34.6 and an imported lockfile. The hoisted layout retains
Expo/Metro compatibility and imports packages by hardlink. Run the script with
absolute `AOS_PNPM_STORE` and `AOS_PILOT_OUTPUT` paths on the checkout's filesystem.
Share the store between disposable run copies; give each run its own output path.
The script refuses inode usage >=78%, checks device identity and imported link
counts, loads the Linux native resolver and esbuild, runs Jest and exports iOS JS.
The manual workflow reproduces these checks; it has not been dispatched here.

This does not prove native iOS compilation. Xcode/CocoaPods and an authorized
macOS runner remain required for that proof. pnpm's default lifecycle-script
restrictions remain in force; no broad build-script permission is granted.
The established npm CI jobs are retained during the pilot. No existing dependency
tree is removed. Rollback is a PR revert of these pilot files and packageManager.
