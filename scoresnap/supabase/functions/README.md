Edge functions use Deno URL imports and globals and are excluded from the Expo app's TypeScript entrypoints. Pure handlers imported by app scenarios still typecheck with those scenarios.

With Deno installed, check both entrypoints (without running servers or writing to Supabase):

```sh
cd supabase/functions
deno task check
```

The task is defined in deno.json. Deno was unavailable in the Oct 30, 2026 local fix environment, so that check was not run there. Node integration scenarios additionally require the package.json dependencies, including Stripe.

## Signup onboarding

Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `SIGNUP_WEBHOOK_SECRET`, `EMAIL_FROM`, `EMAIL_REPLY_TO`,
`EMAIL_UNSUBSCRIBE_URL`, `REFERRAL_PREMIUM_REWARD_ENABLED`.

Email defaults: `EMAIL_FROM` is `SnapScore <hello@scoresnap.app>`,
`EMAIL_REPLY_TO` is `hello@scoresnap.app`, and `EMAIL_UNSUBSCRIBE_URL` is
`mailto:hello@scoresnap.app?subject=Unsubscribe%20from%20SnapScore%20emails`.

The repository includes a separate auth INSERT webhook trigger; it preserves
`on_auth_user_created` / `handle_new_user`. Referral Premium rewards default off.
`SIGNUP_WEBHOOK_SECRET` is primary; if unset, the edge function reads the service-only
vault RPC and caches a successful lookup per isolate. Missing secrets return 503
before body parsing. The gateway keeps JWT verification enabled: the trigger uses
a valid service-role JWT from vault (never a publishable/secret API key).

Go-live (operator steps; not executed by this change):

1. Apply `20261101003300_signup_processing.sql`, then
   `20261101003400_signup_webhook_trigger.sql`. The trigger skips calls until configured.
2. In an authorized SQL session, create the vault entries using parameterized SQL:
   `select vault.create_secret($1, 'signup_webhook_secret')` and
   `select vault.create_secret($1, 'signup_webhook_service_jwt')`.
   Generate the shared webhook secret securely without printing it; supply the existing
   project service-role JWT for the second entry. Disable query/parameter logging and
   never echo secret values. Set `app.settings.supabase_url` on the database to the
   project's `https://<project-ref>.supabase.co` URL, and reconnect for it to take effect.
   Match the shared secret in the edge environment if using the primary env override.
3. Deploy `on-user-signup` with JWT verification enabled and the documented env vars.
   Set `RESEND_API_KEY` only when sending is approved. Missing provider configuration
   records failed email status without consuming attempts. Configure email sender settings
   and leave `REFERRAL_PREMIUM_REWARD_ENABLED` unset unless separately approved.
4. Verify a POST with a valid gateway JWT but wrong `x-webhook-secret` returns 401.
   Only then perform an explicitly authorized signup/send test.

Rollback: execute the commented drop statements in
`supabase/rollback/signup_reliability.sql` after review (drop the new trigger, then
its dispatch function), then restore the previous edge deployment if needed. Keep
ledger/profile data, RPCs, vault entries and pg_net; the existing profile trigger remains.

The ledger provides at-most-once profile/referral/analytics processing. A crash after
claiming can leave these effects incomplete; replays intentionally do not repeat them.
Email attempts reserve atomically before transport (maximum three, including uncertain
network outcomes); pending reservations expire after five minutes. Confirmed delivery
updates profile and ledger together in one RPC. Retries use a stable Resend idempotency
key; provider deduplication has a finite retention window, so delivery cannot be promised
exactly once across arbitrarily delayed retries. pg_net is asynchronous and does not
provide a durable retry worker: operators must monitor and replay failed deliveries.
