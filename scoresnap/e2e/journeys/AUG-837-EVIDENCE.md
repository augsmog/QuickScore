# AUG-837 (AUG-817d) acceptance evidence, read-only check of main 9372010

| AC | Where | Status |
|---|---|---|
| Journey `pro-off-free.mjs` (fresh context, single-group Skins round, Settlement tab click, Statistics, no paywall/upsell text, amount renders) | `scoresnap/e2e/journeys/pro-off-free.mjs` | Present (landed via AUG-852, PR #193 `0f43e5a`) |
| Negative proof: same journey on flag-ON build fails at first gate | `web-smoke.yml` step "Pro flag-off Playwright journey and flag-on negative proof" (asserts nonzero exit + `FIRST_PRO_GATE`); run 42934975243 artifact `pro-on-negative-journey-42934975243-1` | Present |
| CI leg builds `EXPO_PUBLIC_PRO_ENABLED=false` offline export, ubuntu-latest | `web-smoke.yml` build-standard, step "Export Pro flag off and on..." | Present (in build-standard, not a separate job) |
| Registration | `ci-registration.test.mjs` asserts exports, journey step, artifacts, mutation cases | Present, passes |
| CI green | run 42934975243 at `299ba06`: build-standard, browser-flows, browser-matrix, web-smoke all success | Verified |

Independent cross-company verifier (round 1, gpt-6.1-sol low) found 3 real coverage
gaps in the journey itself: Settlement text didn't exclude free-scan-cap wording,
the Profile `profile-plan-badge` element was never asserted absent (only matched
against literal text that never appears), and there was no explicit paywall-route
assertion at the Settlement/Profile checkpoints. Closed directly in
`pro-off-free.mjs` (test-only diff, same PR): added
`assert.notEqual(pathname, '/paywall')` after the Settlement and Profile tab
clicks, added `free cloud scans this month` to the Settlement text exclusion, and
added `assert.equal(count(profile-plan-badge), 0)` on the Profile screen.
Re-ran the full journey locally against fresh `expo export` builds for both
`EXPO_PUBLIC_PRO_ENABLED=false` (passes with the new assertions) and `=true`
(still fails fast at `FIRST_PRO_GATE skins-create`, exit 1) plus
`ci-registration.test.mjs` and `pro-enabled-shipping-config.node.cjs` (6/6 pass).

Deviations: no separate job (leg lives in build-standard); no explicit assertion
for free-scan cap text on the home screen (only settlement/statistics). Does not
block the intent.
