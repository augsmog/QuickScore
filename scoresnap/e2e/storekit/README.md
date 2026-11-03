# StoreKit proof (Tier 2, $0)

Cut: `cuts/2026-11-03-e2e-tiered-cost.md` (AugieOS). Workflow: `.github/workflows/ios-storekit.yml`.

The workflow runs a clean `expo prebuild` on a GitHub-hosted macOS runner, which is free on this public repo. `add_test_target.rb` then injects a hosted unit-test target with `SnapScore.storekit`, and `xcodebuild test` runs on a simulator.

What it proves: the local StoreKit catalog loads in the prebuilt app. That covers 4 auto-renewables in one group, the catalog prices, and 7-day free trials on the annuals only. It also proves deterministic trial eligibility (eligible, then ineligible after a purchase, then eligible again after clearing history) and that unknown product IDs return nothing.

What it does not prove: RevenueCat offerings, server-side eligibility, a live sandbox price, or the App Store-signed binary. Those stay separate steps (Tier 3 / later). The catalog mirrors `src/services/purchases.ts`. If the prices or IDs change there, update `SnapScore.storekit`.

No secrets are used. Nothing here changes `app.json` or any EAS/TestFlight/App Store build.
