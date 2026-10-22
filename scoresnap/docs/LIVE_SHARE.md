# GS-14 slice 1: live scoreboard

Organizer signs in with real Supabase auth and taps **Share live scoreboard**. The owner RPC creates a server contest mapping for the local ID, publishes an allowlisted snapshot, and returns a fresh 64-character capability (two cryptographically random UUIDs). Only its SHA-256 hash is stored. Each copy creates a new link; **Revoke live links** revokes every link for that round. Tokens stay in UI memory, not persisted in the contest store.

The public `/r/<token>` web page needs no login or onboarding. It shows display names, hole scores, totals, relative-to-par scores and provisional game results (settlement engine at a one-unit stake, no private betting amounts). No course/location, contact details, IDs, handicaps or raw contest data are published. Names are organizer-selected display names; organizers should avoid putting contact information in them.

Slice 1 uses **10-second polling**, not Realtime subscriptions. Every fetch verifies token, revocation and expiry on the server. On errors the viewer clears the displayed snapshot; network recovery retries automatically. Revocation becomes visible on the next poll. Score changes publish serially, including imports, edits, auxiliary data and completion, only for enabled shares with real auth. Offline builds never publish. The open organizer screen retries every 10 seconds after sync failure. Keep that device online with the round open; background/device-independent sync is deferred.

Completion is the first server-observed `completed` snapshot. Links expire seven days after that timestamp, which is immutable even if the local status is changed back. Active-round links have `infinity` expiry until completion is published. An offline completion cannot reach the server until reconnect; the host can revoke immediately once online. No tokens or snapshots are logged by this feature; Sentry is disabled on public web share pages. Configure the web host to redact `/r/*` request paths from access logs, send `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and `X-Robots-Tag: noindex, nofollow`. Never cache token RPC responses at a proxy. The page also sets referrer and robots metadata.

Chat for anyone with the link (display name, moderation and rate limiting) is slice 2. Guest cross-device scoring is slice 3. Viewer sessions, private Realtime notifications, rotation UI, background retries, conflict/version handling and independent SQL security integration verification are deferred. No paid services are required.

## Apply manually (Tater; not performed by Codex)

1. Back up the target Supabase database and test these steps on a disposable development project first. Review `002_contest_sharing_draft.sql`: it is an unapplied prerequisite, not an instruction to enable guest sync.
2. In Supabase Dashboard → SQL Editor, run `select to_regclass('public.contests'), to_regclass('public.contest_guests');`. If both are absent, paste and execute **only** `supabase/migrations/002_contest_sharing_draft.sql`. If either exists, compare its schema against 002 before proceeding; do not recreate existing tables or blindly run all migrations.
3. Paste the full `supabase/migrations/003_live_share.sql` into SQL Editor and execute once. It is transactional. Record successful application in your deployment migration ledger; do not rerun it.
4. Verify RLS is enabled and neither `anon` nor `authenticated` has direct table access to `published_rounds` or `share_links`. Verify anonymous callers can execute only `get_shared_round`, and all three mutation RPCs reject missing auth or a different owner's local mapping. Confirm no broad policies inherited from a different schema expose these tables or `contests`.
5. Configure the app's existing `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, with `EXPO_PUBLIC_OFFLINE_MODE=false`. Never put a service-role key in the app. For native organizers set `EXPO_PUBLIC_WEB_URL` to your HTTPS web deployment origin.
6. Export/deploy Expo web with an SPA rewrite for `/r/*` and the headers/log redaction above. Sign in as an organizer, create a link, and open it in an isolated anonymous browser. Change a score and verify it updates within 10 seconds. Test reconnect, revoke, completion/expiry, guessed tokens, cross-owner RPC calls and denied direct table reads/writes before going live.

## Verification

From `scoresnap/`: `npm test -- --runInBand`.

For the mocked browser test, export with `EXPO_PUBLIC_OFFLINE_MODE=true npx expo export --platform web --output-dir dist-web`, install Chromium with `npx playwright install chromium`, start `node e2e/serve.mjs`, then run `node e2e/live-share.mjs`. It covers anonymous entry, scoreboard rendering, polling expiry and revocation; it does not validate deployed SQL/RLS. This check is also wired into web-smoke CI.
