# StoreKit proof (Tier 2, $0)

Cut: `cuts/2026-11-03-e2e-tiered-cost.md` (AugieOS). Workflow: `.github/workflows/ios-storekit.yml`.

The workflow runs a clean `expo prebuild` on a GitHub-hosted macOS runner, which is free on this public repo. `add_test_target.rb` then injects a hosted unit-test target with `SnapScore.storekit`, and `xcodebuild test` runs on a simulator.

The shipping `SnapScore.storekit` is the flag-off catalog and contains only Tournament Director (TD) annual ($79.99) and monthly ($12.99) auto-renewables. The separate `SnapScore.pro-enabled.storekit` fixture preserves all four products for a future flag-on run. Use `node e2e/storekit/check_catalog.js` for the shipping catalog, or add `--pro-enabled` to validate the four-product fixture. Flag-on also requires the Pro products to be re-added in App Store Connect before that fixture can represent a live catalog.

What it proves: the local shipping StoreKit catalog loads in the prebuilt app. That covers 2 TD auto-renewables in one group, their prices, and the 7-day free trial on the annual product only. It also proves deterministic trial eligibility (eligible, then ineligible after a purchase, then eligible again after clearing history) and that unknown product IDs return nothing.

What it does not prove: RevenueCat offerings, server-side eligibility, a live sandbox price, or the App Store-signed binary. Those stay separate steps (Tier 3 / later). The shipping catalog mirrors the TD rows of `PLAN_OPTIONS` in `src/services/paywall-plans.ts`; Pro rows remain dormant in app code. If TD prices or IDs change, update the shipping fixture.

No secrets are used. Nothing here changes `app.json` or any EAS/TestFlight/App Store build.
