# Native E2E (Maestro, iOS simulator) — SnapScore

Bots own E2E. This folder follows the cross-product convention (aos-e2e/v1) so any repo can reuse it:

- `.maestro/e2e.config.json` — per-product config: appId, app dir, build profiles, fixtures, flow→ticket map, known blocks.
- `.maestro/flows/<build>/<ticket>-<slug>.yaml` — one flow per acceptance item. `<build>` is a key of `builds` in the config.
- `.maestro/subflows/` — shared steps (`runFlow`). `.maestro/fixtures/` — pre-launch state seeded by the runner.
- `.maestro/scripts/run-ios-sim.sh` — product-agnostic runner (reads the config; no product logic inside).
- `.github/workflows/e2e-ios-sim.yml` — runs the runner on a GitHub-hosted macOS runner ($0 for public repos).

## Flow rules
1. First comment line: `# <TICKET>: <acceptance sentence the flow proves>`.
2. Screenshots: `takeScreenshot: <ticket>-NN-<what>` (lower-case ticket). Every assertion the verifier relies on gets a screenshot right after it.
3. No credentials or secrets in flows. Use `${MAESTRO_*}` env names only; real values come from CI secrets (none used today).
4. No outbound sends. Share sheets may be opened and dismissed, never completed.
5. Live-data writes only when the config marks the flow `liveWrite` with the reason.

## Evidence contract (what a verifier reads)
The runner writes one directory per run, uploaded as the workflow artifact `e2e-<product>-<run-id>` and copied on the box to
`/workspace/aos-state/e2e/<product>/<run-id>/`:
```
manifest.json          build (url, sha256, arch from lipo), device, runtime, git sha, per-flow status/duration/screenshots
flows/<flow-id>/       *.png screenshots, maestro.log, junit.xml, (on failure) hierarchy.json + debug output
```
A ticket closes only when a separate verifier reads manifest.json + screenshots and checks each acceptance line.

## Run
GitHub → Actions → "E2E iOS simulator" → inputs: `app_url` (EAS simulator build artifact URL), `build` (online/offline), `flows` (comma list of flow ids or `all`).
Box fetch: `/workspace/aos-state/e2e/bin/fetch_gh_e2e.sh <repo> <gh-run-id> <product>`.
