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

The trigger is NOT wired yet and needs owner approval: a DB webhook on
`auth.users` INSERT or `profiles`, sending `x-webhook-secret` and the
service-role Authorization header. Referral Premium rewards default off.
