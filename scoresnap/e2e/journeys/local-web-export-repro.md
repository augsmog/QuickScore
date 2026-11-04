# Local web export worktree reproduction

Base: `origin/main` at `96a947212a582e096cb6b23d335c1e80a723a326`. A fresh detached worktree used the lane's shared, lockfile-matched `scoresnap/node_modules` symlink.

From cwd `/workspace/aos-work/lanes/ss-ready/aug455-repro/scoresnap`, the lane-style command

```sh
npx --no-install expo export --platform web --output-dir dist-web-repro --clear
```

failed during Metro bundling with `Unable to resolve module expo-router ... expo-router could not be found within the project or in these directories: ../../../../../../node_modules` (imported by `app/(tabs)/_layout.tsx`). The worktree's Metro config already provides the supported `SNAPSCORE_NIGHTLY_NODE_MODULES` opt-in, but lane commands did not set it. The root cause is that Metro was not given the real path of the shared symlinked dependency tree in `watchFolders` and `resolver.nodeModulesPaths`, so package discovery from a lane worktree failed.

`scripts/local-web-export.sh` now supplies that existing opt-in from the real path of the worktree's own `node_modules` link and calls the installed Expo CLI directly. In a clean worktree at the candidate SHA, the helper must produce an `index.html` and pass the documented localhost Chromium smoke.

Related context: the earlier AUG-313 report at `/workspace/aos-work/lanes/ss-ready/aug455/evidence-aug313-group4-profiles/local-route-error.txt` recorded a later `No routes found` page error after export. On the current base, the fresh reproduction above failed earlier at dependency resolution; with the canonical resolver enabled, loading `/` renders the SnapScore shell without page errors. The helper acceptance smoke is scoped to `/` as specified by AUG-455.
