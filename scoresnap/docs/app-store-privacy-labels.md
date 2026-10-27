# SnapScore App Store privacy labels (draft from code)

Draft dated 27 October 2026 for the nutrition label in App Store Connect. It maps data the SnapScore code actually collects to Apple's categories. It describes commit `92b6c9b`. Do not paste these answers into App Store Connect until the owner decisions in `docs/privacy-policy.md` are settled. This file does not change the app.

Apple's form asks, for each collected data type: linked to the user's identity (yes/no), used for tracking (yes/no), and purposes. "Collected" here means the code transmits it off the device or stores it on a server. Data that stays in memory on the device is listed under "Do not check" so it is not forgotten.

**Used for tracking** is **No** for every row. The dependency list has no advertising SDK, and application source has no App Tracking Transparency prompt and no call that sends data to an ad network or data broker (`scoresnap/package.json:14-55`). That answer describes this repository. It does not describe Sentry, RevenueCat, Apple, Google, Anthropic, Cloudflare, or Supabase dashboard settings, which are not in the repo. If a vendor account enables their advertising product, change that row before submission.

**Purposes** use Apple's set: Third-Party Advertising, Developer's Advertising or Marketing, Analytics, Product Personalization, App Functionality, Other Purposes. Third-Party Advertising and Product Personalization are not selected anywhere. Nothing in the app personalizes content from a profile of interests.

## Recommended answers

Check these types. Leave the rest unchecked unless the "Confirm before submitting" section changes your mind.

### Contact Info — Email Address

- **Collected:** Yes, when the person creates or signs into an email account, when Apple or Google returns an email and real auth is on, and when the signup or Stripe functions run.
- **Linked to identity:** Yes. The email is stored on the Supabase user and on `profiles` (`scoresnap/src/stores/auth-store.ts:144-150`, `scoresnap/supabase/migrations/20261027000000_live_baseline.sql:551-561`, `192-211`).
- **Used for tracking:** No.
- **Purposes:** App Functionality. Also Developer's Advertising or Marketing, because `on-user-signup` sends a welcome message and a referral reward that offers a free month of Premium (`scoresnap/supabase/functions/on-user-signup/index.ts:24-65`, `158-176`). Also Analytics, because that function writes `marketing_events` with the email and increments a daily signup counter (`scoresnap/supabase/functions/on-user-signup/index.ts:186-207`).
- The local fallback profiles `golfer@apple.com` and `golfer@gmail.com` are written only on the device when real auth is off (`scoresnap/src/stores/auth-store.ts:87-99`, `117-129`). Those literals are not the user's email.

### Contact Info — Name

- **Collected:** Yes for the account name. Email sign-up sends `full_name` to Supabase (`scoresnap/src/stores/auth-store.ts:146`). Apple sign-in requests `FULL_NAME` (`scoresnap/app/auth/sign-in.tsx:69-72`). This code does not copy Apple's returned full name into Supabase metadata; it sends the identity token (`scoresnap/src/stores/auth-store.ts:80-83`).
- **Linked to identity:** Yes for the name sent as `full_name` on the auth user.
- **Used for tracking:** No.
- **Purposes:** App Functionality.
- Player names typed or read from a scorecard are under User Content, not this row. They are not verified as the account holder's name (`scoresnap/src/services/live-share-snapshot.ts:63-65`).

### User Content — Photos or Videos

- **Collected:** Yes, when cloud OCR runs. The photo is base64-encoded and posted to the `ocr-scorecard` function, which posts it to `https://api.anthropic.com/v1/messages` (`scoresnap/src/services/claude-ocr.ts:22-38`, `scoresnap/supabase/functions/ocr-scorecard/index.ts:114-136`).
- **Not every photo.** The upload is skipped only when ML Kit returns at least two players with average confidence of 0.7 or higher (`scoresnap/src/services/ocr-service.ts:54-67`). Claude also runs for one player at any confidence, for a zero-player ML Kit result, and when ML Kit is unavailable or throws (`scoresnap/src/services/ocr-service.ts:46`, `70-73`, `106-115`). Web and offline mode use a text box and do not upload an image (`scoresnap/app/scan/index.tsx:152-177`). The ML Kit wrapper itself has no network call (`scoresnap/src/services/ml-kit-ocr.ts:30-34`).
- **Linked to identity:** Yes. The function rejects the request unless `supabase.auth.getUser` accepts the bearer token (`scoresnap/supabase/functions/ocr-scorecard/index.ts:49-75`). The function does not write the image, or the user id, into a table (`scoresnap/supabase/functions/ocr-scorecard/index.ts:208-210`). The link is the authenticated request, not a stored photo library.
- **Used for tracking:** No.
- **Purposes:** App Functionality.
- The settings switch "Auto Claude Vision" does not gate this upload (`scoresnap/app/settings.tsx:552-557`, `scoresnap/src/services/ocr-service.ts:36-131`).

### User Content — Other User Content

Use this row for contest content other than chat. Chat is Emails or Text Messages, below. Apple also has Gameplay Content. These records are golf scores and side-game units, not a saved game inside a game engine. Other User Content is the closer category for the scores. Confirm that choice with whoever submits the label.

- **Collected:** Yes when live share or tournament sync runs. The payload is display names, hole scores, totals, score to par, game ids, unit standings, handicaps, and course JSON (`scoresnap/src/services/live-share-snapshot.ts:51-71`, `scoresnap/src/services/tournament-sync.ts:22-127`, `145-155`).
- **Also stored on device** for every contest, even when those network calls are off (`scoresnap/src/stores/contest-store.ts:355`). On-device copies are not a nutrition-label collection by themselves.
- **Linked to identity:** Yes. Both paths require a non-anonymous Supabase session, and share rows are stored under `auth.uid()` (`scoresnap/src/services/live-share.ts:10-12`, `scoresnap/supabase/migrations/20261027000000_live_baseline.sql:689-706`).
- **Used for tracking:** No.
- **Purposes:** App Functionality.
- Anyone with the share token can read the published names and scores (`scoresnap/src/services/live-share.ts:30-33`). The raw URL is copied to the clipboard or passed to the system share sheet (`scoresnap/src/ui/LiveShare.tsx:39-40`).

### User Content — Emails or Text Messages

Apple's category includes in-app messages that are not SMS. Live chat is that.

- **Collected:** Yes. A viewer posts a display name of 1–30 characters and a body of 1–500 characters through `post_message` (`scoresnap/src/services/live-chat.ts:31-35`, `scoresnap/src/services/live-chat-model.ts:4-9`).
- **Linked to identity:** Yes, on the same standard as Other User Content. The post is not tied to a Supabase account. It is stored with a SHA-256 of a random local session (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:669-678`). The host who reads the moderation list is the signed-in owner (`scoresnap/src/services/live-chat.ts:38-39`). Answer **Yes** because the messages are kept with a persistent session identifier and can be read by the account that owns the round. This code does not strip that identifier before the message is stored.
- **Used for tracking:** No.
- **Purposes:** App Functionality.

### User Content — Customer Support

- **Collected:** Not by an app form. Help & Support does nothing (`scoresnap/app/(tabs)/profile.tsx:695`). Sentry's `feedbackIntegration()` is registered with no options (`scoresnap/app/_layout.tsx:52`). Whether that integration shows a form, and what it sends, is not determined in this repo.
- **Recommended checkbox:** leave unchecked until someone runs a production build and sees whether the Sentry feedback widget appears. If it appears, check Customer Support, linked **Yes** (Sentry is configured with `sendDefaultPii: true`), tracking **No**, purpose **App Functionality**.

### Identifiers — User ID

- **Collected:** Yes. Supabase user id is the account id (`scoresnap/src/stores/auth-store.ts:53`, `83`). Live-share and profile rows use `auth.uid()` (`scoresnap/supabase/migrations/20261027000000_live_baseline.sql:557`, `689`).
- **Linked to identity:** Yes.
- **Used for tracking:** No.
- **Purposes:** App Functionality.
- The chat session is a separate 32-byte random id. The server stores only its SHA-256 (`scoresnap/src/services/live-chat.ts:9-15`, `scoresnap/supabase/migrations/20261027000000_live_baseline.sql:669`). It is not the Supabase user id. The local skip-sign-in id (`anon-<timestamp>`) stays on the device (`scoresnap/src/stores/auth-store.ts:206-217`).
- RevenueCat is configured without a SnapScore user id, and `identifyUser` is never called (`scoresnap/src/services/purchases.ts:76-79`, `214-218`, `scoresnap/app/_layout.tsx:127`). Do not tell App Store Connect that the SnapScore account id is sent to RevenueCat. The SDK may still create its own id. That possibility is under Device ID.

### Identifiers — Device ID

- **App code does not read a device identifier, IDFA, or IDFV.**
- Sentry is initialized with `sendDefaultPii: true` and no user and no privacy options (`scoresnap/app/_layout.tsx:37-52`). Expo Updates is configured (`scoresnap/app.json:82-87`). RevenueCat is configured without an app user id (`scoresnap/src/services/purchases.ts:76-79`). What those SDKs attach is not visible in this repository.
- **Recommended checkbox:** check Device ID, linked **Yes**, tracking **No**, purposes **App Functionality** and **Analytics**, until the owner confirms the Sentry and RevenueCat payloads do not include one. Unchecking it requires that confirmation. This draft does not treat that confirmation as already done.

### Purchases

- **Collected:** Yes, when RevenueCat is configured. The app loads offerings, customer info, and the `SnapScore Pro` entitlement, and it can present the paywall and customer center (`scoresnap/src/services/purchases.ts:87-88`, `106-110`, `150-152`, `scoresnap/app/paywall.tsx:52-54`, `scoresnap/app/(tabs)/profile.tsx:132`).
- **Linked to identity:** Yes. Purchases are tied to the store account and to RevenueCat customer info. They are not tied to the SnapScore user id by this code, because `identifyUser` is unused. Answer **Yes** anyway: Apple's "linked" includes association with an identity such as an account, and the store purchase is the user's. Say in the review notes that the app does not pass its own user id into RevenueCat.
- **Used for tracking:** No.
- **Purposes:** App Functionality.
- The app does not read a card number. Payment entry is the native purchase sheet (`scoresnap/src/services/purchases.ts:139-150`).
- If the Stripe webhook is deployed, it stores customer email and amount (`scoresnap/supabase/functions/stripe-webhook/index.ts:68-80`). The mobile binary does not call Stripe. Include those server records if that webhook is live.

### Search History

- **Collected:** Yes, when course search is enabled. The typed query is sent to `course-data` on a request that carries the caller's JWT (`scoresnap/src/services/course-api.ts:12`, `22-25`). For a text search the stored cache key is `search.toString()`, which includes the normalized query, `limit`, and any coverage filter. That key is not the user id (`scoresnap/supabase/functions/course-data/index.ts:50-74`, `115`). The in-memory rate-limit map uses `jwt.sub` or the first `x-forwarded-for` value and a call count, not the query (`scoresnap/supabase/functions/course-data/index.ts:27-32`).
- **Linked to identity:** Yes. The cache row itself is not keyed by user id, and this code has no step that removes the JWT or other identifier before the query is collected. Apple's not-linked bar requires that removal. A single answer of No does not meet it.
- **Used for tracking:** No.
- **Purposes:** App Functionality.
- The feature is off unless `EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true` (`scoresnap/src/config/features.ts:1-2`). If the shipping build leaves the flag off, this type is not collected by the app. Check it if any shipped build has the flag on.

### Usage Data — Product Interaction

- **Collected:** Yes, as Sentry navigation instrumentation and performance transactions on 20% of transactions, plus app-start and stall tracking (`scoresnap/app/_layout.tsx:22-24`, `40-44`, `50-53`).
- **Linked to identity:** Yes as a conservative answer. `sendDefaultPii` is true and there is no `Sentry.setUser` in the app (`scoresnap/app/_layout.tsx:37`). The exact join between a trace and a person is not shown. Answering No requires confirming the Sentry payload is not tied to an account, device, or other identifier.
- **Used for tracking:** No.
- **Purposes:** Analytics and App Functionality.
- Signup rows in `marketing_events` are server-side product events, not in-app analytics taps (`scoresnap/supabase/functions/on-user-signup/index.ts:186-195`). They are covered on the Email row as Analytics.

### Diagnostics — Crash Data

- **Collected:** Yes. Exceptions go to Sentry from the error boundary, purchase failures, auth and purchase init, and a dev-only test button (`scoresnap/src/ui/ErrorBoundary.tsx:26-29`, `scoresnap/src/services/purchases.ts:113`, `scoresnap/app/_layout.tsx:126-127`, `scoresnap/app/(tabs)/profile.tsx:718-727`). Dev events are dropped unless tagged `force_send` (`scoresnap/app/_layout.tsx:57-60`). Public `/r/` pages disable Sentry (`scoresnap/app/_layout.tsx:27`, `scoresnap/src/config/public-share.ts:4-8`).
- **Linked to identity:** Yes, same conservative reading as Product Interaction, because `sendDefaultPii` is true and replay-on-error is 100% (`scoresnap/app/_layout.tsx:37`, `48`).
- **Used for tracking:** No.
- **Purposes:** App Functionality.

### Diagnostics — Performance Data

- **Collected:** Yes. `tracesSampleRate` 0.2, `enableAutoPerformanceTracing`, `enableAppStartTracking`, `enableStallTracking` (`scoresnap/app/_layout.tsx:40-44`).
- **Linked to identity:** Yes, conservative, for the same reason as Crash Data.
- **Used for tracking:** No.
- **Purposes:** Analytics and App Functionality.

### Diagnostics — Other Diagnostic Data

- **Collected:** Yes. Session replay is on for 10% of sessions and 100% of error sessions (`scoresnap/app/_layout.tsx:46-48`). `mobileReplayIntegration()` is called with no options (`scoresnap/app/_layout.tsx:51`). The app pins `@sentry/react-native` 8.4.0 (`scoresnap/package.json:19`, `scoresnap/package-lock.json:7020`). That version defaults `maskAllText`, `maskAllImages`, and `maskAllVectors` to true, and this call does not override them. The recording those defaults produce masks text and images. `sendDefaultPii: true` is a separate setting and stays disclosed (`scoresnap/app/_layout.tsx:37`). `enableLogs: true` is set in the same init (`scoresnap/app/_layout.tsx:38`). `feedbackIntegration()` is also on (`scoresnap/app/_layout.tsx:52`).
- **Linked to identity:** Yes, conservative, because `sendDefaultPii` is true. Masking text and images does not by itself make the replay not linked.
- **Used for tracking:** No.
- **Purposes:** App Functionality and Analytics. Replay samples how a session behaves, which is an analytics use in addition to debugging.

### Financial Info — Other Financial Info

- **Collected:** Yes when a live snapshot is published. Game standings include numeric `units`. Those units are computed with the bet-unit argument `1`, not `contest.betUnit` (`scoresnap/src/services/live-share-snapshot.ts:67-70`). The dollar `betUnit` stays on the device (`scoresnap/src/stores/contest-store.ts:39`, `355`). Settings store a default bet unit on the device (`scoresnap/src/stores/settings-store.ts:13`).
- **Linked to identity:** Yes when published, because the snapshot is stored for `auth.uid()`.
- **Used for tracking:** No.
- **Purposes:** App Functionality.
- Stripe amounts, if the webhook runs, belong here too (`scoresnap/supabase/functions/stripe-webhook/index.ts:73-75`).

## Do not check

These were searched and are not collected off the device by the code that shipped in this commit.

| Apple category | Why it stays unchecked |
| --- | --- |
| Contact Info — Phone Number, Physical Address, Other User Contact Info | No phone or address field in the auth profile or signup call (`scoresnap/src/stores/auth-store.ts:9-16`, `136-146`). |
| Health & Fitness | No health type, API, or permission. |
| Financial Info — Payment Info, Credit Info | No card or credit field. Store payment UI is Purchases, above. |
| Location — Precise or Coarse | The course-search UI will request foreground coordinates if `expo-location` loads, then uses them in memory to sort (`scoresnap/src/ui/CourseSearch.tsx:40-51`, `156-160`). `searchCourses` sends only the text query (`scoresnap/src/services/course-api.ts:22-25`). `expo-location` is not in `package.json`. `app.json` has no location purpose string. The edge function accepts `near`, and no app caller passes it (`scoresnap/supabase/functions/course-data/index.ts:54-57`). If a future build sends coordinates, check Precise Location. |
| Sensitive Info | No field for race, religion, sexuality, biometrics, or similar. |
| Contacts | No contacts permission or API. |
| User Content — Audio Data | `RECORD_AUDIO` is in the Android permission list twice (`scoresnap/app.json:33-38`). No application code records audio. Do not check Audio Data unless a build actually records. In-app chat is checked under Emails or Text Messages, above. |
| Browsing History | The only WebView loads the Turnstile challenge (`scoresnap/src/components/TurnstileHost.tsx:64-80`). It does not read browser history. |
| Usage Data — Advertising Data, Other Usage Data | No ad SDK. Product Interaction covers the Sentry navigation and trace data. |
| Identifiers — other than User ID and the conditional Device ID | No separate advertising identifier is read. |

## Tracking and identity, in one place

| Data type | Linked to identity | Used for tracking | Purposes |
| --- | --- | --- | --- |
| Email Address | Yes | No | App Functionality; Developer's Advertising or Marketing; Analytics |
| Name | Yes | No | App Functionality |
| Photos or Videos | Yes | No | App Functionality |
| Other User Content | Yes | No | App Functionality |
| Emails or Text Messages | Yes | No | App Functionality |
| User ID | Yes | No | App Functionality |
| Device ID | Yes, if checked | No | App Functionality; Analytics |
| Purchases | Yes | No | App Functionality |
| Search History | Yes | No | App Functionality |
| Product Interaction | Yes | No | Analytics; App Functionality |
| Crash Data | Yes | No | App Functionality |
| Performance Data | Yes | No | Analytics; App Functionality |
| Other Diagnostic Data | Yes | No | App Functionality; Analytics |
| Other Financial Info | Yes | No | App Functionality |

## Confirm before submitting

1. Device ID and the "linked" flag on Sentry rows. Both are conservative because `sendDefaultPii: true` is on (`scoresnap/app/_layout.tsx:37`). Replay is called with no options, and SDK 8.4.0 masks text and images by default (`scoresnap/app/_layout.tsx:51`, `scoresnap/package-lock.json:7020`). The exact `sendDefaultPii` fields are still not spelled out in this repo.
2. Search History, if the App Store build does not set `EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true` (`scoresnap/src/config/features.ts:1-2`).
3. Developer's Advertising or Marketing on Email, if `on-user-signup` is not deployed. The function is in the repo; the app does not invoke it (`scoresnap/supabase/functions/on-user-signup/index.ts:78-90`).
4. Customer Support, after checking whether the Sentry feedback widget is visible.
5. Audio Data, after confirming the Android `RECORD_AUDIO` entries are unused (`scoresnap/app.json:33-38`).
6. Location, if `expo-location` is later added or the client starts calling `near`.
7. The privacy policy URL the binary opens is `https://august-industries.com/snapscore/privacy` (`scoresnap/app/auth/sign-in.tsx:613`, `scoresnap/app/settings.tsx:610`). This draft is not that page until the owner publishes it. The nutrition label's privacy policy URL has to be a real page. The support URL in the policy is still `[SUPPORT URL — owner to provide]`.

## Sources

Same commit and files as `docs/privacy-policy.md`. The label rows above cite:

- `scoresnap/package.json:14-55` and `scoresnap/package.json:19`
- `scoresnap/package-lock.json:7020`
- `scoresnap/app.json:33-38`, `56-62`, `76-87`
- `scoresnap/app/_layout.tsx:22-68`, `103`, `126-127`, `164`
- `scoresnap/app/auth/sign-in.tsx:27-32`, `69-78`, `98-124`, `613`
- `scoresnap/app/settings.tsx:552-557`, `610`
- `scoresnap/app/scan/index.tsx:76-82`, `101`, `152-177`
- `scoresnap/app/paywall.tsx:52-54`
- `scoresnap/app/(tabs)/profile.tsx:132`, `695`, `718-727`
- `scoresnap/src/config/auth.ts:2`
- `scoresnap/src/config/features.ts:1-8`
- `scoresnap/src/config/public-share.ts:4-8`
- `scoresnap/src/stores/auth-store.ts:53`, `80-99`, `117-129`, `136-180`, `206-217`
- `scoresnap/src/stores/contest-store.ts:355`
- `scoresnap/src/stores/settings-store.ts:13`
- `scoresnap/src/services/claude-ocr.ts:22-38`
- `scoresnap/src/services/ocr-service.ts:36-131`
- `scoresnap/src/services/ml-kit-ocr.ts:30-34`
- `scoresnap/src/services/live-share.ts:10-33`
- `scoresnap/src/services/live-share-snapshot.ts:51-71`
- `scoresnap/src/services/live-chat.ts:9-35`, `38-39`
- `scoresnap/src/services/live-chat-model.ts:4-9`
- `scoresnap/src/services/tournament-sync.ts:22-127`, `145-155`
- `scoresnap/src/services/course-api.ts:12`, `22-25`
- `scoresnap/src/ui/LiveShare.tsx:39-40`
- `scoresnap/src/services/purchases.ts:76-79`, `87-88`, `106-110`, `139-152`, `214-218`
- `scoresnap/src/ui/CourseSearch.tsx:40-51`, `156-160`, `533`
- `scoresnap/src/ui/ErrorBoundary.tsx:26-29`
- `scoresnap/supabase/functions/ocr-scorecard/index.ts:49-75`, `114-136`, `208-210`
- `scoresnap/supabase/functions/course-data/index.ts:27-32`, `50-74`, `115`
- `scoresnap/supabase/functions/on-user-signup/index.ts:24-65`, `78-90`, `158-207`
- `scoresnap/supabase/functions/stripe-webhook/index.ts:10-19`, `30`, `54-63`, `68-80`, `108-113`
- `scoresnap/supabase/migrations/20261027000000_live_baseline.sql:192-211`, `551-561`, `669-706`
