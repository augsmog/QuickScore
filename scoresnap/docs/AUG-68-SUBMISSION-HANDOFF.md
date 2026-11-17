# AUG-68: attach the 4 subscriptions and submit 1.0 (owner handoff)

Claude cannot do this: it needs App Store Connect login and an App Review submission (out of lane). The offline preflight `tests/aug-68-subscription-submission-preflight.test.cjs` pins what ASC must contain.

## Products (one subscription group, TD level 1, Pro level 2)
| Product id | Period | Price |
|---|---|---|
| snapscore.td.annual | 1 year | 79.99 |
| snapscore.td.monthly | 1 month | 12.99 |
| snapscore.pro.annual | 1 year | 24.99 |
| snapscore.pro.monthly | 1 month | 3.99 |

## Flag for the owner
The shipping StoreKit catalog (`e2e/storekit/SnapScore.storekit`) is TD-only; Pro is behind the reversible `pro_enabled` flag (default OFF). If 1.0 ships with Pro off, decide whether to attach all 4 anyway. Apple needs every attached subscription to be in a submittable state (metadata, screenshot, price).

## Steps (owner, in ASC)
1. Confirm all 4 products show "Ready to Submit" (localization, review screenshot, price).
2. App Store tab, version 1.0, In-App Purchases and Subscriptions: add the 4 subscriptions.
3. Confirm the paywall shows Terms/Privacy links and trial/renewal disclosures.
4. Submit for Review.
