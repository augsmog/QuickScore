# SnapScore Privacy Policy

Effective date: October 30, 2026

SnapScore is operated by John August Jones ("we", "us"). For privacy questions or requests, email augie@autumn8.me. This policy is published at https://snapscore.autumn8.me/privacy and the support page is https://snapscore.autumn8.me/support.

## Information you provide

SnapScore handles the account information you supply, such as your name and email address. When you create an account or sign in, Supabase processes account sign-up and sign-in, including email/password credentials or identity-provider tokens (for example Sign in with Apple or Google). On iOS and Android the sign-in session is stored with the device's secure storage; on the web it is stored in the browser's localStorage. The app also keeps a copy of your session, a user profile and a few app flags in the app's local storage on your device. Builds that run offline, or without accounts, keep a local profile on the device instead.

SnapScore stores golf-round information such as player names, scores, courses, groups, selected games and game settings on your device. When you use tournament features, round and player information and score updates are sent to Supabase. This information is used for scoring and settlement calculations. Only enter other people's information when you have their permission to do so.

## Scorecard photos and AI processing

You can photograph a scorecard so SnapScore can read it. SnapScore first tries to read the card on your device using on-device text recognition when it is available. If that is unavailable, fails, or is not confident enough, the app can send the scorecard image for cloud recognition: the image is sent to a Supabase Edge Function, which forwards it to Anthropic's API to extract player names and scores. Cloud processing therefore includes any other information visible in the photo. Review the extracted results before saving them.

The scorecard image is sent in the request for recognition; SnapScore does not save it to a SnapScore storage bucket. Supabase and Anthropic handle data they receive under their own terms, which may include logs.

## Sharing and chat

If you turn on live scoreboard sharing, the app sends a scoreboard snapshot to Supabase containing player display names, hole scores, totals and game standings. Anyone who has a valid link can view that scoreboard without signing in. You can revoke shared links in the app. Chat sends a display name, the message and a randomly generated session identifier to Supabase, and hosts can remove messages. Do not include private information in shared names or messages. Revoking a link stops new viewing through that link; it does not erase information someone has already seen or copied.

## Diagnostics

SnapScore uses Sentry to report errors, logs, performance traces and session replays so we can find and fix problems. Sentry may receive device and app details, the screens and actions leading up to an error, network request information, and identifiers associated with your use of the app. Performance traces are collected for a sample of sessions (about 20%), session replays for a sample of sessions (about 10%), and a replay may be captured when an error occurs. Session replays mask on-screen text and images by default. Sentry is turned off on public shared-scoreboard pages.

## Purchases and other services

If you buy or restore a subscription, RevenueCat processes purchase and entitlement information so the app can determine your subscription access and restore purchases; Apple or Google processes the payment itself. SnapScore does not read your card number. SnapScore's backend can also keep profile and referral records and sign-up activity, send welcome or referral emails through Resend, and record subscription and payment events from Stripe for web billing.

## Course search

If you search for a golf course, your search text is sent to a Supabase function, which can forward it to GolfCore and cache the query and results. If you allow location access, it is used on your device to sort nearby courses.

## How information is used and who receives it

We use information to provide your account, read scorecards, store and sync rounds, calculate results, provide the sharing and chat features you choose to use, manage subscriptions, send account emails, and diagnose problems with the app. The services that receive information are:

- Supabase: account data and the data used by cloud features (rounds, sharing, chat, course search).
- Anthropic: scorecard images sent for cloud recognition.
- Sentry: diagnostics described above.
- RevenueCat, Apple and Google: purchase and subscription information.
- Resend and Stripe: account emails and web billing events, where used.
- GolfCore: course search queries.
- Cloudflare: a security check (Turnstile) on sign-in and sign-up, where enabled.

SnapScore does not include advertising SDKs.

## Retention and deletion

Rounds and account information stored on your device remain there until you delete them in the app, reset the app, or remove the app. Deleting a contest removes it from your device. Deleting your account in Settings removes SnapScore data stored on that device and signs you out. Signing out by itself does not delete data from our servers.

To ask us to delete your account and the data stored on SnapScore's servers (such as synced rounds and scores, shared scoreboards and chat messages), email augie@autumn8.me from the email address on your account. Information already sent to the service providers listed above is handled under their terms.

## Your choices

SnapScore asks for camera access to photograph scorecards. You can decline camera access and enter scores by hand instead. You can choose not to use cloud features such as live sharing, chat and course search. You can ask us questions about your information, or ask us to delete it, by emailing augie@autumn8.me.

## Changes to this policy

If we change this policy, we will post the updated version at https://snapscore.autumn8.me/privacy with a new effective date.

## Contact

John August Jones, operator of SnapScore. Email: augie@autumn8.me
