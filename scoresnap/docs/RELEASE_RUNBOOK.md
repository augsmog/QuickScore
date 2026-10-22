# SnapScore release runbook (Expo EAS → TestFlight → App Store)

Decision (Augie, Oct 21 2026): TestFlight goes through **Expo EAS**, so releases reach Augie's iPhone without him at a computer. Xcode is not needed for normal releases.

**Never paste or commit secrets.** `EXPO_TOKEN`, the App Store Connect (ASC) API key (`.p8`), and the golf course API key live only in EAS / CI secret storage or the box's secret store, never in git, chat, logs or this doc.

## 0. One-time setup (done once, then never again)

1. **Golf course API key → EAS env var** (it used to be plain text in `eas.json`; it was removed on Oct 21 2026).
   - The old key is in git history (commit `bc9b70a`), so **rotate it** at golfcourseapi.com first, then store the new one:
   ```sh
   cd scoresnap
   eas env:create --name EXPO_PUBLIC_GOLF_COURSE_API_KEY --value "<new key>" \
     --environment production --environment preview --visibility sensitive
   ```
   - `eas.json` build profiles `testflight` and `production` use `"environment": "production"`, so EAS injects it at build time.
   - Note: any `EXPO_PUBLIC_*` value is compiled into the app bundle and is readable by anyone with the app. That's acceptable for a free, rate-limited course API key, but **not** for `EXPO_PUBLIC_ANTHROPIC_API_KEY` (used by OCR); move OCR behind a server function before any public release.
   - Local dev: put it in `scoresnap/.env.local` (git-ignored), or `eas env:pull --environment development`.
2. **ASC API key** (lets EAS create certificates/profiles and submit with no Apple ID password or 2FA prompt):
   - App Store Connect → Users and Access → Integrations → App Store Connect API → generate a key with **App Manager** role. Note the **Key ID** and **Issuer ID**, download the `.p8` once.
   - Upload it to EAS once: `eas credentials -p ios` → App Store Connect API Key → add (or set it in the expo.dev dashboard under Credentials). After that, `eas submit` uses it automatically.
   - Non-interactive alternative (CI): set secrets `EXPO_ASC_API_KEY_PATH` (path to the `.p8` written at runtime), `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID=3357G2T3KS`.
3. **EXPO_TOKEN**: expo.dev → Account settings → Access tokens → create a robot/personal token. Store it as a secret (box secret store and/or GitHub Actions secret `EXPO_TOKEN`). Every `eas` command below reads it from the environment; never echo it.
4. Existing config already in `eas.json`: `submit.testflight.ios` → `ascAppId 6761034352`, `appleTeamId 3357G2T3KS`; build profile `testflight` → `distribution: store`, `autoIncrement`, `channel: testflight`; `appVersionSource: remote`; `runtimeVersion.policy: appVersion`.

## 1. Every TestFlight release

1. **Release PR**: changes land on a PR; CI (`web-smoke`) must be green. Tater writes a 3-line changelog in the PR.
2. **Augie's OK**: Tater asks one question (Release build #N to TestFlight? Yes / Not yet). Nothing below runs without a yes.
3. **Build + auto-submit** (non-interactive; runs on EAS's macOS workers, no Xcode):
   ```sh
   cd scoresnap
   EXPO_TOKEN=*** eas build --platform ios --profile testflight --auto-submit --non-interactive --no-wait
   ```
   - `--auto-submit` uses `submit.testflight` and the stored ASC API key. Apple processing takes ~5–30 min after upload, then the build shows up in the TestFlight app on Augie's iPhone (internal testers get it with no review).
   - Check status: `eas build:list --platform ios --limit 1` (or the expo.dev build page link).
4. **JS-only fixes** (no native code or dependency changes): skip the build and ship an over-the-air update to the same channel:
   ```sh
   EXPO_TOKEN=*** eas update --channel testflight --message "<what changed>" --non-interactive
   ```
   - Works only while `runtimeVersion` (app version) matches the installed build. Bump the version or change native deps → do a new build instead.
   - Users get the update on next app launch (second launch on some devices).

## 2. App Store path (later)

1. Fill App Store metadata once in App Store Connect (or keep it in repo with `eas metadata`): name **SnapScore**, subtitle, description, keywords, support URL, **privacy policy URL**, age rating, screenshots (6.7" and 6.1" iPhone), App Privacy answers (data collected: name, scores; camera for scanning), and review notes with a demo login or guest path (reviewers need to reach the core flow without a real account; the GS-5 guest join helps).
2. Build for production and submit:
   ```sh
   EXPO_TOKEN=*** eas build --platform ios --profile production --auto-submit --non-interactive
   # or submit an existing build:
   EXPO_TOKEN=*** eas submit --platform ios --profile production --latest --non-interactive
   ```
3. In App Store Connect: attach the build to the version, answer export compliance (`ITSAppUsesNonExemptEncryption: false` in `app.json` avoids the prompt), and **Submit for Review**. Submitting for review and releasing are Augie's call each time.
4. After approval: release manually or phased. Post-release JS fixes: `eas update --channel production`.
5. Pre-submit checklist: in-app purchases (RevenueCat) configured or hidden; Sign in with Apple present if any third-party login is offered; account deletion available in-app if accounts exist; no placeholder Supabase URL in production builds.

## 3. Costs (expo.dev/pricing, checked Oct 21 2026)

- **Free plan ($0):** 15 iOS + 15 Android builds per month, low-priority queue (can wait 90+ min at peak), 45-min build timeout, 1 macOS concurrency, EAS Submit included, EAS Update to 1,000 MAUs.
- **Starter ($19/mo):** $45 build credit, high-priority queue, 2-hour timeout, updates to 3,000 MAUs. Overage: iOS build $2 (medium) / $4 (large).
- Apple Developer Program: $99/yr (Augie already has it).
- For a friend-group pilot, Free is enough: ~15 TestFlight builds a month plus unlimited OTA updates.
