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

## 0.5 Before anything is called a candidate (AUG-1602)

A commit is a **candidate** only when both of these are true. Until then call it "the assembled SHA", in tickets and in chat.

1. `candidate-check` has written a receipt for that exact SHA:
   ```sh
   cd scoresnap
   node scripts/release/candidate-check.cjs check --sha <full 40-character SHA> --receipt candidate-receipt.json
   ```
   It checks out exactly that SHA in a clean worktree and refuses unless: every fix in `release/required-fixes.json` is in the SHA (as an ancestor, or as an identical patch when fixes were combined by cherry-pick); the full unit suite passes with 0 failed and no skipped test beyond `allowedSkips`; and the version matches the release. On any failure it exits non-zero and leaves no receipt.
2. A **different service** from the one that ran step 1 has run the same command on the same SHA and got the same `sha`, `tree`, suite counts and fix list. Post both receipts on the release ticket.

**Every build, archive and upload goes through one entry point.** Do not call `eas`, `xcodebuild`, `fastlane` or an upload tool directly for a release; wrap the same command:
```sh
node scripts/release/run-on-candidate.cjs \
  --receipt /path/outside/any/checkout/candidate-receipt.json \
  -- <the build, archive or upload command, exactly as you would have typed it>
```
Run it from a checkout of the default branch that has the release SHA fetched. After `verify` accepts the receipt, it makes a **fresh checkout** of exactly the receipt's SHA in a new temporary directory, runs the command in `<that directory>/scoresnap`, and removes the directory afterwards. Nothing left over from an earlier build (`ios/`, `node_modules`, `.env`, `.expo`, any other git-ignored path) can be there, because the directory did not exist before. Consequences:
- The command starts with no `node_modules` and no `ios/`. It must install and prebuild itself (for example `sh -c 'npm ci && npx expo prebuild --platform ios && …'`).
- Anything you want to keep (the `.xcarchive`, the `.ipa`, logs) must be written outside the checkout, or it is removed with it. `--keep` leaves the directory in place and prints its path.
- The directory is made under the system temporary directory; set `TMPDIR` to put it elsewhere. `--repo <dir>` takes the commit from another clone of this repository.

Otherwise it prints `REFUSED: …`, exits non-zero and runs nothing. The command gets `CANDIDATE_SHA`, `CANDIDATE_TREE`, `CANDIDATE_RECEIPT`, `CANDIDATE_CHECKOUT` and `CANDIDATE_BUILD_RECORD`, and its exit status is passed through.

**Release flags.** What the app does at launch is set by five variables in the `testflight` and `production` profiles of `eas.json` (Join by code on, PRO off, Leagues off, native links off, course search on). `eas build --profile …` applies them itself. A build made by hand with `xcodebuild` only gets them if they are in its environment, and a build without them is a different app from the one that was tested. So name the profile:
```sh
node scripts/release/run-on-candidate.cjs --receipt … --profile testflight -- <command>
```
With `--profile` the entry point reads that profile from the `eas.json` of the SHA being built, refuses if this shell gives any of its variables a different value or sets any other `EXPO_PUBLIC_*` variable or `APP_VARIANT`, and starts the command with exactly the profile's values. The build record lists them under `releaseFlags` and `buildVariables`. Without `--profile` nothing is checked, a warning is printed, and the record says `"checked": false`. This checks what the command is started with. It does not prove what ended up in the built app; that still has to be shown from the app itself.

**Build record.** Every admitted run writes `<receipt>.build-<start time>-<pid>.json` beside the receipt (never inside the checkout): the SHA and tree, the command, Xcode, macOS, node and npm versions (the Apple fields are `null` off a Mac), start and end time, the exit code, and free GB before the command, after it, and after clean-up. Post it with the archive evidence. `usedGbByCommand` is the difference at the end of the command, not the peak during it. The command's arguments are written into the record, so do not pass secrets as arguments. A record with `endedAt: null` is a run that was killed.

**After a kill, and kept checkouts.** A fresh checkout records its owner's process id. If a run is killed before it can clean up, the next fresh-mode run prints `LEFT BEHIND: …` with the exact command to remove the directory. It never removes one itself: a wrapper that was killed can leave its build command still running in that directory, and a checkout kept with `--keep` is meant to outlive the run that made it (later runs print `KEPT EARLIER: …` and leave it alone). Removing either is a deliberate step by whoever owns the build.

**What the clone needs.** `verify` works out again where each required fix is in the SHA, so the clone must have the fix commits named in `release/required-fixes.json` as well as the release SHA; fetch those branches first. The unit suite also reads three historical commits (`ac8b3f8`, `7d2539a`, `65459e4`, used by `store/asc/__tests__/binding.test.ts`), so a shallow clone fails that test for a reason that is not a product fault. Use a clone with full history.

`--source <existing checkout>` (in place of the fresh checkout) is for cases that need an existing checkout. It refuses unless `HEAD` is exactly the receipt's SHA with no changes to tracked files and no untracked files that are not git-ignored. It cannot see git-ignored paths and prints a warning saying so every time. Do not use it for an archive or an upload.

Keep `candidate-receipt.json.tests.txt` beside the receipt; `verify` needs both. A receipt is refused if it is for another SHA or tree, if its fix list is not exactly the one in `release/required-fixes.json`, if the test list beside it does not match the hash in the receipt, if it records a red suite, or if it was written by a different version of the check. To check a receipt without running anything: `node scripts/release/candidate-check.cjs verify --sha <SHA> --receipt candidate-receipt.json`.

Compare two receipts by `suite.testIdsSha256` (the hash of the sorted list of every test that ran, with its result), never by the headline count. If the hashes differ, `diff` the two `.tests.txt` files to see which tests.

**What is and is not enforced.** The entry point refuses by itself. Nothing stops a person or an agent from bypassing it and typing the build command directly, and other entry points (for example `eas_run.sh` in the Control repository) do not call it. Using only this entry point for release builds is the rule.

- The release lead owns `release/required-fixes.json`. A fix is added there when its ticket becomes launch-blocking, with the exact commit.
- The build number is assigned at build time (`appVersionSource: remote`), so the receipt records the version only. Check the build number on the archive.
- The receipt proves the unit suite and the fix list. It does not prove layout, purchase or device behaviour; those have their own evidence.

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
   - **From a lane/box runner, use the one entry point `eas_run.sh` instead of calling `eas` directly** (Refs AUG-1357): `/workspace/augie-os-control/scripts/eas_run.sh --worktree <dir> --sha <sha> -- build --platform ios --profile testflight --auto-submit --non-interactive --no-wait`. It resolves the repo-local `scoresnap/node_modules/.bin/eas` from the worktree (`eas` is not on PATH in lanes; falls back to `npx eas-cli@<pinned>`), loads `EXPO_TOKEN` from the box secret store and redacts it from all output, and refuses to start a `build` while a 1.0.x build is already in progress for the same SHA (single-build guard). `EAS_RUN_DRY=1` prints the plan only. Put the exact `eas_run.sh` invocation in the build ticket's `Step:` line.
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
