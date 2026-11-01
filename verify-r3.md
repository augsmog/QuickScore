# FAIL — SnapScore test program phase 1, verifier round 3 (final)

Independent review of `testprog/snapscore-journeys-20261031`, HEAD `6504d358e9b46bc907b1fa6f39c05f11731d7921`, against the binding pressure-test edits in the phase-1 cut. PR: https://github.com/augsmog/QuickScore/pull/84. Round 2 failed because a clipped or transparent-filled core label still passed reachability (`runner.mjs` at that head). This round re-ran those probes and the round-1 probes, then tried further ways to hide the `New Contest` label while keeping its accessible name and button box.

The round-2 false greens are closed. A patterned cover over the same label is still a false green. Branch protection on `main` stays outside phase 1 and is not a blocker.

Reviewed HEAD matches the CI head below. Local `origin/main` after fetch is `7d3b66fae81d529dcb08f21032666c7d2facbc5c`. Merge-base with this branch is still `bce5673993b90720657af6a400a385c27cdf574c`.

## Blocking defects

1. **P1 — An opaque patterned cover over a core label still passes reachability.** `scoresnap/e2e/journeys/runner.mjs:142`. The screenshot gate is the whole of `runner.mjs:139-142`. Related: hit-testing at `runner.mjs:77`, and text paint at `runner.mjs:90-101`.
   - **Cause:** After geometry, opacity, and computed-color checks, the runner screenshots the text-range box and accepts it when `pngTextureStats` reports at least 2 luminance clusters, a max−min of at least 24, and a standard deviation of at least 6 (`runner.mjs:45-47` and `:142`). That is a texture test. It does not require the glyphs for `visibleText` (`New Contest`). A sibling or `::after` painted on top of the label leaves the text-range rectangle, the accessible name, and the button rectangle unchanged. `elementFromPoint` skips `pointer-events: none`, and a child of the button still satisfies `el.contains(hit)`, so the cover is not `control-occluded`. `::after` is not a separate element. A flat cover happens to fail the texture thresholds. A cover with its own contrast meets them.
   - **Repro:** Copy `scoresnap/e2e/journeys` outside the repo, symlink `node_modules` and `e2e/shared`, and inject the following into setup for `J-home-create-cancel` after the home screen is ready (the text node whose content is `New Contest` inside `[data-testid="home-new-contest"]`). Serve the sharing export at `http://127.0.0.1:8192` and run `JOURNEYS=J-home-create-cancel`.

     Opaque striped sibling:

     ```javascript
     const parent = target.parentElement;
     parent.style.position = 'relative';
     parent.style.display = 'inline-block';
     const cover = document.createElement('span');
     cover.setAttribute('aria-hidden', 'true');
     cover.style.position = 'absolute';
     cover.style.inset = '0';
     cover.style.pointerEvents = 'none';
     cover.style.zIndex = '5';
     cover.style.background = 'repeating-linear-gradient(90deg, rgb(0,0,0) 0 2px, rgb(255,255,255) 2px 4px)';
     parent.append(cover);
     ```

     Same paint as a generated box on the label element:

     ```javascript
     const parent = target.parentElement;
     parent.style.position = 'relative';
     parent.style.display = 'inline-block';
     const css = document.createElement('style');
     css.textContent = '[data-verifier-cover]::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg, rgb(0,0,0) 0 2px, rgb(255,255,255) 2px 4px);pointer-events:none;z-index:5;}';
     document.head.append(css);
     parent.setAttribute('data-verifier-cover', '');
     ```

   - **Observed:** Both runner invocations exit **0**. Journey, gate, and create-feature reachability are **passed**. Button rectangle is `{x:20,y:166,width:350,height:52}`. The exact accessible name `New Contest` still resolves (a rename fails with `accessible-name-mismatch` in the negative proofs). The entry screenshots show the plus icon and a black/white stripe block in place of the words. The same solid cover (`background: rgb(23, 92, 58)`) exits 1 with `visible-text-missing`, and that entry screenshot is a blank green button with only the plus icon. The stripe case is visible to a person and to any check that asks whether those pixels are the label (OCR, or a second screenshot after forcing the text fill to transparent). It is a detectable miss, so it stays blocking.
   - **Evidence:** `/tmp/verify-r3-evidence/new-visibility/results.json` plus `striped-overlay/` and `pseudo-after-stripes/` (`command.log`, `journeys-results.json`, `J-home-create-cancel/01-entry.png`). The `::after` result was printed after `results.json` was written; its directory holds the same files.
   - **Fix:** Treat luminance variance as insufficient. After the text-range clip is known, screenshot it, force that text node's parent `color` and `-webkit-text-fill-color` to `transparent` and `text-shadow` to `none`, screenshot the same clip, and restore those properties in a `finally`. Fail with `visible-text-missing` unless the glyphs change the image (a real `New Contest` label does; a cover that hides the glyphs does not). Keep the geometry, opacity, and fill checks. Add negative proofs for the striped sibling and the `::after` cover; both must exit 1 with `visible-text-missing`. Keep the flat overlay, the round-1/2 visibility proofs, and the unmutated journey green/red as they are today.

`textContrasts` composites `background-color` only (`runner.mjs:96-101`). On this button the green is a `background-image` gradient (`#175C3A` to `#175C3A`) and ancestor `background-color` stays transparent until the cream page. Painting the label `rgb(23, 92, 58)` still went red, because the flat pixel check fired. That path is not a second false green on this screen. The stripe cover is the one that gets through.

## Round 2 and round 1 rechecks

Copied harnesses lived under `/tmp/verify-r3-evidence`. Older evidence was not in this workspace. Every previously green visibility mutation is now red with signature `visible-text-missing`.

| Probe | Exit | Signature / errors |
| --- | --- | --- |
| `text-fill-transparent` (`-webkit-text-fill-color: transparent`) | 1 | `visible-text-missing` |
| `label-clipped` (`clip-path: inset(50%)` wrapper) | 1 | `visible-text-missing` |
| `label-overflow-clipped` (`height:0; overflow:hidden` wrapper) | 1 | `visible-text-missing` |
| `invisible-core-text` (opacity-0 wrapper) | 1 | `visible-text-missing` |
| `transparent-core-text` (`color: transparent`) | 1 | `visible-text-missing` |
| `missing-step-screenshots` (drop `create`, `edit`, `cancel-home`) | 1 | missing those three step captures; entry screenshot does not satisfy them |

## New hide attempts

Injected the same way, against the same server, for `J-home-create-cancel`. Flat or fully removed text went red. Patterned covers stayed green (defect 1).

| Probe | What changed | Exit | Result |
| --- | --- | --- | --- |
| `font-size-0` | `font-size: 0` on the label element | 1 | `visible-text-missing` |
| `color-equals-visual-bg` | `color: rgb(23, 92, 58)` | 1 | `visible-text-missing` |
| `text-indent-9999` | `text-indent: -9999px` | 1 | `visible-text-missing` |
| `scale-0` | `transform: scale(0)` on a span around the text | 1 | `visible-text-missing` |
| `opaque-overlay` | solid `rgb(23, 92, 58)` sibling, `pointer-events: none`, inset 0 | 1 | `visible-text-missing` |
| `filter-opacity-0` | `filter: opacity(0)` on the label element | 1 | `visible-text-missing` |
| `clip-circle-0` | `clip-path: circle(0px at 50% 50%)` | 1 | `visible-text-missing` |
| `mask-transparent` | `-webkit-mask-image` fully transparent | 1 | `visible-text-missing` |
| `text-fill-equals-visual-bg` | `-webkit-text-fill-color: rgb(23, 92, 58)` with white `color` | 1 | `visible-text-missing` |
| `striped-overlay` | opaque black/white striped sibling | 0 | gate passed |
| `pseudo-after-stripes` | same stripes on `::after` | 0 | gate passed |

`clip-path` geometry only parses `inset()` (`runner.mjs:118-122`). `circle(0)` was still red here because the button fill is flat and the texture check rejected it. On a textured control that gap would depend on defect 1's heuristic.

## Independently executed checks

| Check | Observed result |
| --- | --- |
| `git diff origin/main --stat` | Two-dot against fetched `origin/main` `7d3b66f`: **110 files, 2066 insertions, 29492 deletions**. The branch does not contain main's commits after merge-base `bce5673`, so this stat mixes those main-only edits in. `git diff --check origin/main HEAD` passed. |
| Scope of this branch's own patch (`origin/main...HEAD`) | **12 files, 1487 insertions.** Eleven under `scoresnap/e2e/journeys/`, plus the journey step and its upload in `.github/workflows/web-smoke.yml`. No app, dependency, lockfile, schedule, GS-13, GS-16, or native edits in that patch. |
| Working tree | No tracked edits. Builder-reported `_*.mjs` scratch files are not in this checkout. Nightly created untracked `/workspace/aos-state/` (lock and a main checkout). It is not part of this report commit. |
| `node --test e2e/journeys/metrics.test.mjs` | 36 passed, 0 failed, 0 skipped. |
| `node --test e2e/usability-gate.test.mjs` | 9 passed, 0 failed, 0 skipped. |
| Full runner on `http://127.0.0.1:8192` | Exit 0. 4 passed, 1 strict expected failure. Wall **9.056 s**, runner-reported **8714 ms**. SHA `6504d358e9b46bc907b1fa6f39c05f11731d7921`. One attempt each. 20 PNGs, all 390×844. |
| `negative-proof.mjs` | Exit 0. hide, rename, disable, hide-label, transparent-label, label-overflow-clipped, label-clip-path, and text-fill-transparent each exit 1 with the signature the script expects. |
| Activation budget 2 → 1 | Exit 1, `activation budget exceeded`. |
| Known-issue signature → `wrong-signature` | Exit 1. `unknown xfail assertion signature` and `xfail signature mismatch: finalize confirm dialog not rendered`. |
| Feature reachability signature → `wrong-signature` | Exit 1. Live failure remains `no-accessible-name`; result includes `score-Augie: xfail signature mismatch`. |
| Missing journey | Exit 1 at startup. Adapter/manifest inventory mismatch; gate reports a missing required journey. |
| Skipped journey | Exit 1, `non-executable journey status`. |
| Missing outcome assertion | Exit 1, `missing assertion: outcome`. |
| Unrelated xfail error | Exit 1, `xfail signature mismatch: unclassified`. |
| Unexpected xfail pass | Exit 1, `unexpected pass: remove marker`. Also `missing step capture: failed` because `J-finalize-settle.requiredSteps` includes the failure screenshot named `failed`. |
| Known issue dated 2026-10-01 | Exit 1, `stale known issue; explicit renewal required`. |
| Nine / ten 1 ms baseline samples | Nine: exit 0. Ten: exit 1, `time baseline regression >50%`. |
| YAML / JSON load and `git diff --check` | `yaml.safe_load` of `journeys.json` returned 13 journeys. JSON load succeeded. Both two-dot and three-dot `git diff --check` passed. |
| `bash -n e2e/journeys/nightly.sh` | Pass. |
| `RUN_ROOT=/tmp/tp-verify3 NODE_MODULES_SRC=<this checkout's node_modules> bash e2e/journeys/nightly.sh` | Exit 0. Summary `/tmp/tp-verify3/2026-10-31/summary.md`. UTC date was 2026-11-01; the summary date is the Los Angeles date 2026-10-31. Main SHA `7d3b66fae81d529dcb08f21032666c7d2facbc5c`, harness SHA `6504d358e9b46bc907b1fa6f39c05f11731d7921`. 5/5 accepted, runner 8859 ms, all eight negative proofs passed. Port 8193 was closed afterward. The pre-existing server on 8192 was left up. |
| Secret scan | Regex over `git diff origin/main...HEAD` for AWS access keys, private-key blocks, `sk_live_`, `ghp_`, Slack tokens, and JWTs: 0 hits. Journey sources have no credential logging. |

Nightly source (`nightly.sh`) still has the fixed flock, a 20-minute `timeout` with a kill fallback, EXIT/TERM/INT cleanup, last-14-date retention, and a >36-hour stale-run warning that forces a nonzero exit. This run did not age directories or hold the timeout open. The script's own git fetch/checkout of `origin/main` ran; it did not `npm install`. This VM had no `node_modules`, so `npm ci` in `scoresnap` was run once and passed in as `NODE_MODULES_SRC`. Browser binary: system Chrome 156.0.8078.47 via `CHROMIUM_PATH` (Playwright 1.64.1). `npx playwright install` was not run. `/usr/bin/time` is absent; the full-runner wall clock is from Python's monotonic timer.

Local full web-smoke (Jest, browser matrix, scorecard render) was not re-executed. The current-head Actions run below completed that job. The journey-screens artifact bytes were not re-downloaded; step durations are the job timestamps.

`web-smoke.yml:73` gives the journey step `timeout-minutes: 2` and `:78` gives the upload `timeout-minutes: 1` (180 seconds allocated). Upload is `if: always()`.

## Current-head CI

[Web smoke run 41267060904](https://github.com/augsmog/QuickScore/actions/runs/41267060904), event `pull_request`, conclusion **success**, head `6504d358e9b46bc907b1fa6f39c05f11731d7921`.

| Step | Start | End | Duration |
| --- | --- | --- | --- |
| Journey budgets and reachability | 2026-11-01T03:03:09Z | 2026-11-01T03:03:20Z | 11 s |
| Upload journey screenshots | 2026-11-01T03:03:20Z | 2026-11-01T03:03:22Z | 2 s |
| Combined | | | **13 s** (limit 180 s) |

The whole `web-smoke` job succeeded (02:55:41Z–03:10:20Z), including the browser matrix after the journey steps.

No implementation edits, PR comments, merges, or pushes to `testprog/snapscore-journeys-20261031`.

Review completed 2026-11-01T05:10:10Z. One blocking defect.

CI_HEAD_SHA: 6504d358e9b46bc907b1fa6f39c05f11731d7921 CI_CONCLUSION: success
VERDICT: FAIL
