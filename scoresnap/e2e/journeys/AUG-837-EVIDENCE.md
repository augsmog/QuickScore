# AUG-837 (AUG-817d) acceptance evidence, read-only check of main 9372010

| AC | Where | Status |
|---|---|---|
| Journey `pro-off-free.mjs` (fresh context, single-group Skins round, Settlement tab click, Statistics, no paywall/upsell text, amount renders) | `scoresnap/e2e/journeys/pro-off-free.mjs` | Present (landed via AUG-852, PR #193 `0f43e5a`) |
| Negative proof: same journey on flag-ON build fails at first gate | `web-smoke.yml` step "Pro flag-off Playwright journey and flag-on negative proof" (asserts nonzero exit + `FIRST_PRO_GATE`); run 42934975243 artifact `pro-on-negative-journey-42934975243-1` | Present |
| CI leg builds `EXPO_PUBLIC_PRO_ENABLED=false` offline export, ubuntu-latest | `web-smoke.yml` build-standard, step "Export Pro flag off and on..." | Present (in build-standard, not a separate job) |
| Registration | `ci-registration.test.mjs` asserts exports, journey step, artifacts, mutation cases | Present, passes |
| CI green | run 42934975243 at `299ba06`: build-standard, browser-flows, browser-matrix, web-smoke all success | Verified |

Deviations: no separate job (leg lives in build-standard); no explicit assertion for free-scan cap text on the home screen, only settlement/statistics text. Neither blocks the intent.
