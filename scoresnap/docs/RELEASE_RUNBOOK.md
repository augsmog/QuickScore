# SnapScore release runbook (Expo EAS → TestFlight → App Store)

Decision (Augie, Oct 21 2026): TestFlight goes through **Expo EAS**, so releases reach Augie's iPhone without him at a computer. Xcode is not needed for normal releases.

**Never paste or commit secrets.** `EXPO_TOKEN`, the App Store Connect (ASC) API key (`.p8`) live only in EAS / CI secret storage or the box's secret store; the GolfCore key lives only in Supabase Function Secrets, never in git, chat, logs or this doc.

## 0. One-time setup (done once, then never again)

1. **GolfCore course data (server only, $0 Free plan)**:
   - Store `GOLFCORE_API_KEY` in Supabase Function Secrets using the dashboard. Never put a provider key in an Expo environment variable or app bundle. Revoke the old vendor key exposed in historical commit `bc9b70a` if that account still exists.
   - Apply additive migration `supabase/migrations/006_course_data.sql` before deploying.
   - From `scoresnap/`, coordinator deploys with `supabase functions deploy course-data`. Keep `verify_jwt = true`; anon JWTs can search, while count/usage require a service_role JWT kept server-side.
   - Set `EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true` to enable the app UI. The existing Supabase URL and anon/user JWT are the only client credentials.
   - Verify on preview: search Torrey Pines, select both White gender categories, check holes/ratings and the tappable “Course data: GolfCore” course-page credit. Test missing-card/manual entry and exhausted-quota states.
   - A server-side monitor reads `GET course-data?usage=1`: at 70% or projected month end >500, create a Needs-you card **“Upgrade GolfCore to Starter ($10/mo)?”**; at 90% or any quota 429, mark urgent. No automatic upgrades; Augie must say yes. See [COURSE_DATA.md](COURSE_DATA.md).
   - Measure listing counts using service-role `GET course-data?count=1` on preview and record totals/timestamp before making listing claims. Do not infer counts from marketing copy.
   - **OCR API key (Anthropic)** remains in Supabase Function Secrets; deploy `ocr-scorecard` separately before public release.
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
