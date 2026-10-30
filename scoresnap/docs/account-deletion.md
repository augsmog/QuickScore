# Account deletion

Settings → Delete Account asks for confirmation, then calls the `delete-account` edge function and, only after that succeeds, clears on-device storage. The function does not take a user id. It verifies the bearer JWT with Supabase Auth and uses `user.id` from that check. That id is the JWT `sub`, which is the value `auth.uid()` returns in Postgres. `auth.admin.deleteUser` is called with that id only. A body or query id is discarded.

Scores live on `score_events` and `contest_players.scores`. There is no `hole_scores` table. `profiles.id` cascades when the auth user is deleted; the other foreign keys to `auth.users` are `NO ACTION`, so those references are removed or moved first.

The edge function calls `purge_account` once. That function is `SECURITY DEFINER` and runs the contest, score, profile, and referral changes in one transaction. A failure rolls the whole purge back. `auth.admin.deleteUser` runs only after that call returns. The migration that creates `purge_account` is `20261028223000_account_purge.sql`. It is not applied to the live database.

`owner_id` on `contests` and `published_rounds` is `NOT NULL` and references `auth.users`. A contest can stay up only when another account can own it. A contest whose only account is the caller is deleted, including a round that also has guest players with a null `user_id`.

## Deleted

Rows that belong only to the caller are removed.

| Table | What happens |
| --- | --- |
| `auth.users` | The caller is deleted with the Auth admin API. |
| `profiles` | The caller's row is deleted, including `referred_by` and `referral_code`. Deleting the auth user also cascades this row. |
| `scans` | Rows with the caller's `user_id` are deleted. |
| `marketing_events` | Rows with the caller's `user_id` are deleted, including their `campaign`. |
| `feedback` | Rows with the caller's `user_id` or `user_email` are deleted. |
| `contest_memberships` | The caller's memberships are deleted. |
| `contest_join_requests` | Requests the caller made are deleted. |
| `operation_receipts` | Receipts whose `actor` is the caller are deleted. |
| `settlements` | A row is deleted when both `from_user_id` and `to_user_id` are the caller, or the other side is already null. |
| `contests` | Deleted when the caller owns it and no other auth user is a player or member. |
| `contest_players` | Cascade when that contest is deleted. |
| `score_events` | Deleted before the contest. `round_id` references `contest_rounds` with `ON DELETE RESTRICT`, so a contest delete alone can fail while those rows still point at a round. |
| `published_rounds` | Cascade when that contest is deleted. |
| `share_links` | Cascade with the published round. |
| `round_messages` | Cascade with the published round. |
| `contest_memberships`, `contest_join_requests`, `operation_receipts` | Also cascade with that contest. |

## Anonymized or reassigned

Rows other players still need are kept. The caller's name on a surviving round becomes `Deleted player`. Scores stay.

| Table | What happens |
| --- | --- |
| `contests` | When another account is on a contest the caller owns, `owner_id` moves to that account (lowest user id). |
| `contest_players` | On a surviving contest, a row is renamed to `Deleted player` and its `user_id` becomes null only when `user_id` is the caller, or when the caller's membership `player_id` points at that row and the row's `user_id` is the caller or null. `scores` and `putts` are not updated. A guest name the owner typed has a null `user_id` and no membership, so the name, snapshot, and chat stay. `sync_round_bundle` stamps `auth.uid()` on the roster row whose payload has `host: true`, and only when that row's `user_id` is null or already the owner. The client does not send a user id. Signup does not write `profiles.display_name`. A contest with no other account is deleted, guests included. |
| `score_events` | On a surviving contest, `strokes`, `hole`, and `player_id` stay. `entered_by` moves to the contest owner. `actor` is cleared when it was the caller. |
| `published_rounds` | `owner_id` moves with the contest when it was the caller. Every published row for that contest is updated, including when a contest has more than one. In each `snapshot`, a `displayName` becomes `Deleted player` when it matches the caller's player name after `trim().slice(0, 80)`, the cut the publisher stores. Score numbers in the snapshot stay. |
| `round_messages` | `display_name` becomes `Deleted player` when that same cut matches the caller's player name. The message body stays. |
| `share_links` | Kept when the contest stays. They have no user id. |
| `contest_join_requests` | `decided_by` is set null when the caller decided someone else's request. |
| `settlements` | The caller's `from_user_id` or `to_user_id` is set null when the other side is someone else. `scan_id` is set null when it pointed at the caller's scan. `amount_cents` stays. |
| `revenue_events` | `customer_email` is set null when it matches the profile email. Matching text in `metadata` is replaced. The amount stays. There is no user-id column. |
| `profiles` | Another profile whose `referred_by` equals the caller's `referral_code` has `referred_by` set to null. The rest of that profile stays. |
| `marketing_events` | Rows that belong to someone else but store the caller's email or `referrer_id` have that value removed. `campaign` is set to null when it equals the caller's `referral_code`. `properties.referred_by` and `properties.referral_code` are set to null when they equal that same code. The event row stays. `profiles` has no `properties` column; the referral link on a profile is the `referred_by` column. |
| `automation_log` | The caller's email is replaced in `title` and `details`. A `Referral:` or `Code:` value becomes `[deleted]` when the whole token equals the caller's referral code, whatever that code's length or format is (`SS-AUG10`, `friend.ref`). A longer token that only starts with it stays. The log row stays. There is no user-id column. |
| `round_scorer_scopes` | Rows whose `user_id` is the caller are deleted. `user_id` references `auth.users` with no `ON DELETE`, so the auth user cannot be removed while they remain. |
| `group_submissions` | `submitted_by` moves to the contest's current owner after ownership has transferred. It is `NOT NULL` and cannot be cleared. Score revisions on the row stay. |
| `round_player_assignments` | No auth user id. The row stays with an anonymized player. It cascades when the contest is deleted. |
| `contest_groups`, `contest_rounds` | No auth user id. They cascade with the contest. |
| `sync_id_map` | `local_id` is a client id, not an auth user. The row stays on a surviving contest and cascades when the contest is deleted. |

A published name is `contest_players.name.trim().slice(0, 80)`, which is the string the shared-round publisher writes. Snapshot `displayName` and chat `display_name` are compared after that same cut, so a name with surrounding spaces and a name longer than 80 characters still match. Another player on the same round whose published name is the same is relabeled too.

## Left alone

`daily_metrics`, `funnel_snapshots`, `content_performance`, `content_insights`, `golfcore_usage`, `golfcore_usage_drift`, `course_catalog`, `course_search_cache`, and `improvement_actions` have no per-user identity to delete. Other people's profiles, scans, scores, and names stay, except a `referred_by`, `campaign`, `properties.referred_by`, `properties.referral_code`, or `Referral:` / `Code:` value that is the caller's referral code.

## Device

The app calls the function only when real auth is configured and the session has an access token. If real auth is on and the token is missing, deletion throws and Settings shows an error. The device is not wiped, and the screen does not return to onboarding, because the server account is still there. Offline mode has no server account, so that path does not call the function.

After the function returns `{ deleted: true }`, the app removes every persisted key and drops persist writes while it resets memory and signs the Supabase session out. A late `SIGNED_OUT` event does not write those keys back. The keys are:

- `snapscore-auth`
- `snapscore-contests`
- `snapscore-settings`
- `snapscore-scans` (the scan store key; the old `snapscore-scan` key is not a store)
- `snapscore-onboarding`
- `snapscore-guest`
- `snapscore.chat.session.v1`
- `snapscore.chat.name.v1`

The in-memory chat session is cleared so it is not written again during sign-out.

## What the owner still has to approve

Nothing here is deployed or applied to the live database, and no secret is changed.

1. Apply `20261028223000_account_purge.sql` on the live database only after it is approved. Until that function exists, `delete-account` cannot purge. The rollback is `supabase/rollback/20261028223000_account_purge.down.sql`. This change does not apply it.
2. Deploy the `delete-account` edge function. `verify_jwt` is true. It uses `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, which the platform injects.
3. Deploy `stripe-webhook` so signature checks run. Set `STRIPE_WEBHOOK_SECRET` to the Stripe webhook signing secret if it is not already set. Until that value is present, the function rejects every delivery with HTTP 400. Do not put the secret in the repo. `verify_jwt` is false because Stripe does not send a Supabase JWT.
