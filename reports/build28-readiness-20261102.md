# Build 28 readiness packet — AUG-68

Updated 2026-11-02 8:53 PM PT by Tater. This is a release handoff packet; it does not represent App Store Connect submission or acceptance.

## Build identity and upload trail

- **Reported Build 28 source:** QuickScore `8402b047b8cc6048b656d35b2abe1b17855f7f33` (`8402b04`, PR #93 merge). The current lane worktree is detached at this SHA.
- **Reported EAS build:** iOS `1.0.0 (28)`, `testflight` profile, `FINISHED`; build ID `f15e4cba-bbed-49bb-98cc-5ce482f651eb`: https://expo.dev/accounts/jones.augie1/projects/snapscore/builds/f15e4cba-bbed-49bb-98cc-5ce482f651eb
- **Reported EAS upload:** `FINISHED` to ASC app `6761034352`; submission ID `d0dd6a1a-65cc-43f2-a30d-f0b9eccf579a`: https://expo.dev/accounts/jones.augie1/projects/snapscore/submissions/d0dd6a1a-65cc-43f2-a30d-f0b9eccf579a
- Augie supplied a TestFlight email dated Nov 3 00:43:59 UTC saying version 1.0.0 (28) is available to test on iOS 16+. This verifies availability notice only. The EAS-reported source association has not been independently verified from ASC/EAS metadata in this run.
- No build, upload, ASC edit, product setting change, App Review submission, or external message was made in this run.

## Smoke evidence at `8402b04`

- Existing Tater record reports CI green at this SHA and full Jest pass: 89 suites / 1041 tests.
- Fresh targeted Jest run in this lane worktree: `tests/safe-sheets.test.cjs`, `tests/owner-device-restore.test.cjs`, `tests/settlement-integration.test.cjs`, `tests/tournament-sync.test.cjs` — **4 suites, 36 tests passed**.
- Attempted an offline web export with the required shared lockfile-matched `node_modules` symlink. Metro failed to resolve `expo-router` through the symlink. Node's own `require.resolve` does find the package. No dependency install or package-lock change was made. So no local browser journey or simulator result is claimed.
- Native device checks remain open: AUG-309 safe areas on a Dynamic Island device; demo sign-in and both code paths on Build 28; RevenueCat Pro Settle Up tap. The box has no iOS simulator/device.

## Read-only demo data check

Live Supabase project `pltgbizexllikiwryozm` was queried read-only on Nov 2. Both invite codes currently exist:

| Code | Stored contest data | Score data | Synchronized settings |
|---|---|---|---|
| `DGTWEW` | one round; four players | all four have score arrays, up to 18 holes | Stroke Play and Skins; $5 setting |
| `R63H7T` | tournament; two rounds; four players | all four have score arrays, up to 18 holes | Stroke Play and Skins; $5 setting |

The base `contests.games` field is empty on these rows, while the current snapshot fields `sync_games` and `sync_game_settings` contain the expected values. This is consistent with the current sync format, but only the app path can verify what Build 28 renders. This query does not validate a user's password/session or RevenueCat access. Prior AUG-294 comments record Pro and Tournament Director entitlement readback; a fresh native check is still outstanding.

## ASC attachment readback

Build 28 is already attached to version 1.0, confirmed by the Nov 2 read-only ASC GET documented below. This supersedes the earlier attach checklist and there is no remaining attach action. The version is still `PREPARE_FOR_SUBMISSION`. This packet does not verify the four subscription products or their review readiness; retain that as a separate read-only metadata gate. Do not change ASC metadata or submit from this lane.

## App Review notes candidate

This candidate follows the current “50+ game modes” rule and avoids the prohibited terms. The Oct 31 draft at `/workspace/aos-state/snapscore/review-notes-draft-20261031.md` is stale and must not be pasted: its wording and open claims do not satisfy the current release rules. The path labels below still need a Build 28 device check before use.

> SnapScore is a golf scorecard for recording rounds and calculating standings across 50+ game modes.
>
> The Settle Up screen calculates amounts from the scores entered by players. SnapScore does not transfer funds or process payments. Players make any arrangements outside the app.
>
> Sign in with the demo account entered in App Review Information. The demo account has Pro and Tournament Director access for review.
>
> To view the sample round, open Home, choose Join, and enter DGTWEW. Open the scoreboard, then choose Settle Up. To view the sample tournament, choose Join and enter R63H7T.
>
> To view subscription options, open Profile and choose Upgrade. The paywall includes subscription information, Restore Purchases, and links to the Terms of Use and Privacy Policy.
>
> Manual score entry is available from Home under Quick Round. Photo scorecard reading is optional. In a shared round, long-press a chat message to report it or block its sender.

**Not paste-ready until:** sign in to the demo account on Build 28; verify both codes, Settle Up, paywall/restore, Terms and Privacy links, Quick Round, and chat moderation paths; check the current App Store subscription product metadata; complete AUG-309 native safe-area check; and confirm the demo account access still works. If any path or claim differs, update the candidate through the approved copy process before pasting.

## Next actions

- AUG-68: Build 28 attachment is verified by the ASC readback below. Keep open for native acceptance and any remaining review prerequisites; do not mark Done before its acceptance criteria are met.
- AUG-67 remains open for final App Review notes and verified demo path. Its prior notes draft is stale as described above.
- AUG-295 remains open for Build 28 native smoke / source-artifact evidence; its earlier `ee16504` freeze plan is superseded by the `8402b04` build record.

## Box/ASC follow-up — 2026-11-02 10:08 PM PST

- Read-only ASC API readback returned HTTP 200 for app `6761034352`, iOS version `1.0` (`8e659917-44dc-421e-85ea-b7014351e365`), state `PREPARE_FOR_SUBMISSION`. Its current build relationship points to build `ef07b43e-3331-48b5-86f4-2fa7342a0d5e`, version `28`, processing `VALID`, uploaded `2026-11-02 4:40:55 PM PST`, minimum iOS `16.0`, non-exempt encryption `false`. This confirms current ASC attachment and build metadata; it does not establish source-to-binary provenance or device behavior.
- Device runtime availability check: `xcrun`, `xcodebuild`, `ios-deploy`, `idb`, and `eas` are absent from the box. There is no iOS simulator/device available here. No native safe-area, sign-in, invite-code, Settle Up, subscription, or moderation path result is claimed.
- No ASC mutation was made. Version remains `PREPARE_FOR_SUBMISSION`; no submission action was taken. As of this 10:08 PM read, ASC subscription-product status and review-detail fields were not verified. The 10:13 PM read below confirms the four current product records are `READY_TO_SUBMIT`; per-product review screenshots/localizations and StoreKit/RevenueCat behavior remain unverified.

## ASC subscription product readback — 2026-11-02 10:13 PM PST

- A fresh read-only GET of `/v1/apps/6761034352/subscriptionGroups?include=subscriptions&limit=200` returned HTTP 200 and four current release products. The product IDs referenced in `scoresnap/src/services/purchases.ts` match these four records:

| Product ID | ASC name | Period | State |
|---|---|---|---|
| `snapscore.td.monthly` | SnapScore TD Monthly | One month | `READY_TO_SUBMIT` |
| `snapscore.td.annual` | SnapScore TD Annual | One year | `READY_TO_SUBMIT` |
| `snapscore.pro.monthly` | SnapScore Pro Monthly 1.0 | One month | `READY_TO_SUBMIT` |
| `snapscore.pro.annual` | SnapScore Pro Annual | One year | `READY_TO_SUBMIT` |

- The endpoint also returned three legacy records in `MISSING_METADATA`: `snapscore_pro_monthly`, `snapscore_pro_yearly`, and the separate lifetime IAP `snapscore_pro_lifetime`. None of those IDs appears in the current `purchases.ts` product declaration. Their status is recorded for visibility, not as a Build 28 blocker based on the current source.
- This confirms the four current subscription records exist in ASC and are `READY_TO_SUBMIT`; it does not verify StoreKit/RevenueCat behavior on Build 28, localized display/pricing, review screenshot details, or the native purchase/restore path. No ASC field was changed and no submission occurred.

## Demo account text candidate for AUG-67

**Demo account:** use the App Review demo account credentials entered in the App Store Connect App Review Information fields. Do not include credentials in this packet or ticket comments.

**Demo path candidate:** Sign in with the App Review demo account. On Home, choose Join and enter `DGTWEW` for the sample round or `R63H7T` for the sample tournament. For the round, open the scoreboard and choose Settle Up. For subscription options, open Profile and choose Upgrade; the paywall should show subscription information, Restore Purchases, Terms of Use, and Privacy Policy links. On Home, Quick Round opens manual score entry. In shared-round chat, long-press a message to report it or block its sender.

**Copy/behavior gate:** this text remains a draft. The box cannot install or run the iOS binary and cannot verify the login, routes, paywall, restore, legal links, or moderation controls. Do not paste it into ASC until Build 28 device checks confirm each instruction and Copy Chief passes the final text.

## Fresh release readback — 2026-11-02 10:20 PM PST

- Read-only ASC GET again returned HTTP 200 for version 1.0 (`8e659917-44dc-421e-85ea-b7014351e365`) and Build 28 (`ef07b43e-3331-48b5-86f4-2fa7342a0d5e`). The version remains `PREPARE_FOR_SUBMISSION` and points to Build 28; the build remains version 28, `VALID`, App Store eligible, minimum iOS 16.0, and `usesNonExemptEncryption: false`.
- This readback confirms attachment and the ASC build record only. It has no source commit field. The lane environment has no `eas` executable. An authenticated direct GET to the guessed Expo project/build API routes returned 404; these responses do not verify the build's source commit. Therefore the association of this ASC binary with source SHA `8402b047b8cc6048b656d35b2abe1b17855f7f33` remains reported but not independently verified.
- No ASC fields were changed, no App Review submission was made, and no build or external action was taken. Native acceptance and source-to-artifact provenance remain open gates.

## Release refresh — 2026-11-03 1:00 AM PT

- Fresh read-only ASC GET of Build `ef07b43e-3331-48b5-86f4-2fa7342a0d5e` returned HTTP 200: version `28`, processing `VALID`, App Store eligible, minimum iOS `16.0`, non-exempt encryption `false`. Its linked iOS 1.0 version (`8e659917-44dc-421e-85ea-b7014351e365`) remains `PREPARE_FOR_SUBMISSION` with release type `AFTER_APPROVAL`. This verifies current ASC state and the attachment relationship; it does not establish source-to-binary provenance.
- Fresh read-only GET of subscription groups returned HTTP 200. The four product IDs declared by current source remain `READY_TO_SUBMIT` with the expected monthly/annual periods. Their existing ASC subscription review-note fields all contain wording disallowed by the current Copy Chief rule. No ASC metadata was changed. Copy Chief review/correction and Augie approval are required before any metadata edit; this packet does not propose or make that edit.
- Expo build-record API attempts for EAS build `f15e4cba-bbed-49bb-98cc-5ce482f651eb` returned Cloudflare HTTP 403 (`browser_signature_banned`) on both build-detail and project-build-list reads. No build source commit was returned. The `8402b04` association therefore remains reported but unverified from the provider record.
- `xcrun`, `xcodebuild`, `ios-deploy`, `idb`, and `eas` remain unavailable in this Linux environment; no native Build 28 journey or safe-area result is claimed. No ASC mutation, submission, or external message occurred.

## Purchase-path follow-up — 2026-11-03 1:20 AM PT

- Augie's Nov 3 00:11 PT comment on AUG-68 points to Sentry issue [SCORESNAP-9](https://august-industries.sentry.io/issues/7826375465/): one handled iOS `purchases` / `offerings` configuration error at 2026-11-03 07:36 UTC (Nov 2 11:36 PM PT), tagged `production`, Expo channel `testflight`, runtime `1.0.0`. The reported message says no registered products could be fetched from App Store Connect or a StoreKit configuration file. The event does not identify a build number or demonstrate impact beyond that event.
- Source inspection at the reported Build 28 SHA shows `getOfferings()` catches SDK errors, captures them in Sentry with `service=purchases` and `action=offerings`, and returns `null`; the paywall therefore cannot be considered validated by the four ASC product records being `READY_TO_SUBMIT`. Those ASC records establish metadata readiness only, not that StoreKit/RevenueCat can fetch offerings in the TestFlight binary.
- This alert is consistent with a purchase/offering configuration or availability failure, but the cause and Build 28 applicability are unconfirmed. No source change is justified by this single event without build/device and RevenueCat dashboard evidence. Native purchase/restore verification remains required on Build 28; `xcrun`, `xcodebuild`, `ios-deploy`, and `idb` are absent here. No RevenueCat or ASC configuration was changed.

## Source iOS bundle boot smoke — 2026-11-03 7:13 AM PT

- On the lane worktree at reported Build 28 source SHA `8402b047b8cc6048b656d35b2abe1b17855f7f33`, exported the iOS JavaScript bundle with `./node_modules/.bin/expo export --platform ios --no-bytecode --output-dir dist-ios`, then ran `node e2e/ios-boot-smoke.cjs`.
- The first export attempt reproduced the shared-node_modules resolver issue. Retried under `/workspace/aos-state/locks/browser-perf.lock` after applying `resolver.nodeModulesPaths` and `watchFolders` to the wrapped Metro config and pointing both at the real path of shared `node_modules`. The retry exported one 8.23 MB iOS JS entry and the boot harness reported `PASS (0 unexpected errors, 2 ignored harness errors)`. Full command output is in `reports/build28-ios-boot-smoke-20261103.log`.
- This is a VM boot smoke of the source JS bundle. It is not evidence that ASC Build 28 contains this SHA, nor a native simulator/device boot, safe-area check, live sign-in, purchase/restore, or demo journey. No source config was retained, no `dist-ios` output remains, and the original `metro.config.js` was restored. Native acceptance, Copy Chief review, and source-to-binary provenance remain open; no ASC mutation or submission occurred.
