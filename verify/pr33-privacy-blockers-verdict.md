# PR #33 verification at dc11b519

Independent review of [PR #33](https://github.com/augsmog/QuickScore/pull/33) (`snapscore/privacy-blockers`) at `dc11b519e083683ee6d635b543a5f911234c17aa`. This branch does not modify that PR or PR #31. Nothing was deployed.

**Overall: PASS-WITH-FIXES**

| Item | Verdict |
| --- | --- |
| 1. JWT-only delete-account | **PASS** |
| 2. Schema coverage and shared-round anonymization | **PASS-WITH-FIXES** |
| 3. Sentry masks, `sendDefaultPii`, id-only user | **PASS** |
| 4. Stripe raw body, `constructEventAsync`, HTTP 400 | **PASS** |
| 5. CI at that SHA and local `npm test` | **PASS** |
| 6. Consistency with PR #31 drafts at d5d3b97 | **PASS-WITH-FIXES** |
| Camera / `RECORD_AUDIO` | **PASS** |

Evidence below is from the tree at `dc11b519` unless a line is explicitly from PR #31 at `d5d3b97`.

Independent checks, separate from the PR's own suite, are in `verify/pr33-independent-checks.ts`. They call `handleDeleteAccount` and `purgeAccount` against the in-memory admin stand-in, and `handleStripeWebhook` against Stripe SDK 17 `constructEventAsync`. Command: `NODE_PATH=scoresnap/node_modules node --import tsx verify/pr33-independent-checks.ts`. Result: `pr33 independent checks passed`.

## 1. JWT-only delete-account — PASS

`handleDeleteAccount` reads the bearer token, discards the body with `req.text()`, and purges `caller.id` from `getUser` only after a UUID check.

```29:37:scoresnap/supabase/functions/delete-account/handler.ts
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  // Discard the body so a user id in it cannot be forwarded.
  await req.text();
  const caller = await deps.getUser(token);
  if (!caller?.id || !USER_ID.test(caller.id)) return json({ error: "unauthorized" }, 401);
  try {
    await deps.purge(caller.id);
```

The handler never reads `searchParams` or `body.userId`. `config.toml` sets `verify_jwt = true` for this function (`scoresnap/supabase/config.toml:61-62`). The client posts `body: {}` (`scoresnap/src/services/delete-account.ts:13-16`).

The independent check posted `?userId=<victim>` and a JSON body naming the victim, with `getUser` returning the caller. Status was 200. `purge` and `deleteAuthUser` each received only the caller id. A missing `Authorization` header, `Bearer` with an empty token, a non-UUID `getUser` result, and an unknown token each returned 401, and `purge` was not called again.

A second fixture purged caller `11111111-1111-4111-8111-111111111111` while victim `22222222-2222-4222-8222-222222222222` owned a private contest, scan, profile, score, receipt, and membership. After `purgeAccount`, none of the auth.users foreign-key columns in that stand-in still held the caller id. The victim's contest owner, private score strokes, scan, profile, receipt, and membership stayed.

Residual, same item: `deleteServerAccount` returns without calling the function when real auth is off or the session has no access token (`scoresnap/src/services/delete-account.ts:10-12`). `performAccountDeletion` then treats that return as success and wipes the device (`scoresnap/src/services/account-deletion.ts:12-13`, `scoresnap/app/settings.tsx:233-238`). That path cannot name another user. It can skip server deletion for the caller and still navigate to onboarding.

## 2. Schema coverage and shared-round anonymization — PASS-WITH-FIXES

### Tables

Public tables in `scoresnap/supabase/migrations/20261027000000_live_baseline.sql` plus `20261027120000_sync_foundation.sql`:

| Table | User-linked column | Where `account-deletion.md` covers it |
| --- | --- | --- |
| `profiles` | `id` → `auth.users` ON DELETE CASCADE; `email` | Deleted, line 16 |
| `scans` | `user_id` | Deleted, line 17 |
| `marketing_events` | `user_id` | Deleted, line 18; other rows scrubbed, line 47 |
| `feedback` | `user_id`, `user_email` | Deleted, line 19 |
| `contest_memberships` | `user_id` NOT NULL → `auth.users` | Deleted, line 20 |
| `contest_join_requests` | `requester`, `decided_by` | Deleted, line 21; `decided_by` nulled, line 44 |
| `operation_receipts` | `actor` NOT NULL → `auth.users` | Deleted, line 22 |
| `settlements` | `from_user_id`, `to_user_id` | Deleted or nulled, lines 23 and 45 |
| `contests` | `owner_id` NOT NULL | Deleted or reassigned, lines 24 and 38 |
| `contest_players` | `user_id` | Cascade or renamed, lines 25 and 39 |
| `score_events` | `entered_by` NOT NULL, `actor` | Cascade or reassigned, lines 26 and 40 |
| `published_rounds` | `owner_id` NOT NULL | Cascade or reassigned, lines 27 and 41 |
| `share_links` | none (cascade from the round) | Lines 28 and 43 |
| `round_messages` | `display_name` (no `auth.users` FK) | Lines 29 and 42 |
| `revenue_events` | `customer_email` | Line 46 |
| `automation_log` | email text in `title` / `details` | Line 48 |

`operation_receipts.result` from `write_score` is status, version, strokes, and revision (`20261027120000_sync_foundation.sql:172-179`). Deleting the actor's receipts removes that payload.

Left-alone tables in `account-deletion.md:54` (`daily_metrics`, `funnel_snapshots`, `content_performance`, `golfcore_usage`, `golfcore_usage_drift`, `course_catalog`, `course_search_cache`, `improvement_actions`) have no user id, owner id, or email column. Views `channel_effectiveness`, `content_insights`, `feedback_themes`, `funnel_health`, `golfcore_usage_summary`, and `golfcore_usage_summary_v2` aggregate those tables. `content_insights` is named in the left-alone list. The other views are not stored copies of a user row.

**No public table that stores a user id, owner id, or email is absent from `scoresnap/docs/account-deletion.md`.**

Two columns on tables the doc already names are omitted, and a successful purge leaves them:

- `profiles.referred_by` (`live_baseline.sql:203`) stores another account's `referral_code` (`on-user-signup/index.ts:99-107`). `referral_code` is UNIQUE (`live_baseline.sql:325`). `deleteProfile` removes only the caller's row (`supabase-repo.ts:212-214`). Other profiles keep `referred_by`.
- `marketing_events.campaign` (`live_baseline.sql:185`) is set to that same referral code (`on-user-signup/index.ts:138`). `scrubMarketingEmail` rewrites `properties` for `email`, `referrer_email`, and `referrer_id` (`supabase-repo.ts:157-178`) and does not update `campaign`.

### Names

Exact `contest_players.name` matches are replaced. In the independent fixture, display name `Casey` became `Deleted player`, the raw chat name ` Augie ` became `Deleted player`, and the message body stayed. Victim chat name `Blair` stayed. That matches `account-deletion.md:42` and `:50`.

The publisher does not store that raw name. `buildSnapshot` writes `p.name.trim().slice(0, 80)` for players and for game standings (`scoresnap/src/services/live-share-snapshot.ts:65` and `:69`). `sanitize_shared_round` also cuts `displayName` to 80 characters (`live_baseline.sql:822` and `:831`). `anonymizeDisplayNames` compares the raw player name (`purge.ts:38-51`).

The independent purge used player name ` Augie ` (published `Augie`) and an 81-character name (published as 80 `N`s). After a successful purge of the caller:

- snapshot player `displayName` was still `Augie`
- the 80-character snapshot name was still the 80-character string
- game standings `displayName` was still `Augie`
- chat `display_name` `Augie` (the published form, not the raw player name) stayed `Augie`

Settings copy states the shared-round name becomes "Deleted player" (`scoresnap/app/settings.tsx:696`). That sentence is false for a name with surrounding whitespace or more than 80 characters. `account-deletion.md:41` says the snapshot `displayName` becomes `Deleted player` and does not mention the trim or the 80-character cut.

### Foreign keys

`auth.users` references are NO ACTION except `profiles.id` ON DELETE CASCADE (`live_baseline.sql:357-385`, `sync_foundation.sql:22`, `:33`, `:36`, `:40`, `:56`). On the success path the purge nulls or moves each of those columns before `deleteAuthUser` (`handler.ts:36-37`). The in-memory purge left no caller id in those columns. A mid-purge throw returns 500 and does not delete the auth user (`handler.ts:38-39`), so a failed run leaves the user in place rather than an orphaned FK.

`anonymizeSnapshots` loads the snapshot with `.maybeSingle()` (`supabase-repo.ts:82`). `published_rounds` is unique on `(owner_id, local_id)` (`live_baseline.sql:327`), so one contest can have two published rows. A second row makes that read fail, the purge throws, and the account stays. The in-memory stand-in does not model that PostgREST error.

Required fix: anonymize the string the snapshot and chat actually store (`trim` and the 80-character cut), and document or clear `profiles.referred_by` and `marketing_events.campaign`. Load every published snapshot for the contest, not `maybeSingle()`.

## 3. Sentry — PASS

`sentrySendDefaultPii` is `false` (`scoresnap/src/config/sentry-privacy.ts:10`). `sentryReplayMask` sets `maskAllText`, `maskAllImages`, and `maskAllVectors` to `true` (`sentry-privacy.ts:12-16`). Both asserts run at import (`sentry-privacy.ts:32-33`) and again before `Sentry.init` (`scoresnap/app/_layout.tsx:23-24`). Init passes `sendDefaultPii: sentrySendDefaultPii` (`_layout.tsx:41`) and `mobileReplayIntegration(sentryReplayMask)` (`_layout.tsx:55`).

`scrubSentryEvent` keeps `user` only when `id` is a non-empty string, and then the object is `{ id }` (`sentry-privacy.ts:39-44`). `beforeSend` scrubs before the dev filter (`_layout.tsx:61-64`). A search of `scoresnap` for `Sentry.setUser` / `setUser(` found no call site. The independent check fed an event with id, email, username, name, and IP and got `{ id }` back. An event whose user had only an email lost `user`.

`enableLogs: true` remains (`_layout.tsx:42`). This item does not require that flag to change.

## 4. Stripe signature — PASS

The handler reads the raw body and verifies before `processEvent`. Failure returns HTTP 400.

```11:14:scoresnap/supabase/functions/stripe-webhook/handler.ts
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  const verified = await verifyStripeWebhook(rawBody, signature, deps.webhookSecret, deps.constructEventAsync);
  if (!verified.ok) return new Response("invalid signature", { status: 400 });
```

`verifyStripeWebhook` returns `missing_secret` or `missing_signature` before the SDK call, and passes the raw body into `constructEventAsync` with a 300 second tolerance (`verify.ts:18-32`). `index.ts` wires `stripe.webhooks.constructEventAsync` (`index.ts:155-160`) and reads `STRIPE_WEBHOOK_SECRET` from the environment (`index.ts:156`). `verify_jwt` is false for this function (`config.toml:64-65`).

The independent check used Stripe's own `constructEventAsync` and `generateTestHeaderString` with secret `whsec_audit_only_not_a_live_secret` (that string is only in the verifier, not in `index.ts`). A valid signature returned 200 and `processEvent` ran once. A missing header, a tampered `v1`, a timestamp 1000 seconds old, and a missing secret each returned 400, and `processEvent` did not run again.

Repo search for `whsec_`, `sk_live`, and `sk_test_` hits two placeholders: `sk_test_placeholder` when `STRIPE_SECRET_KEY` is unset (`index.ts:17`), and `whsec_test_only_not_a_real_secret` in `tests/stripe-webhook.scenario.ts`. `index.ts` does not contain `whsec_` or `JSON.parse`.

## 5. CI and local tests — PASS

GitHub Actions for commit `dc11b519e083683ee6d635b543a5f911234c17aa`, all `completed` / `success`:

| Workflow | Run |
| --- | --- |
| iOS boot smoke | [40603172545](https://github.com/augsmog/QuickScore/actions/runs/40603172545) |
| Tournament E2E | [40603172567](https://github.com/augsmog/QuickScore/actions/runs/40603172567) |
| Schema drift | [40603172485](https://github.com/augsmog/QuickScore/actions/runs/40603172485) |
| Web smoke | [40603172569](https://github.com/augsmog/QuickScore/actions/runs/40603172569) |

Those are the four workflows in `.github/workflows`. Local `npm test` in `scoresnap/` at this SHA: **24 suites, 365 tests, all passed.**

## 6. PR #31 drafts at d5d3b97 — PASS-WITH-FIXES

PR #31 at `d5d3b97d1e8ee8198b6129e78ad4bc9e5dc8f0bc` describes commit `92b6c9b` (`privacy-policy.md:3`). After #33 merges, the sentences below are false as a description of the source tree. This review does not edit those files.

`account-deletion.md:73-76` still says the function is not deployed and that `STRIPE_WEBHOOK_SECRET` must be set in the host. A rewrite of #31 has to describe the new source without saying the hosted project already deletes accounts or already verifies Stripe.

### `scoresnap/docs/privacy-policy.md` at d5d3b97 — lines that must change

| Line | Claim that #33 makes false |
| --- | --- |
| 3 | The draft describes commit `92b6c9b`. |
| 12 | Account deletion does not delete the server account; `deleteUser` is a TODO; there is no deletion job. |
| 13 | The local wipe removes `snapscore-scan` and misses `snapscore-scans`, `snapscore-guest`, and the two chat keys. |
| 14 | The wipe's sign-out writes `snapscore-auth` and `snapscore-contests` back. Deletion now uses `wipeLocalAccount`, which suppresses those writes (`wipe-local-account.ts:19-36`). |
| 21 | `sendDefaultPii: true` and `mobileReplayIntegration()` with no options. Keep the `enableLogs: true` clause (`_layout.tsx:42` is still true). |
| 22 | Android `RECORD_AUDIO` is declared twice at `app.json:33-38`. |
| 30 | The webhook parses JSON and the signature check is a comment (`stripe-webhook/index.ts:54-63` at `92b6c9b`). |
| 32 | `sendDefaultPii` is true and replay is called with no options. Keep the `enableLogs: true` clause. |
| 114 | `STRIPE_WEBHOOK_SECRET` and `stripe-signature` are read and unused. |
| 126 | `sendDefaultPii: true`. |
| 130 | `mobileReplayIntegration()` is called with no options and does not override the SDK defaults. The call is now `mobileReplayIntegration(sentryReplayMask)` with all three masks true. |
| 197 | Delete Account removes five keys including `snapscore-scan`, then `signOut`, and does not call Supabase to delete the user. |
| 201 | There is no in-app form that submits a deletion request to a server; server deletion is only by email to augie@autumn8.me or the support URL. |
| 234 | The Sentry row says `sendDefaultPii: true`. |

Line 201 must say the settings control calls `delete-account` with the session JWT, and that email to augie@autumn8.me or https://snapscore.autumn8.me/support remains the path for data the function leaves (trimmed or over-long snapshot names, other profiles' `referred_by`, `marketing_events.campaign`) and for a host that has not deployed the function. The contact and the support URL themselves stay.

### `scoresnap/docs/app-store-privacy-labels.md` at d5d3b97 — lines that must change

| Line | Claim that #33 makes false |
| --- | --- |
| 63 | Customer Support linked Yes because `sendDefaultPii: true`. |
| 77 | Sentry is initialized with `sendDefaultPii: true` and no privacy options (`_layout.tsx:37-52`). |
| 100 | Product Interaction linked Yes because `sendDefaultPii` is true (`_layout.tsx:37`). |
| 108 | Performance Data linked Yes because `sendDefaultPii` is true. |
| 121 | `mobileReplayIntegration()` is called with no options, and `sendDefaultPii: true` stays disclosed. Keep the `enableLogs: true` clause. |
| 122 | Other Data linked Yes because `sendDefaultPii` is true. |
| 146 | `RECORD_AUDIO` is in the Android permission list twice (`app.json:33-38`). |
| 172 | Confirm-before-submit item 1: `sendDefaultPii: true`, replay called with no options. |
| 176 | Confirm-before-submit item 5: Android `RECORD_AUDIO` entries are unused. |

### Claims in those drafts that stay true

- `enableLogs: true` (`_layout.tsx:42`). Do not delete that disclosure on lines 21, 32, 127, 130, 161, or 234 of the policy, or line 121 of the labels.
- The in-app Privacy Policy control still opens `https://august-industries.com/snapscore/privacy` (`settings.tsx:584`, `auth/sign-in.tsx:613`). Terms still open `https://august-industries.com/snapscore/terms` (`settings.tsx:604`, `auth/sign-in.tsx:610`). The draft's settings citations say line 610; that number moved. The URL did not.
- Contact augie@autumn8.me, support https://snapscore.autumn8.me/support, and privacy https://snapscore.autumn8.me/privacy.
- No retention schedule (`privacy-policy.md:15` and `:193`). Application source still does not insert into `scans` or `feedback`.

## Camera — PASS

`app.json` Android `permissions` contains `android.permission.CAMERA` only (`app.json:33-35`). The `expo-camera` plugin sets `recordAudioAndroid` to false (`app.json:45-49`). `NSCameraUsageDescription` remains (`app.json:20`). A search of `app.json` finds no `RECORD_AUDIO`.

## Fixes required before calling this privacy work done

1. Anonymize snapshot and chat names with the same `trim` and 80-character cut the publisher uses (`live-share-snapshot.ts:65`, `:69`, `purge.ts:49`).
2. Clear or document `profiles.referred_by` on other rows and `marketing_events.campaign`.
3. Read every `published_rounds` row for a contest in `anonymizeSnapshots` (`supabase-repo.ts:82`).
4. Update the PR #31 lines listed in item 6 after #33 merges. Say the repository calls `delete-account` and verifies Stripe. Keep the statement that deploy and `STRIPE_WEBHOOK_SECRET` are still owner steps (`account-deletion.md:73-76`).
