# PR 31 privacy re-verification

**Verdict: PASS**

Independent check of https://github.com/augsmog/QuickScore/pull/31 at head `d5d3b97d1e8ee8198b6129e78ad4bc9e5dc8f0bc`. This branch is that commit plus this file. The privacy drafts are not edited. Pull request #31 was not updated.

The prior verdict was PASS-WITH-FIXES at `a20c2c70924826af07594a6f5d0cfbf19de954fc` (`verify/pr31-privacy-verdict.md` on draft PR #32). The three commits after that verdict (`1768882`, `b7ee392`, `d5d3b97`) change only `scoresnap/docs/privacy-policy.md` and `scoresnap/docs/app-store-privacy-labels.md`. Their merge-base with `main` is still `92b6c9b3638ba08ae964b20921f9b1ff079a7a04`. Every code citation below was opened at that base. App code between the two privacy commits did not move.

Apple categories are the App Privacy Details definitions at [App privacy details](https://developer.apple.com/app-store/app-privacy-details/) (fetched 27 October 2026). Replay defaults are `@sentry/react-native` 8.4.0 `MobileReplayOptions` at [mobilereplay.d.ts](https://cdn.jsdelivr.net/npm/@sentry/react-native@8.4.0/dist/js/replay/mobilereplay.d.ts) (fetched 27 October 2026). The lockfile resolves that exact version (`scoresnap/package-lock.json:7020-7021`).

## Required fixes from the prior verdict

### 1. Operator mailbox is a Stripe recipient only — PASS

`on-user-signup` declares `ALERT_EMAIL` and does not read it (`scoresnap/supabase/functions/on-user-signup/index.ts:11`). Welcome mail goes to the new user (`scoresnap/supabase/functions/on-user-signup/index.ts:38`). The three-referral mail goes to `referrer.email` (`scoresnap/supabase/functions/on-user-signup/index.ts:168`). The Stripe webhook is the sender: `to: ALERT_EMAIL`, default `jones.augie1@gmail.com` (`scoresnap/supabase/functions/stripe-webhook/index.ts:11`, `30`).

The draft says that, and it does not use the mailbox as the support contact (`scoresnap/docs/privacy-policy.md:20`, `114`, `118`, `237`).

### 2. Cloud OCR triggers — PASS

`scanScorecard` returns before Claude only when ML Kit returns at least two players and `averageConfidence >= 0.7` (`scoresnap/src/services/ocr-service.ts:18`, `54-67`). One or more players otherwise call `recognizeWithClaude` (`scoresnap/src/services/ocr-service.ts:70-73`). Zero players skip that branch and fall through to the same call (`scoresnap/src/services/ocr-service.ts:112-115`). ML Kit unavailable (`scoresnap/src/services/ocr-service.ts:46`) and ML Kit throwing (`scoresnap/src/services/ocr-service.ts:106-108`) do the same. `autoClaude` is stored and rendered (`scoresnap/src/stores/settings-store.ts:33`, `65`; `scoresnap/app/settings.tsx:552-557`) and is not read by `scanScorecard`.

The draft states those triggers and the unused toggle (`scoresnap/docs/privacy-policy.md:16`, `84`; `scoresnap/docs/app-store-privacy-labels.md:34`, `38`; inventory row 5 at `scoresnap/docs/privacy-policy.md:227`).

Citation nit, not a miss: the zero-player clause also cites `ocr-service.ts:70`, which is the `players.length > 0` branch those results do not enter. The same sentence cites `112-115`, which is the call they do hit.

### 3. Replay defaults, not an unmasked recording — PASS

`Sentry.mobileReplayIntegration()` is called with no options (`scoresnap/app/_layout.tsx:51`). SDK 8.4.0 defaults `maskAllText`, `maskAllImages`, and `maskAllVectors` to true, and the Android default strategy `pixelCopy` honors those options ([mobilereplay.d.ts](https://cdn.jsdelivr.net/npm/@sentry/react-native@8.4.0/dist/js/replay/mobilereplay.d.ts)). The phrase "do not answer that replay is masked" is gone. The drafts no longer say the recording contains scorecard photos, names, or scores. They say the call passes no options and that those defaults mask text and images (`scoresnap/docs/privacy-policy.md:21`, `130`; `scoresnap/docs/app-store-privacy-labels.md:121`). `sendDefaultPii: true` stays disclosed (`scoresnap/app/_layout.tsx:37`; `scoresnap/docs/privacy-policy.md:126`).

### 4. `enableLogs: true` — PASS

The init sets it (`scoresnap/app/_layout.tsx:38`). Application source has no `Sentry.logger` call. The draft lists the flag in the init and in inventory row 12 (`scoresnap/docs/privacy-policy.md:127`, `234`).

### 5. Search History linked Yes — PASS

`searchCourses` sends the typed query on `supabase.functions.invoke`, which carries the session (`scoresnap/src/services/course-api.ts:12`, `22-25`). The stored key is `search.toString()` (`scoresnap/supabase/functions/course-data/index.ts:67`), not the user id. Nothing strips the JWT before that request. Apple treats collected data as linked unless it is de-identified before collection ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/), "Data linked to the user"). The label answers Yes and says there is no such step (`scoresnap/docs/app-store-privacy-labels.md:91-92`, `163`).

### 6. Live chat as Emails or Text Messages — PASS

Posts send a 1–30 character name and a 1–500 character body (`scoresnap/src/services/live-chat-model.ts:4-9`; `scoresnap/src/services/live-chat.ts:35`). Apple's worked example says non-SMS in-app messages are declared as Emails or Text Messages ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/), "You offer in-app private messaging"). The label checks that row, linked Yes, tracking No, purpose App Functionality (`scoresnap/docs/app-store-privacy-labels.md:51-58`, `159`). It also says the post is not tied to a Supabase account. That matches the RPC: the server stores a SHA-256 of a random session, the name, and the body (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:660-678`). The host list is the signed-in owner (`scoresnap/src/services/live-chat.ts:38-39`).

The worked example says "private" messaging. This chat is readable by anyone with the share token (`scoresnap/src/services/live-share.ts:30-33`; `scoresnap/supabase/migrations/20261027000000_live_baseline.sql:635-648`). The checkbox still matches Apple's "SMS and non-SMS" sentence, and it is the fix the prior verdict required.

### 7. Analytics on replay — PASS

Replay is sampled at 10% of sessions and 100% of error sessions (`scoresnap/app/_layout.tsx:46-48`). Apple's Analytics purpose is using data to evaluate user behavior ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/), "Data use"). Other Diagnostic Data now includes Analytics (`scoresnap/docs/app-store-privacy-labels.md:124`, `167`; `scoresnap/docs/privacy-policy.md:161`).

### 8. Tournament schema gap — PASS

The client writes `contest_rounds`, `contest_groups`, `contest_players`, `hole_scores`, and `contests` (`scoresnap/src/services/tournament-sync.ts:24`, `57`, `68`, `99`, `111`, `146`, `173`). Active migrations create `contest_players` and `contests` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:38-68`) and do not create `contest_rounds`, `contest_groups`, or `hole_scores`. `sync_foundation.sql` says it adds no round or group schema (`scoresnap/supabase/migrations/20261027120000_sync_foundation.sql:1`) and does not add `is_tournament` or `current_round`.

`contest_players` has no `sort_order`, `status`, or `course_handicaps` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:38-48` versus `scoresnap/src/services/tournament-sync.ts:112-121`). `contests` has no `is_tournament` or `current_round` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:51-67` versus `scoresnap/src/services/tournament-sync.ts:174-176`). The client writes `hole_scores` and has no `score_events` or `write_score` call. The baseline does create `score_events` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:255`). The draft names all of that (`scoresnap/docs/privacy-policy.md:19`).

### 9. Stripe skip-path log and GolfCore browser link — PASS

If `RESEND_API_KEY` is missing, the webhook logs the alert subject and HTML body (`scoresnap/supabase/functions/stripe-webhook/index.ts:17-19`). The checkout body includes the customer email (`scoresnap/supabase/functions/stripe-webhook/index.ts:108-113`). Course detail opens a `https://www.golfcore.org/` URL in the system browser on tap (`scoresnap/src/ui/CourseSearch.tsx:533`). Both are in the policy and in inventory rows 10 and 15 (`scoresnap/docs/privacy-policy.md:106`, `114`, `232`, `237`).

## Collection matches the code — PASS

Searched `scoresnap/app`, `scoresnap/src`, and `scoresnap/supabase/functions` for `fetch(`, `.rpc(`, `.from(`, `functions.invoke`, `Sentry.`, `Purchases.`, `Share.share`, `Linking.openURL`, `Clipboard`, `CameraView`, `takePicture`, and `expo-location`. Dependencies are `scoresnap/package.json:14-55`. There is no advertising, analytics, notification, contacts, or health SDK. Native permissions in this repo are the `app.json` block (`scoresnap/app.json:19-38`).

| What the drafts say | What the code does |
| --- | --- |
| `sendDefaultPii: true`, `enableLogs: true`, replay with no options, traces at 0.2, replay 0.1 / 1.0, feedback and navigation integrations, dev events dropped unless `force_send`, public `/r/` pages skip Sentry | `scoresnap/app/_layout.tsx:26-67`, `103`. Public-share check is `scoresnap/src/config/public-share.ts:4-8`. Captures are the error boundary (`scoresnap/src/ui/ErrorBoundary.tsx:26-29`), purchases (`scoresnap/src/services/purchases.ts:113`, `159`, `180`), auth and purchase init (`scoresnap/app/_layout.tsx:126-127`), and a dev button (`scoresnap/app/(tabs)/profile.tsx:718-727`). No `Sentry.setUser`. |
| Supabase tables the client writes are the five tournament tables above. Live share and chat go through RPCs. | Client `.from(` calls are only in `scoresnap/src/services/tournament-sync.ts`. Client `.rpc(` calls are `publish_shared_round`, `create_share_link`, `revoke_share_links`, `get_shared_round` (`scoresnap/src/services/live-share.ts:12`, `21`, `27`, `33`) and `list_messages`, `post_message`, `list_host_messages`, `remove_message` (`scoresnap/src/services/live-chat.ts:27`, `35`, `39`, `45`). No client write to `profiles`, `scans`, `feedback`, `score_events`, `settlements`, `marketing_events`, or `revenue_events`. |
| Stripe is server-side. It stores email, amount, currency, subscription id, and metadata, updates `profiles` premium flags, and can email `ALERT_EMAIL`. The signature is not checked. | `scoresnap/supabase/functions/stripe-webhook/index.ts:10`, `54-80`, `93-114`, `124-133`. `STRIPE_WEBHOOK_SECRET` and `sig` are unused. The mobile app has no Stripe client call. |
| Analytics in this repo is `marketing_events` plus the daily signup counter, not a client analytics SDK. | `scoresnap/supabase/functions/on-user-signup/index.ts:185-207`. `channel_effectiveness` filters those rows to 30 days and does not delete them (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:837-846`). |
| Camera capture stays a local URI until cloud OCR base64-encodes it. ML Kit has no network call. Web and offline mode parse pasted text locally. | `scoresnap/app/scan/index.tsx:76-82`, `152-177`; `scoresnap/src/services/claude-ocr.ts:22-37`; `scoresnap/src/services/ml-kit-ocr.ts:30-34`. The photo then goes to `https://api.anthropic.com/v1/messages` as `claude-sonnet-4-5-20250514` (`scoresnap/supabase/functions/ocr-scorecard/index.ts:8`, `116-136`). The function requires `supabase.auth.getUser` (`scoresnap/supabase/functions/ocr-scorecard/index.ts:49-75`) and returns JSON without writing the image (`scoresnap/supabase/functions/ocr-scorecard/index.ts:208-210`). |
| Location coordinates are in-memory only, and only if `expo-location` loads. | `scoresnap/src/ui/CourseSearch.tsx:28-51`, `118-126`, `156-160`. `searchCourses` sends `q=` only (`scoresnap/src/services/course-api.ts:22-25`). `expo-location` is not in `scoresnap/package.json`. `app.json` has no location purpose string. |
| `RECORD_AUDIO` is declared and unused. | Listed twice (`scoresnap/app.json:33-38`). No `recordAsync` in application source. |
| RevenueCat is configured without a SnapScore user id. | `initPurchases()` is called with no argument (`scoresnap/app/_layout.tsx:127`). `Purchases.configure` uses `appUserID: userId \|\| undefined` (`scoresnap/src/services/purchases.ts:76-79`). `identifyUser` and `logOutPurchases` are defined and have no caller (`scoresnap/src/services/purchases.ts:214-234`). |

Checked and not a separate collection the drafts missed: guest join does not import Supabase (`scoresnap/src/services/guest-join.ts`); fonts are `require`d (`scoresnap/app/_layout.tsx:115-123`); `initDatabase` has no caller outside `scoresnap/src/db/schema.ts`; no `.channel(` under `scoresnap/app` or `scoresnap/src`. The settlement share sheet sends local names and dollar amounts through the OS share sheet (`scoresnap/app/contest/[id]/settlement.tsx:125-131`). That is a user export, not a server write. The dollar `betUnit` is still not what the live snapshot uploads (`scoresnap/src/services/live-share-snapshot.ts:67-70`).

Tournament resync deletes `contest_groups` by `round_id` and `contest_players` by `group_id` before insert (`scoresnap/src/services/tournament-sync.ts:56-59`, `98-101`). Those are rewrite attempts against tables the active migrations do not create. They are not an account-deletion or retention job. The draft does not claim they exist, and it does not claim that no server row is ever deleted.

## Automatic server deletion — PASS

The drafts do not say the server deletes accounts, scores, chat, profiles, marketing events, or revenue events on a schedule. They say the opposite.

- The settings alert says the account and data are permanently deleted (`scoresnap/app/settings.tsx:226-229`). The handler removes five AsyncStorage keys and signs out (`scoresnap/app/settings.tsx:247-256`). The `deleteUser` call is a TODO comment (`scoresnap/app/settings.tsx:254-255`). The draft reports that (`scoresnap/docs/privacy-policy.md:12`, `197`).
- The wiped key `snapscore-scan` is not the scan store key `snapscore-scans` (`scoresnap/src/stores/scan-store.ts:66`). `snapscore-guest` (`scoresnap/src/stores/guest-store.ts:13`) and the chat keys (`scoresnap/src/services/live-chat.ts:6-7`) are not in the list. The draft says so (`scoresnap/docs/privacy-policy.md:13`).
- Share expiry is `infinity` until completion, then seven days (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:507-510`, `707-708`). Revoke sets `revoked_at` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:776`). Chat removal sets `removed_at` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:736`). The draft says those rows stay (`scoresnap/docs/privacy-policy.md:15`, `199`).
- The request path is email or the support URL, not an in-app server form (`scoresnap/docs/privacy-policy.md:201`). Help & Support has an empty handler (`scoresnap/app/(tabs)/profile.tsx:695`).

## Contact — PASS

The drafts use these strings and no others for the support contact and the two owner URLs:

- augie@autumn8.me
- https://snapscore.autumn8.me/support
- https://snapscore.autumn8.me/privacy

They appear at `scoresnap/docs/privacy-policy.md:3`, `11`, `201`, `209-213` and `scoresnap/docs/app-store-privacy-labels.md:178`. The in-app controls still open `https://august-industries.com/snapscore/privacy` and `https://august-industries.com/snapscore/terms` (`scoresnap/app/settings.tsx:610`, `630`; `scoresnap/app/auth/sign-in.tsx:610-614`). The drafts say that, and they say this repository does not publish the autumn8.me pages.

## TODO and placeholder — PASS

Neither draft contains an unfilled support slot, a bracketed owner prompt, or a policy field marked TODO. The word TODO appears once, quoting the `deleteUser` comment (`scoresnap/docs/privacy-policy.md:12`, pointing at `scoresnap/app/settings.tsx:254-255`). The word placeholder appears for the code's fallback Supabase URL `https://your-project.supabase.co` (`scoresnap/docs/privacy-policy.md:27`, `56`; `scoresnap/src/db/supabase.ts:6-7`). "Decide whether a published policy should name" the Stripe mailbox is an owner choice (`scoresnap/docs/privacy-policy.md:20`). The contact lines above are already filled.

## Sources

- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/) (fetched 27 October 2026)
- [@sentry/react-native 8.4.0 MobileReplayOptions](https://cdn.jsdelivr.net/npm/@sentry/react-native@8.4.0/dist/js/replay/mobilereplay.d.ts) (fetched 27 October 2026)
