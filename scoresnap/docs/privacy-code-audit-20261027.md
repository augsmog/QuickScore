<!-- Internal code audit (PR #35, Oct 27 2026). Not the public policy and not part of the deployed site. Public policy: docs/privacy-policy.md -> /privacy. -->

# SnapScore privacy policy (draft from code)

Draft dated 27 October 2026. It describes what the SnapScore application and its Supabase edge functions in this repository actually do, at commit `92b6c9b`. It is not a legal opinion. The support contact is augie@autumn8.me. The support page is https://snapscore.autumn8.me/support. This policy's public URL is https://snapscore.autumn8.me/privacy. Line numbers below are positions in the application files at that commit. This change adds only these documents.

The in-app Privacy Policy control opens `https://snapscore.autumn8.me/privacy` (`scoresnap/app/settings.tsx:610`, `scoresnap/app/auth/sign-in.tsx:613`). The owner-designated URL for this policy is https://snapscore.autumn8.me/privacy. Nothing in this repository publishes this file to either address.

## Owner decisions / gaps

These are places where the code is missing, contradictory, or not enough to publish a finished policy. They are decisions for the owner, not behaviors this draft invents.

1. **The binary's privacy link differs from the owner-designated policy URL.** On 27 October 2026 the owner set the support contact to augie@autumn8.me, the support page to https://snapscore.autumn8.me/support, and this policy's public URL to https://snapscore.autumn8.me/privacy. The profile "Help & Support" row still has an empty press handler (`scoresnap/app/(tabs)/profile.tsx:695`). The Privacy Policy control still opens `https://snapscore.autumn8.me/privacy` (`scoresnap/app/settings.tsx:610`, `scoresnap/app/auth/sign-in.tsx:613`). This repository does not serve https://snapscore.autumn8.me/privacy.
2. **Account deletion does not delete the server account or server data.** Settings copy says the action permanently deletes the account and all rounds, scores, statistics, and settings (`scoresnap/app/settings.tsx:226-229`). The implementation removes five AsyncStorage keys, then signs out (`scoresnap/app/settings.tsx:247-256`). A comment says a Supabase `deleteUser` call is still a TODO (`scoresnap/app/settings.tsx:254-255`). There is no deletion job for `profiles`, `published_rounds`, `round_messages`, `marketing_events`, `revenue_events`, `share_links`, course-search cache, or auth users.
3. **The local wipe misses keys the app actually writes.** It removes `snapscore-scan` (`scoresnap/app/settings.tsx:250`). The scan store key is `snapscore-scans` (`scoresnap/src/stores/scan-store.ts:66`). It does not remove `snapscore-guest` (`scoresnap/src/stores/guest-store.ts:13`), `snapscore.chat.session.v1`, or `snapscore.chat.name.v1` (`scoresnap/src/services/live-chat.ts:6-7`).
4. **Sign-out rewrites some of the keys the wipe just removed.** `signOut` clears the in-memory auth session and calls `resetAll` on contests (`scoresnap/src/stores/auth-store.ts:220-232`). Both stores persist back to AsyncStorage (`scoresnap/src/stores/auth-store.ts:239-247`, `scoresnap/src/stores/contest-store.ts:352-355`).
5. **No retention period is implemented for accounts, scores, chat, profiles, marketing events, or revenue events.** Share links stop working seven days after a round is completed, or not at all while the round is active (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:507-510`, `707-708`). Expired and revoked rows are not deleted. Chat removal sets `removed_at` and leaves the row (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:729-736`). Course-search and course-detail caches are treated as fresh for 7 days and 90 days (`scoresnap/supabase/functions/course-data/index.ts:45-67`) and this repository has no purge of stale cache rows.
6. **"Auto Claude Vision" does not control the upload.** The setting is stored (`scoresnap/src/stores/settings-store.ts:33`, `65`; `scoresnap/app/settings.tsx:552-557`). `scanScorecard` never reads it (`scoresnap/src/services/ocr-service.ts:36-131`). Cloud OCR still runs when ML Kit is unavailable, when ML Kit throws, when ML Kit returns fewer than two players (including one player at any confidence, and a zero-player result), or when two or more players are returned with average confidence below 0.7 (`scoresnap/src/services/ocr-service.ts:44-115`). The only skip is two or more players at confidence 0.7 or higher (`scoresnap/src/services/ocr-service.ts:54-67`).
7. **Privacy toggles and notification toggles are stored and not read by any other feature code.** `shareStatistics`, `showInLeaderboards`, `roundReminders`, `settlementReminders`, and `confirmBeforeImport` appear in the settings store and settings screen only (`scoresnap/src/stores/settings-store.ts:33-42`, `scoresnap/app/settings.tsx:560-603`). There is no notification SDK in `scoresnap/package.json`.
8. **Anonymous Supabase auth is not what the guest button does.** Local config disables anonymous sign-ins (`scoresnap/supabase/config.toml:51`). The app has no `signInAnonymously` call. `anonymousSignInOptions` is defined and never called (`scoresnap/src/services/captcha.ts:73-76`). `docs/CAPTCHA.md` describes a future anonymous client (`scoresnap/docs/CAPTCHA.md:69-76`). "Skip" creates a local profile (`scoresnap/src/stores/auth-store.ts:206-217`). Server policies do reject JWTs whose `is_anonymous` claim is true for host writes (`scoresnap/src/services/live-share.ts:11`, `scoresnap/supabase/migrations/20261027130000_guest_write_guard.sql:2-20`).
9. **Tournament sync writes tables and columns this baseline does not define.** When real auth is on, the client writes `contest_rounds`, `contest_groups`, `contest_players`, `hole_scores`, and `contests` (`scoresnap/src/services/tournament-sync.ts:24`, `57`, `68`, `99`, `111`, `146`, `173`). Active migrations create `contest_players` and `contests` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:38-68`) and do not create `contest_rounds`, `contest_groups`, or `hole_scores`. The next migration says it adds no round or group schema (`scoresnap/supabase/migrations/20261027120000_sync_foundation.sql:1`). Copies of those tables exist only under `scoresnap/supabase/archive/pre-baseline/`, which is not an active migration. Tables that do exist still lack columns the client sends: `contest_players` has no `sort_order`, `status`, or `course_handicaps` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:38-48` versus `scoresnap/src/services/tournament-sync.ts:112-121`), and `contests` has no `is_tournament` or `current_round` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:51-67` versus `scoresnap/src/services/tournament-sync.ts:174-176`). The client writes `hole_scores` and does not write `score_events`, which the baseline does create (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:255-263`). Whether those writes succeed against the hosted database is not settled by the client code. The data the client attempts to send is still disclosed below.
10. **The Stripe alert mailbox is hardcoded. The signup function declares the same constant and does not send to it.** `on-user-signup` sets `ALERT_EMAIL` and never reads it (`scoresnap/supabase/functions/on-user-signup/index.ts:11`). Signup mail goes to the new user and, at three referrals, to the referrer (`scoresnap/supabase/functions/on-user-signup/index.ts:38`, `168`). The Stripe webhook sets `to: ALERT_EMAIL`, which defaults to `jones.augie1@gmail.com` when the env var is unset (`scoresnap/supabase/functions/stripe-webhook/index.ts:11`, `30`). Decide whether a published policy should name that mailbox. This draft does not use it as the support contact.
11. **Sentry sends default PII, and session replay uses the SDK's default masks.** `sendDefaultPii: true` is set (`scoresnap/app/_layout.tsx:37`). `mobileReplayIntegration()` is called with no options (`scoresnap/app/_layout.tsx:51`). The pinned SDK is `@sentry/react-native` 8.4.0 (`scoresnap/package.json:19`, `scoresnap/package-lock.json:7020`). That version's `MobileReplayOptions` defaults `maskAllText`, `maskAllImages`, and `maskAllVectors` to true, and this repository does not override them. `enableLogs: true` is also set (`scoresnap/app/_layout.tsx:38`). Application source does not call `Sentry.logger`. The exact fields `sendDefaultPii` attaches are still not listed in this repo.
12. **Android `RECORD_AUDIO` is declared twice, and no application code records audio** (`scoresnap/app.json:33-38`). Confirm the permission is still required by the camera plugin before the store listing claims the app uses the microphone.
13. **Precise location is requested in the course-search UI if `expo-location` can be loaded, and the search request the app builds does not send coordinates** (`scoresnap/src/ui/CourseSearch.tsx:28-51`, `scoresnap/src/services/course-api.ts:22-25`). `expo-location` is not a dependency in `scoresnap/package.json`, and `app.json` has no location usage string. The edge function can accept a `near` query (`scoresnap/supabase/functions/course-data/index.ts:54-57`). No app caller passes `near`.

## What I could not determine from code

- The production value of `EXPO_PUBLIC_SUPABASE_URL`. The client uses that variable, or the placeholder `https://your-project.supabase.co` (`scoresnap/src/db/supabase.ts:6-7`). Schema notes name Supabase project ref `pltgbizexllikiwryozm` (`scoresnap/supabase/BASELINE-NOTES.md:3`). This draft does not turn that ref into a URL.
- Whether the hosted project has anonymous sign-in, captcha enforcement, or Auth hooks enabled. Local `config.toml` sets `enable_anonymous_sign_ins = false` and does not set a captcha provider (`scoresnap/supabase/config.toml:43-56`). `docs/CAPTCHA.md` says server captcha is a later manual switch (`scoresnap/docs/CAPTCHA.md:47-61`).
- Whether `on-user-signup` is actually attached to a live Auth hook or database webhook. The file's comment says it is triggered that way (`scoresnap/supabase/functions/on-user-signup/index.ts:1-3`). The SQL that does run on signup is `handle_new_user` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:551-561`, `1024`).
- Whether `stripe-webhook` is deployed and receiving events. The mobile app has no Stripe client call. The function parses the JSON body and the signature check is a comment, not a verification call (`scoresnap/supabase/functions/stripe-webhook/index.ts:54-63`).
- RevenueCat, Sentry, Expo Updates, Apple, Google, Anthropic, Cloudflare, Resend, GolfCore, and Supabase retention, subprocessors, and regions. Those are vendor accounts and contracts, not this repository.
- The exact fields Sentry attaches when `sendDefaultPii` is true (`scoresnap/app/_layout.tsx:37`). Replay is called with no options, so the 8.4.0 defaults apply (`scoresnap/app/_layout.tsx:51`, `scoresnap/package-lock.json:7020`). What else a replay contains past those defaults is not listed in this repository. `enableLogs: true` is set and no application file calls `Sentry.logger` (`scoresnap/app/_layout.tsx:38`), so which log lines that flag would send is not shown.
- Whether `feedbackIntegration()` shows a user-visible feedback form (`scoresnap/app/_layout.tsx:52`).
- Whether the Expo Updates client contacts `https://u.expo.dev/bf3a59c5-8098-4007-8fb2-438f89514baa` on launch, and which device fields it sends. The URL is configured (`scoresnap/app.json:76-87`) and `expo-updates` is a dependency (`scoresnap/package.json:37`). Application source does not call the Updates API.
- Whether ML Kit's native binary contacts Google. The wrapper calls `TextRecognition.recognize` on a local URI and has no network call (`scoresnap/src/services/ml-kit-ocr.ts:30-34`).
- Whether RevenueCat or Sentry generate a device or anonymous app-user identifier inside the SDK. The app calls `Purchases.configure` without a SnapScore user id (`scoresnap/src/services/purchases.ts:76-79`, `scoresnap/app/_layout.tsx:127`). `identifyUser` is never called.
- Store age rating, region of the Supabase project, and whether backups exist. None of that is in this repository.
- Whether https://snapscore.autumn8.me/privacy or https://snapscore.autumn8.me/support currently serve these pages. The owner designated both URLs on 27 October 2026. This repository does not publish them. The app opens `https://snapscore.autumn8.me/privacy` and `https://snapscore.autumn8.me/terms` (`scoresnap/app/settings.tsx:610`, `630`). Whether those snapscore.autumn8.me URLs currently serve a page is also outside this repository.

## Who this covers

SnapScore is the Expo app named SnapScore, bundle id and Android package `com.scoresnap.app`, version 1.0.0 (`scoresnap/app.json:3-17`, `24-32`). People use it to photograph or type a golf scorecard, keep a local contest, and, when the matching build flags are on, share a live scoreboard or look up a course.

## Data on the device

Contests, including player names, handicaps, hole scores, optional putts, teams, bet unit, and game choices, are persisted on the device under AsyncStorage key `snapscore-contests` (`scoresnap/src/engine/types.ts:17-26`, `scoresnap/src/stores/contest-store.ts:355`). Auth profile fields the app keeps (id, email, name, provider, anonymous flag) are persisted under `snapscore-auth` (`scoresnap/src/stores/auth-store.ts:9-16`, `239-247`). Settings, including handicap and bet-unit preferences, are under `snapscore-settings` (`scoresnap/src/stores/settings-store.ts:10-42`, `83`). A scan counter and Pro flag are under `snapscore-scans` (`scoresnap/src/stores/scan-store.ts:19-30`, `66-71`). Onboarding completion is under `snapscore-onboarding` (`scoresnap/src/stores/onboarding-store.ts:5-25`). Guest bindings are under `snapscore-guest` (`scoresnap/src/stores/guest-store.ts:10-13`).

On iOS and Android the Supabase auth session is stored with `expo-secure-store`. On web it is stored in `localStorage` (`scoresnap/src/db/supabase.ts:10-52`). This repository does not show application-level encryption of contest data. `ITSAppUsesNonExemptEncryption` is set to false (`scoresnap/app.json:21`). That is an export-compliance flag in the app config, not a description of how contest data is stored.

A SQLite schema for contests and scores exists (`scoresnap/src/db/schema.ts:3-86`). `initDatabase` is not called from any other application file, so this draft does not treat SQLite as an active store.

The camera saves a picture to a local URI with base64 turned off (`scoresnap/app/scan/index.tsx:76-82`). The cloud OCR path then reads that file as base64 (`scoresnap/src/services/claude-ocr.ts:22-25`). This repository does not show a retention period for the photo file.

## Accounts and sign-in

Real auth runs only when offline mode is off and both Supabase env vars are set to something other than the placeholder (`scoresnap/src/config/auth.ts:1-2`, `scoresnap/src/config/offline.ts:1-3`). Offline mode is opt-in with `EXPO_PUBLIC_OFFLINE_MODE=true` (`scoresnap/src/config/offline.ts:1-3`). In offline mode, after onboarding, the app calls `skipSignIn` and does not require the sign-in screen (`scoresnap/app/_layout.tsx:81-84`).

When real auth is on:

- Email sign-up sends email, password, and `full_name` (first and last name) to `supabase.auth.signUp`, plus a captcha token when one was obtained (`scoresnap/src/stores/auth-store.ts:144-146`, `scoresnap/app/auth/sign-in.tsx:136-157`).
- Email sign-in sends email, password, and an optional captcha token to `supabase.auth.signInWithPassword` (`scoresnap/src/stores/auth-store.ts:178-180`).
- Apple sign-in asks Apple for full name and email, hashes a nonce on device, and sends the Apple identity token and raw nonce to `supabase.auth.signInWithIdToken` (`scoresnap/app/auth/sign-in.tsx:57-78`, `scoresnap/src/stores/auth-store.ts:76-84`). The Apple full name from the credential object is not copied into the Supabase metadata by this code.
- Google sign-in, if `EXPO_PUBLIC_GOOGLE_CLIENT_ID` is set, opens Google's authorization and token endpoints with scopes `openid`, `profile`, and `email`, then sends the tokens to `supabase.auth.signInWithIdToken` (`scoresnap/app/auth/sign-in.tsx:27-32`, `98-124`, `scoresnap/src/stores/auth-store.ts:106-114`).
- Startup calls `supabase.auth.getSession`, and the client is created with `autoRefreshToken` and `persistSession` (`scoresnap/src/stores/auth-store.ts:56-59`, `scoresnap/src/db/supabase.ts:46-51`).

When real auth is off, Apple and Google can still be invoked, but the store then keeps a local profile and does not call Supabase. The Apple fallback profile uses the literal email `golfer@apple.com` and the name `Golfer`. The Google fallback uses `golfer@gmail.com` (`scoresnap/src/stores/auth-store.ts:87-99`, `117-129`). Email sign-up in that mode stores the typed email and name locally and does not store the password in the persisted profile (`scoresnap/src/stores/auth-store.ts:155-168`).

Skip sign-in stores a local id of the form `anon-<timestamp>`, the name `Golfer`, and `provider: "anonymous"` (`scoresnap/src/stores/auth-store.ts:206-217`). That path does not call Supabase and does not request a Turnstile token.

A database trigger inserts `profiles.id`, `profiles.email`, and `signup_source` from `auth.users` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:551-561`, `1024`). The `profiles` table also has display name, avatar URL, premium flags, referral fields, and scan and round counters (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:192-211`). The client does not write those extra columns. The `on-user-signup` function, if invoked with a user id and email, upserts email, a generated referral code, `referred_by` from user metadata, and signup source, and it inserts `marketing_events` rows that include the email (`scoresnap/supabase/functions/on-user-signup/index.ts:86-195`).

## Cloudflare Turnstile

Turnstile is off unless real auth is on, offline mode is off, and `EXPO_PUBLIC_CAPTCHA_MODE` is `optional` or `required` (`scoresnap/src/config/captcha.ts:4-10`). The default mode is off. When it is on, the root layout mounts a Turnstile host (`scoresnap/app/_layout.tsx:164`). Email sign-up and email sign-in request a token immediately before the Supabase call (`scoresnap/src/stores/auth-store.ts:145`, `179`). Apple and Google sign-in do not request a token (`scoresnap/docs/CAPTCHA.md:14-15`).

The widget loads `https://challenges.cloudflare.com/turnstile/v0/api.js` (`scoresnap/src/services/turnstile-html.ts:3`). On native that script runs in a WebView whose base URL defaults to `https://snapscore-web.augie-os.workers.dev` (`scoresnap/src/config/captcha.ts:6`, `scoresnap/src/components/TurnstileHost.tsx:64-80`). On web the script is injected into the page (`scoresnap/src/components/TurnstileHost.tsx:13-28`). The site key defaults to `0x4AAAAAAFnthkbq7bh9N5bW` (`scoresnap/src/config/captcha.ts:5`). The token is passed to Supabase as `captchaToken` and the captcha module says it does not log bridge data (`scoresnap/src/services/captcha.ts:23`, `36-70`). What Cloudflare stores from the challenge is not in this repository.

The guest / skip path does not run this widget. The unused helper `anonymousSignInOptions` would request a token with action `anonymous` (`scoresnap/src/services/captcha.ts:3`, `73-75`). Nothing calls it.

## Scorecard photos and OCR

On native, confirming a photo calls `scanScorecard` (`scoresnap/app/scan/index.tsx:94-103`). On web, and in offline mode, the scan screen is a text box. Pasted text is parsed locally and is not sent to the OCR function (`scoresnap/app/scan/index.tsx:152-177`).

`scanScorecard` tries ML Kit first (`scoresnap/src/services/ocr-service.ts:43-51`, `scoresnap/src/services/ml-kit-ocr.ts:30-34`). The photo is sent to Claude in every case except one. Claude runs when ML Kit is unavailable (`scoresnap/src/services/ocr-service.ts:46`, `112-115`), when ML Kit throws (`scoresnap/src/services/ocr-service.ts:106-115`), when ML Kit returns zero players (`scoresnap/src/services/ocr-service.ts:70`, `112-115`), when it returns exactly one player at any confidence (`scoresnap/src/services/ocr-service.ts:55-57`, `70-73`), and when it returns two or more players with average confidence below 0.7 (`scoresnap/src/services/ocr-service.ts:18`, `54-73`). The skip is only two or more players at average confidence of 0.7 or higher (`scoresnap/src/services/ocr-service.ts:54-67`).

The Claude path base64-encodes the image and calls the Supabase edge function `ocr-scorecard` with `imageData` and `mediaType` (`scoresnap/src/services/claude-ocr.ts:19-38`). The function requires a bearer token that `supabase.auth.getUser` accepts (`scoresnap/supabase/functions/ocr-scorecard/index.ts:49-75`). It then POSTs the image to `https://api.anthropic.com/v1/messages` as model `claude-sonnet-4-5-20250514`, and asks the model to extract player names, 18 hole scores, confidences, and par (`scoresnap/supabase/functions/ocr-scorecard/index.ts:8-9`, `114-167`). The function returns the parsed names and scores to the app (`scoresnap/supabase/functions/ocr-scorecard/index.ts:196-210`). It does not insert the image into a table or storage bucket. A failed Anthropic response can be copied into the JSON error body returned to the client (`scoresnap/supabase/functions/ocr-scorecard/index.ts:169-177`). The maximum accepted body is 10 MB (`scoresnap/supabase/functions/ocr-scorecard/index.ts:13-14`, `82-87`).

Names and scores on a photographed card can be other people's names and scores. They are sent to Anthropic whenever this fallback runs.

## Contests, live scoreboards, and chat

Creating and scoring a contest updates the local store (`scoresnap/src/stores/contest-store.ts`). Two network paths exist when real auth is configured.

**Live share.** If `EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING` is not `true`, the share UI renders nothing (`scoresnap/src/config/features.ts:6-8`, `scoresnap/src/ui/LiveShare.tsx:9-13`). When the UI is available and the user shares, the app publishes a snapshot and creates a link (`scoresnap/src/services/live-share.ts:18-23`). The snapshot keeps a completed flag, display names trimmed to 80 characters, hole scores, stroke total, score to par, game ids, and per-player unit standings (`scoresnap/src/services/live-share-snapshot.ts:51-71`). The server keeps a sanitized copy of those fields (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:809-834`). Anonymous JWTs are rejected (`scoresnap/src/services/live-share.ts:11`, `scoresnap/supabase/migrations/20261027000000_live_baseline.sql:689`). While sharing is enabled, the client republishes about every 10 seconds and also on contest changes (`scoresnap/src/ui/LiveShare.tsx:16-22`, `scoresnap/src/stores/contest-store.ts:487-494`).

The share token is a 64-character hex string returned to the owner. The database stores SHA-256 of that token, not the token (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:497-510`). On web the app writes the URL to the clipboard. Otherwise it passes the URL to the system share sheet (`scoresnap/src/ui/LiveShare.tsx:39-40`). A separate join-code control, when cross-device sharing is enabled, copies or shares a local code and a `snapscore://join/` or same-origin `/join/` link (`scoresnap/src/ui/ContestJoinCode.tsx:15-19`). Those are ways the token or code leaves the device. They are not a new server processor. Anyone with the live-share token can call `get_shared_round` without a session (`scoresnap/src/services/live-share.ts:30-40`). The public page shows names, scores, and unit standings, and sets a no-referrer robots meta tag (`scoresnap/app/r/[token].tsx:29-48`). Active links use an expiry of `infinity` until the round is completed; completion sets expiry to seven days after the end (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:507-510`, `707-708`). Revoke sets `revoked_at` and does not delete the snapshot (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:765-776`). Sentry is initialized with `enabled: !isPublicShare`, and `isPublicShare` is true for web paths under `/r/` (`scoresnap/app/_layout.tsx:27`, `scoresnap/src/config/public-share.ts:4-8`).

**Chat.** A viewer picks a display name of 1–30 characters and a body of 1–500 characters (`scoresnap/src/services/live-chat-model.ts:4-9`). The app stores a random 32-byte hex session and the name in AsyncStorage, and sends the raw session, name, and body to `post_message` (`scoresnap/src/services/live-chat.ts:6-36`). The server stores SHA-256 of the session, the display name, and the body (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:651-678`). No account is required to read or post. The host can list messages and mark one removed (`scoresnap/src/services/live-chat.ts:38-46`).

**Tournament sync.** Scoring a hole with a round id calls `syncScore`, which writes contest id, round id, player id, hole, and strokes to `hole_scores` (`scoresnap/src/stores/contest-store.ts:192-197`, `scoresnap/src/services/tournament-sync.ts:133-160`). Adding a round or changing groups writes round name, date, course name, course JSON, group name, tee time, player name, handicap, team, and status (`scoresnap/src/services/tournament-sync.ts:22-127`). These calls return immediately when real auth is off, and they throw or return when the session is missing or anonymous (`scoresnap/src/services/tournament-sync.ts:14-20`).

**Same-device guest join.** A six-character join code and a guest display name are stored locally. The claim-history function returns a message that rounds stay on the device (`scoresnap/src/services/guest-join.ts:15-36`). That path does not call Supabase.

## Course search

Course search runs only when `EXPO_PUBLIC_FEATURE_COURSE_SEARCH` is `true` (`scoresnap/src/config/features.ts:1-2`, `scoresnap/src/services/course-api.ts:22-24`). The app sends the typed query to the `course-data` edge function (`scoresnap/src/services/course-api.ts:9-25`). The function requires a JWT role, rate-limits using `jwt.sub` or the first `x-forwarded-for` address in memory, and stores the upstream payload in `course_search_cache` (`scoresnap/supabase/functions/course-data/index.ts:21-32`, `67-74`, `115`). For a text search the cache key is `search.toString()`, which is the normalized query plus `limit` and any coverage filter, not the user id (`scoresnap/supabase/functions/course-data/index.ts:67`). The request that produces that row still carries the caller's JWT. There is no step that strips that identifier before the query is sent. A course-detail screen can also open a `https://www.golfcore.org/` URL in the system browser when the user taps the credit (`scoresnap/src/ui/CourseSearch.tsx:533`). That tap is separate from the `course-data` call. GolfCore then sees the browser request. Detail lookups are cached in `course_catalog` for 90 days of freshness, search results for 7 days (`scoresnap/supabase/functions/course-data/index.ts:42-67`). On a cache miss the function calls `https://api.golfcore.org/v1` with a server-side API key and a User-Agent that includes `https://github.com/augsmog/QuickScore` (`scoresnap/supabase/functions/course-data/index.ts:88`). Usage rows store endpoint, HTTP status, and rate-limit headers, not the query text (`scoresnap/supabase/functions/course-data/index.ts:93-94`).

If the course-search modal opens and `expo-location` loads, the UI requests foreground location and keeps latitude and longitude in component state to sort results (`scoresnap/src/ui/CourseSearch.tsx:40-51`, `118-126`, `156-160`). `searchCourses` does not add those coordinates to the request (`scoresnap/src/services/course-api.ts:22-25`).

## Purchases

When the RevenueCat native module is present and an Apple or Google public SDK key is set, the app configures RevenueCat and fetches customer info and offerings (`scoresnap/src/services/purchases.ts:53-87`, `106-110`). Purchases and restores go through that SDK (`scoresnap/src/services/purchases.ts:142-174`). The paywall can present RevenueCat's paywall UI for the entitlement `SnapScore Pro` (`scoresnap/app/paywall.tsx:45-54`). Profile can present RevenueCat's customer center (`scoresnap/app/(tabs)/profile.tsx:129-132`). The app does not pass a SnapScore user id into `Purchases.configure`, and nothing calls `identifyUser` or `logOutPurchases` (`scoresnap/src/services/purchases.ts:76-79`, `214-234`). Card numbers are not read by this code. The comment in the purchases file says web billing is connected to Stripe in the RevenueCat dashboard (`scoresnap/src/services/purchases.ts:1-4`). That dashboard is not in the repo.

The `stripe-webhook` function, if Stripe posts an event, stores the event id, type, customer email, amount, currency, subscription id, and metadata, and it can email that information to `ALERT_EMAIL` through Resend (`scoresnap/supabase/functions/stripe-webhook/index.ts:11`, `16-35`, `68-80`, `108-114`). If `RESEND_API_KEY` is missing, the webhook writes the alert subject and HTML body to its log. That body includes the customer email (`scoresnap/supabase/functions/stripe-webhook/index.ts:17-19`, `108-113`). The destination is the function log, not another processor. `STRIPE_WEBHOOK_SECRET` is read and never used, and the `stripe-signature` header is stored in `sig` and never used (`scoresnap/supabase/functions/stripe-webhook/index.ts:10`, `54-63`).

## Email sent by edge functions

`on-user-signup` can POST the user's email and referral code to `https://api.resend.com/emails`, with the from header `ScoreSnap <hello@scoresnap.app>` (`scoresnap/supabase/functions/on-user-signup/index.ts:24-39`). The HTML offers a free month of Premium after three referrals (`scoresnap/supabase/functions/on-user-signup/index.ts:60-65`). A third referral can email the referrer at the address stored on their profile, from the same header (`scoresnap/supabase/functions/on-user-signup/index.ts:158-176`). If `RESEND_API_KEY` is missing, the signup function writes the recipient address to its log (`scoresnap/supabase/functions/on-user-signup/index.ts:24-27`). It does not send that mail to `ALERT_EMAIL`. Stripe alerts use Resend with from header `ScoreSnap <alerts@scoresnap.app>` and `to: ALERT_EMAIL` (`scoresnap/supabase/functions/stripe-webhook/index.ts:22-34`). This repository does not show that those from-addresses are inboxes anyone can write to. They are not the support contact.

Signup and Stripe handlers also insert `automation_log` rows. The signup comment says a Notion sync picks those rows up (`scoresnap/supabase/functions/on-user-signup/index.ts:197-203`, `scoresnap/supabase/functions/stripe-webhook/index.ts:37-44`). No Notion client call is in the function. The log title for a signup includes the email (`scoresnap/supabase/functions/on-user-signup/index.ts:198-201`).

## Diagnostics

Sentry is initialized for the app except on public web share pages (`scoresnap/app/_layout.tsx:26-28`, `scoresnap/src/config/public-share.ts:4-8`). The DSN host is `ingest.us.sentry.io`. The Expo plugin names organization `august-industries` and project `scoresnap` (`scoresnap/app.json:56-62`). The init sets:

- `sendDefaultPii: true` (`scoresnap/app/_layout.tsx:37`)
- `enableLogs: true` (`scoresnap/app/_layout.tsx:38`). Application source does not call `Sentry.logger`. The flag is still part of the init that can send log events.
- release `com.scoresnap.app@<version>`, dist from the iOS build number or Android version code, and environment `development` or `production` (`scoresnap/app/_layout.tsx:31-35`)
- performance tracing on 20% of transactions, app-start tracking, and stall tracking (`scoresnap/app/_layout.tsx:40-44`)
- session replay on 10% of sessions and on 100% of sessions that have an error, via `mobileReplayIntegration()` with no options (`scoresnap/app/_layout.tsx:46-51`). The dependency is `@sentry/react-native` 8.4.0 (`scoresnap/package.json:19`, `scoresnap/package-lock.json:7020`). That version defaults `maskAllText`, `maskAllImages`, and `maskAllVectors` to true. This call does not override those defaults, so the recording masks text and images.
- `feedbackIntegration()` and navigation instrumentation (`scoresnap/app/_layout.tsx:22-24`, `50-53`)
- breadcrumbs kept except debug console breadcrumbs (`scoresnap/app/_layout.tsx:63-67`)
- events dropped in dev unless tagged `force_send` (`scoresnap/app/_layout.tsx:57-60`)

The root component is wrapped with `Sentry.wrap` (`scoresnap/app/_layout.tsx:103`). The error boundary sends the exception and the React component stack (`scoresnap/src/ui/ErrorBoundary.tsx:26-29`). Purchase failures are sent with tags `service=purchases` and an action name (`scoresnap/src/services/purchases.ts:113`, `159`, `180`). Auth and purchase init failures are sent the same way (`scoresnap/app/_layout.tsx:126-127`). A dev-only button sends `new Error("First error")` (`scoresnap/app/(tabs)/profile.tsx:718-727`). Application code does not call `Sentry.setUser`.

## Other packages that do not, by themselves, show a user-data upload

These are in `scoresnap/package.json` or `app.json` and were checked so they are not silent gaps:

- `@expo-google-fonts/inter` and `@expo-google-fonts/space-grotesk` are dependencies (`scoresnap/package.json:15-16`). The app loads font files from `assets/fonts` with `require` (`scoresnap/app/_layout.tsx:115-123`). Those Google-font packages are not imported by application source.
- `expo-haptics` is used for local vibration (`scoresnap/package.json:29`). No network call.
- `expo-sqlite` is a plugin and a dependency (`scoresnap/app.json:46`, `scoresnap/package.json:35`). See the unused `initDatabase` note above.
- `expo-updates` and the updates URL are configured (`scoresnap/package.json:37`, `scoresnap/app.json:82-87`). No application call.
- `react-native-webview` is used for the Turnstile WebView (`scoresnap/src/components/TurnstileHost.tsx:66-68`).
- EAS submit config contains an Apple ID, an App Store Connect app id, and a team id (`scoresnap/eas.json:35-48`). That file is build tooling. The running app does not read it.
- Playwright and Jest are dev dependencies (`scoresnap/package.json:57-64`). They are not part of the app binary.
- Deno and esm.sh URLs in the edge functions load server code (`scoresnap/supabase/functions/ocr-scorecard/index.ts:5-6`). They are not user-data destinations. User data leaves those functions only through the Anthropic, Resend, GolfCore, and Supabase calls cited above.

## Why the data is used

The code uses each flow for the behavior next to it:

- Account fields, to create a session and a profile row (`scoresnap/src/stores/auth-store.ts:144-146`, `scoresnap/supabase/migrations/20261027000000_live_baseline.sql:551-561`).
- The scorecard image, to read names and scores when local ML Kit is not used (`scoresnap/src/services/ocr-service.ts:69-115`, `scoresnap/supabase/functions/ocr-scorecard/index.ts:140-161`).
- Contest and score rows, to sync a tournament or publish a live scoreboard (`scoresnap/src/services/tournament-sync.ts:14-34`, `scoresnap/src/services/live-share.ts:7-13`).
- Chat name and body, to show messages on a shared round (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:677-678`).
- Course query text, to search and cache course data (`scoresnap/supabase/functions/course-data/index.ts:50-74`).
- Purchase SDK calls, to read and sell the `SnapScore Pro` entitlement (`scoresnap/src/services/purchases.ts:26-27`, `142-152`).
- Signup emails and `marketing_events`, to send the welcome and referral mail and to count signups (`scoresnap/supabase/functions/on-user-signup/index.ts:182-207`).
- Sentry events, to record exceptions, navigation, performance, replay, and, because `enableLogs` is true, log events the SDK sends (`scoresnap/app/_layout.tsx:26-53`). Replay is also a record of how a session behaved, which is an analytics use as well as debugging.

This repository does not contain an advertising SDK, an App Tracking Transparency prompt, or code that sends data to an ad network. That is a statement about this source tree, not about a vendor's account settings.

## Where it goes and who processes it

| Data | First hop from the app | Next hop in this repo | Processor named by the code |
| --- | --- | --- | --- |
| Email, password, name, Apple or Google token | Supabase Auth URL from `EXPO_PUBLIC_SUPABASE_URL` | `profiles` trigger; optional `on-user-signup` | Supabase (`scoresnap/src/db/supabase.ts:6-7`, `46`) |
| Captcha token | Supabase Auth, after the widget has already talked to Cloudflare | none in this repo | Cloudflare and Supabase (`scoresnap/src/services/turnstile-html.ts:3`, `scoresnap/src/stores/auth-store.ts:145`) |
| Scorecard image | `ocr-scorecard` on that Supabase project | `https://api.anthropic.com/v1/messages` | Supabase and Anthropic (`scoresnap/src/services/claude-ocr.ts:33-37`, `scoresnap/supabase/functions/ocr-scorecard/index.ts:8`, `116`) |
| Live snapshot, chat, tournament rows | Supabase RPC or tables | stored in Postgres as cited | Supabase |
| Course query | `course-data` | `https://api.golfcore.org/v1` on a cache miss | Supabase and GolfCore (`scoresnap/supabase/functions/course-data/index.ts:88`) |
| Purchase and entitlement | RevenueCat SDK; store payment sheet | not shown | RevenueCat, and Apple StoreKit or Google Play as described in the purchases file (`scoresnap/src/services/purchases.ts:1-4`, `150`) |
| Stripe event, if the webhook is called | the webhook receives it | `revenue_events`, `profiles`, Resend | Stripe (sender), Supabase, Resend (`scoresnap/supabase/functions/stripe-webhook/index.ts:22`, `69`) |
| Welcome and referral email | Resend | the recipient mailbox | Resend (`scoresnap/supabase/functions/on-user-signup/index.ts:30`) |
| Crashes, traces, replay, logs | Sentry DSN in `app/_layout.tsx` | not shown | Sentry, org `august-industries`, project `scoresnap` (`scoresnap/app.json:56-62`, `scoresnap/app/_layout.tsx:37-51`) |
| Google sign-in | `https://accounts.google.com` and `https://oauth2.googleapis.com/token` | Supabase, when real auth is on | Google and Supabase (`scoresnap/app/auth/sign-in.tsx:29-31`) |
| Apple sign-in | Apple's sign-in API | Supabase, when real auth is on | Apple and Supabase (`scoresnap/app/auth/sign-in.tsx:69`) |

Anyone who has a live-share token can read the published names, scores, and chat (`scoresnap/src/services/live-share.ts:30-33`). That is sharing by link, implemented in the app, not a separate analytics export.

## Retention

Implemented in this repository:

- Supabase JWT expiry in local config is 3600 seconds, with refresh-token rotation (`scoresnap/supabase/config.toml:47-49`). The hosted project's value was not read from a live API for this draft.
- Share links expire seven days after the server observes completion. Until then the expiry stored for a new link is `infinity` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:507-510`).
- Course search cache is reused for 7 days, course detail for 90 days, and the count cache for 1 day (`scoresnap/supabase/functions/course-data/index.ts:45-67`).
- Chat list RPCs return at most 200 messages (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:631`, `647`). Older rows are not deleted by that limit.
- `channel_effectiveness` reads signup events from the last 30 days (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:846`). That is a view filter, not a delete.

Not implemented: a retention period or deletion schedule for accounts, profiles, contest rows, score rows, chat rows, share snapshots, marketing events, revenue events, automation log, feedback, scans, or local photos. The `scans` and `feedback` tables exist (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:100-116`, `244-253`). Application code does not insert into them.

## Deletion and how to ask for it

The settings screen offers Delete Account. After two confirms it removes `snapscore-contests`, `snapscore-auth`, `snapscore-settings`, `snapscore-scan`, and `snapscore-onboarding`, then calls `signOut` and returns to onboarding (`scoresnap/app/settings.tsx:226-257`). Read the gaps at the top before relying on that button. It does not call Supabase to delete the user. Sign-out calls `supabase.auth.signOut` only when real auth is configured (`scoresnap/src/stores/auth-store.ts:220-221`), which clears the session through the SecureStore or `localStorage` adapter (`scoresnap/src/db/supabase.ts:33-39`).

A host can revoke live links and mark a chat message removed. Both leave the underlying rows in place (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:736`, `776`).

There is no in-app form that submits a deletion request to a server. To ask for deletion of data this button does not remove, write to augie@autumn8.me or use https://snapscore.autumn8.me/support.

## Children

The app does not ask for a date of birth, and it does not contain an age check or a parental-consent flow. Searches of the application and SQL for an age gate did not find one. Player handicaps and bet units are part of the contest (`scoresnap/src/engine/types.ts:20`, `scoresnap/src/stores/settings-store.ts:13`). Whether the app is directed to children, and which store age rating to set, is not decided in this repository. The owner has to make that decision before publication. This draft does not claim an age floor the code does not enforce.

## Contact

Support contact: augie@autumn8.me

Support URL: https://snapscore.autumn8.me/support

Privacy policy URL: https://snapscore.autumn8.me/privacy

The app's Help control does not open a page (`scoresnap/app/(tabs)/profile.tsx:695`). The Privacy Policy and Terms controls open `https://snapscore.autumn8.me/privacy` and `https://snapscore.autumn8.me/terms` (`scoresnap/app/settings.tsx:610`, `630`, `scoresnap/app/auth/sign-in.tsx:610-614`). Those in-app links are separate from the support and privacy URLs above.

## Off-device data-flow inventory

Every path below can send data off the device, or is a server function that sends data onward. Local-only code is listed after the table so it is not mistaken for a disclosure gap.

| # | Flow | Leaves the device | Payload this code sends | Gated by |
| --- | --- | --- | --- | --- |
| 1 | Supabase Auth session | Yes | session refresh, email, password, Apple identity token, Google tokens, optional captcha token, name metadata | `REAL_AUTH_CONFIGURED` (`scoresnap/src/config/auth.ts:2`, `scoresnap/src/stores/auth-store.ts:76-180`) |
| 2 | Apple sign-in API | Yes, when the user uses the Apple button on iOS | Apple-requested name and email scopes; nonce | the button (`scoresnap/app/auth/sign-in.tsx:69-75`) |
| 3 | Google OAuth | Yes, when a Google client id is set and the user continues | OAuth code exchange for openid, profile, email | client id (`scoresnap/app/auth/sign-in.tsx:102-118`) |
| 4 | Cloudflare Turnstile | Yes, when captcha mode is optional or required and the user is signing up or in with email | widget execution; token returned to the app and then to Supabase | `CAPTCHA_MODE` (`scoresnap/src/config/captcha.ts:8-10`) |
| 5 | `ocr-scorecard` then Anthropic | Yes, unless ML Kit returns at least two players at confidence 0.7 or higher | base64 JPEG or PNG and media type, with the user's Supabase JWT | fewer than two players, confidence below 0.7, zero players, ML Kit unavailable, or ML Kit throwing (`scoresnap/src/services/ocr-service.ts:46-115`) |
| 6 | Live share RPCs | Yes, when real auth is on and a non-anonymous user shares | snapshot of names, scores, totals, game unit standings; share token handling. The raw URL then goes to the clipboard or the system share sheet (`scoresnap/src/ui/LiveShare.tsx:39-40`) | feature flag for the UI; `liveShareEnabled` for republish (`scoresnap/src/ui/LiveShare.tsx:11`, `scoresnap/src/services/live-share.ts:7-23`) |
| 7 | Public scoreboard read | Yes, for anyone opening `/r/<token>` | the token | none (`scoresnap/src/services/live-share.ts:30-33`) |
| 8 | Chat RPCs | Yes | token or local id, display name, body, raw 32-byte session on post | a valid share token (`scoresnap/src/services/live-chat.ts:25-46`) |
| 9 | Tournament table writes | Yes, when real auth is on and the session is not anonymous | round, course, group, player name, handicap, scores | score sync, add round, and group sync (`scoresnap/src/stores/contest-store.ts:193-196`, `294`, `319`) |
| 10 | `course-data` then GolfCore | Yes, when the feature flag is on and the query is at least 2 characters | search text or slug; server adds the GolfCore call on cache miss. A separate tap can open `https://www.golfcore.org/` in the browser (`scoresnap/src/ui/CourseSearch.tsx:533`) | `COURSE_SEARCH_ENABLED` (`scoresnap/src/services/course-api.ts:22-24`) |
| 11 | RevenueCat and store billing UI | Yes, when the native module and API key exist | SDK configure, offerings, customer info, purchase, restore, paywall, customer center | keys and native module (`scoresnap/src/services/purchases.ts:66-79`, `scoresnap/app/paywall.tsx:52`) |
| 12 | Sentry | Yes, outside dev, and outside `/r/` web pages | exceptions, traces, navigation, replay (text and images masked by the 8.4.0 defaults), feedback integration, `enableLogs: true`, `sendDefaultPii: true`, release and environment | `Sentry.init` (`scoresnap/app/_layout.tsx:26-61`, `scoresnap/package-lock.json:7020`) |
| 13 | Expo Updates endpoint | Configured, call not present in app source | not visible in app source | `app.json` updates URL (`scoresnap/app.json:82-87`) |
| 14 | `on-user-signup` | Server-side, if the function is invoked | email and referral content to Resend; rows in `profiles`, `marketing_events`, `automation_log` | invocation is not shown in the app (`scoresnap/supabase/functions/on-user-signup/index.ts:30`, `102`, `186`) |
| 15 | `stripe-webhook` | Server-side, if Stripe calls it | email, amount, subscription id to Supabase and Resend (`to: ALERT_EMAIL`). If Resend is unset, the same alert body is written to the function log (`scoresnap/supabase/functions/stripe-webhook/index.ts:17-19`, `108-113`) | inbound POST (`scoresnap/supabase/functions/stripe-webhook/index.ts:22`, `30`, `69`) |

Checked and not an off-device user-data flow in application source: ML Kit recognize call, pasted scorecard text, local guest join, haptics, bundled fonts, the unused SQLite initializer, the settings toggles that nothing else reads, and the empty Help button. Precise location is read into memory only when `expo-location` loads, and it is not added to the course-search request.

## Sources

Citations are `path:line` in the sections above, against commit `92b6c9b`. The files are:

- `scoresnap/package.json`
- `scoresnap/package-lock.json`
- `scoresnap/app.json`
- `scoresnap/eas.json`
- `scoresnap/app/_layout.tsx`
- `scoresnap/app/auth/sign-in.tsx`
- `scoresnap/app/settings.tsx`
- `scoresnap/app/scan/index.tsx`
- `scoresnap/app/paywall.tsx`
- `scoresnap/app/r/[token].tsx`
- `scoresnap/app/(tabs)/profile.tsx`
- `scoresnap/src/config/auth.ts`
- `scoresnap/src/config/offline.ts`
- `scoresnap/src/config/captcha.ts`
- `scoresnap/src/config/features.ts`
- `scoresnap/src/config/public-share.ts`
- `scoresnap/src/db/supabase.ts`
- `scoresnap/src/db/schema.ts`
- `scoresnap/src/stores/auth-store.ts`
- `scoresnap/src/stores/contest-store.ts`
- `scoresnap/src/stores/settings-store.ts`
- `scoresnap/src/stores/scan-store.ts`
- `scoresnap/src/stores/onboarding-store.ts`
- `scoresnap/src/stores/guest-store.ts`
- `scoresnap/src/services/claude-ocr.ts`
- `scoresnap/src/services/ocr-service.ts`
- `scoresnap/src/services/ml-kit-ocr.ts`
- `scoresnap/src/services/captcha.ts`
- `scoresnap/src/services/turnstile-html.ts`
- `scoresnap/src/components/TurnstileHost.tsx`
- `scoresnap/src/services/live-share.ts`
- `scoresnap/src/services/live-share-snapshot.ts`
- `scoresnap/src/services/live-chat.ts`
- `scoresnap/src/services/live-chat-model.ts`
- `scoresnap/src/services/tournament-sync.ts`
- `scoresnap/src/services/guest-join.ts`
- `scoresnap/src/services/course-api.ts`
- `scoresnap/src/services/purchases.ts`
- `scoresnap/src/ui/LiveShare.tsx`
- `scoresnap/src/ui/ContestJoinCode.tsx`
- `scoresnap/src/ui/CourseSearch.tsx`
- `scoresnap/src/ui/ErrorBoundary.tsx`
- `scoresnap/src/engine/types.ts`
- `scoresnap/supabase/config.toml`
- `scoresnap/supabase/functions/ocr-scorecard/index.ts`
- `scoresnap/supabase/functions/course-data/index.ts`
- `scoresnap/supabase/functions/on-user-signup/index.ts`
- `scoresnap/supabase/functions/stripe-webhook/index.ts`
- `scoresnap/supabase/migrations/20261027000000_live_baseline.sql`
- `scoresnap/supabase/migrations/20261027120000_sync_foundation.sql`
- `scoresnap/supabase/migrations/20261027130000_guest_write_guard.sql`
- `scoresnap/supabase/BASELINE-NOTES.md`
- `scoresnap/docs/CAPTCHA.md`
