# App captcha

Cloudflare Turnstile tokens are public-client credentials, single-use and valid for
about 300 seconds. The app requests a fresh token immediately before each real
Supabase email sign-up or password sign-in. Requests are serialized; each widget
has a request ID, a 20-second timeout, and is removed after completion. Tokens
are never cached or logged. Cancel, expiry, widget errors, missing configuration,
and timeout are verification failures.

Native presents a tappable modal with a WebView, using inline HTML and
`source.baseUrl` from the configured web origin. Web renders directly into the
same modal's DOM, loading the Turnstile script once. No WebView runs on web.
The host only mounts when captcha is enabled. Offline or unconfigured real auth
always disables captcha. Apple/Google ID-token sign-in, refresh, PKCE, and auth
initialization do not request tokens.

## Public build configuration

All values are public and may be committed. Never put a Turnstile secret key in
the app or any EXPO_PUBLIC variable.

| Variable | Default | Behavior |
| --- | --- | --- |
| EXPO_PUBLIC_CAPTCHA_MODE | off | off, optional, or required; unknown values also disable captcha |
| EXPO_PUBLIC_TURNSTILE_SITE_KEY | 0x4AAAAAAFnthkbq7bh9N5bW | Public widget site key; an explicitly empty key fails acquisition |
| EXPO_PUBLIC_TURNSTILE_BASE_URL | https://snapscore-web.augie-os.workers.dev | Native inline HTML base URL; use an HTTPS origin |

`off` keeps the existing auth payloads, mounts no host, and sends no Cloudflare
requests. `optional` attempts verification, then proceeds without a captchaToken
on failure. `required` aborts auth on failure with:
“Couldn't verify you're human. Check your connection and try again.”
The existing email form error area displays this message.

Set these EAS environment variables in the environment used by the captcha
TestFlight build, then rebuild:

```dotenv
EXPO_PUBLIC_CAPTCHA_MODE=optional
EXPO_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAFnthkbq7bh9N5bW
EXPO_PUBLIC_TURNSTILE_BASE_URL=https://snapscore-web.augie-os.workers.dev
```

Keep real Supabase auth configured and EXPO_PUBLIC_OFFLINE_MODE unset or false.
Allow `snapscore-web.augie-os.workers.dev` on the Cloudflare widget; keep
`localhost` for development. Web deployments must also use an allowed hostname.

## Server switch-on order

1. Leave Supabase captcha disabled while shipping this optional-mode build.
   Supabase ignores supplied captchaToken values while enforcement is disabled.
2. Verify the widget domain and public key, then test email sign-up, password
   sign-in, cancellation, poor connectivity, and the web challenge on device.
   Confirm the anonymous lane has integrated the helper below before enabling
   enforcement. Older builds without captcha will fail enforced auth calls.
3. Distribute the captcha-capable build to the intended users before enabling
   Supabase Turnstile with its matching server-side secret. No server settings
   are changed by this implementation.
4. With enforcement enabled, verify all enforced flows again. A later app build
   can use required mode for the clearer local failure message. Optional mode
   still sends tokens on success, but its fallback will be rejected by the server
   once captcha is required.

GoTrue enforces captcha on POST /signup (including anonymous sign-in), password
/token, /recover, /resend, /otp, and /magiclink. This app currently exposes email
sign-up/password sign-in; future recovery, resend, OTP or magic-link flows must
acquire a fresh token before each enforced call. ID-token, refresh-token and PKCE
flows do not require captcha.

## Anonymous lane integration

Import `anonymousSignInOptions` from the captcha service in the anonymous client
(the xdevice files belong to a separate lane), then use exactly:

```ts
this.auth.signInAnonymously(await anonymousSignInOptions())
```

The helper returns `{}` when off or when optional acquisition fails, and
`{ options: { captchaToken } }` on success. Required failure rejects before auth.

## Verification

`npm ci`, `npm test -- --runInBand`, and `npx tsc --noEmit` should run in the
network-enabled build environment. The captcha Jest suite mocks Supabase and
the host and does not contact Cloudflare. Real iOS/Android/Web challenges,
hostname acceptance, EAS substitution, and server enforcement require manual
integration verification.
