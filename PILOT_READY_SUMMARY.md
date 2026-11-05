> Historical planning/sprint document. Current selectable and settled capabilities are recorded in [GAMES_STATUS.md](GAMES_STATUS.md) and the derived engine registry; historical completion statements below are not release evidence.

# SnapScore Friend-Group Pilot - Ready Status

## ✅ What's Ready

### 1. Offline Web Preview Mode
- ✅ Auth automatically bypassed (no signup required)
- ✅ Onboarding auto-skipped for faster testing
- ✅ All data stored locally (localStorage/IndexedDB)
- ✅ No backend/Supabase required
- ✅ Works in any modern browser

**Enable:** Build with `EXPO_PUBLIC_OFFLINE_MODE=true` (explicit opt-in only; native app builds without it keep sign-in and onboarding).

### 2. Complete Game Implementation
- ✅ **Historical calculator inventory (not release acceptance)**
- ✅ 761 engine checks passing (+129 scorecard scenario checks); Jest runs these suites plus 3 local-date cases
- ✅ Zero-sum settlement validation
- ✅ Multi-game concurrent support (run 2-8 games at once)
- ✅ Per-hole progressive calculation

**See:** `GAMES_STATUS.md` for complete game list

### 3. Core Flow Working
- ✅ Create contest (course, players, games, bet amount)
- ✅ Manual score entry (hole-by-hole)
- ✅ Live leaderboard updates
- ✅ Game-specific results
- ✅ Final settlement with transaction breakdown
- ✅ Share results

**See:** `FLOW_DOCUMENTATION.md` for detailed screen flows

### 4. Vercel Deployment Documentation
- ✅ Complete deployment guide created
- ✅ CLI and dashboard deployment options
- ✅ Environment variable setup
- ✅ Custom domain instructions
- ✅ Troubleshooting guide

**See:** `VERCEL_DEPLOYMENT.md` for step-by-step instructions

---

## 📸 Screenshots (real app)

> Correction: an earlier version of this PR referenced screenshots and a `demo.html` that were a **static HTML mockup, not the app**. Those have been removed and are not used anywhere.

Real screenshots of the exported web build, driven by Playwright (`scoresnap/e2e/web-real-flow.mjs`), are in `scoresnap/e2e/screens/`:

| File | What it shows |
|------|---------------|
| `01-home.png` | Home screen of the running web build |
| `02-new-contest-players.png` | New Contest step 1 (players Augie, Sam, Lee, Pat) |
| `03-new-contest-games.png` | Step 2 game selection (Stroke Play, Skins, Nassau) |
| `03b-skins-mode-toggle.png` | Net/Gross skins toggle, Net selected |
| `04-contest-created-empty.png` | New contest with no scores (no sample data) |
| `05-scan-empty-error.png` | Web scorecard entry rejects empty input |
| `06-scan-text-entered.png` | Scorecard pasted as text (Sam's row is all 4s) |
| `07-review-parsed-scorecard.png` | Review screen with parser output: four players with 18 holes each; Augie 81, Sam 72 (GS-2) |
| `08-contest-leaderboard.png` | Leaderboard after import |
| `09-scorecard.png` | Hole-by-hole scorecard |
| `10-games.png` | Game results (Stroke Play, Skins, Nassau) |
| `11-settlement.png` | Settlement ledger |
| `10b-games-gross.png` / `11b-settlement-gross.png` | Gross mode results and settlement for the same handicap scorecard |
| `12`–`14-gs1-*.png` | Review screen with missing / malformed / empty scan data shows an error, never sample players (GS-1) |

`results.json` in the same folder lists every automated check. Screenshots are 390×844 and cover four players across 18 holes.

---

## 🎮 Fully Supported Games

historical game inventory work with manual score entry:

### Individual (4 games)
✅ Stroke Play • Match Play • Stableford • Modified Stableford

### Betting Games (14 games)
✅ Skins • Skins (Carryover) • Nassau • Nassau w/ Presses • Wolf • Banker • Hammer • Snake • Rabbit • Defender • Closeout • Vegas • Sixes • Nines

### Point Games (6 games)
✅ Bingo Bango Bongo • Dots / Trash • Quota • Chicago • Greenies • Aces & Deuces

### Team Games (5 games)
✅ Best Ball • Scramble • Shamble • Alternate Shot • Chapman • Four-Ball

**Status:** All calculators implemented, all tests passing, all integrate with settlement engine.

---

## ⚠️ Partial / Requires Manual Input

Some games need auxiliary data beyond scores:

| Game | Needs | Workaround |
|------|-------|------------|
| **Wolf** | Partner selection per hole | Manual tracking, enter after round |
| **Hammer** | Hammer called/accepted | Manual tracking, enter after round |
| **Snake** | 3-putt tracking | Manual tracking, enter after round |

**Note:** These games still *calculate correctly* if aux data is provided, but the per-hole input UI isn't built yet.

**Recommendation for Pilot:** Start with games that only need scores:
- Stroke Play + Skins + Nassau (most popular)
- Stroke Play + Skins + BBB (party format)
- Stroke Play + Skins + Stableford + Dots (full analysis)

---

## 🌐 Web Preview Limitations

| Feature | Web | Mobile (iOS/Android) |
|---------|-----|---------------------|
| Manual score entry | ✅ Full | ✅ Full |
| historical game inventory | ✅ Full | ✅ Full |
| Settlement engine | ✅ Full | ✅ Full |
| Leaderboards | ✅ Full | ✅ Full |
| **OCR scanning** | ❌ Not supported | ✅ Camera-based |
| **Haptic feedback** | ⚠️ No-op | ✅ Full |
| **Push notifications** | ❌ Future | ❌ Future |

**Bottom Line:** Web is perfect for manual entry. For camera scanning, use iOS/Android app.

---

## 🚀 How Friends Can Test

### Option 1: Vercel Deploy (Recommended)

```bash
cd scoresnap
npx expo export --platform web --output-dir dist-web
vercel --prod
# Share URL: https://your-project.vercel.app
```

Friends visit the URL, no install needed.

### Option 2: Local Development

```bash
cd scoresnap
npm install
npm run web
# Opens at http://localhost:19006
```

Share localhost via ngrok or similar.

### Option 3: Native App (for camera scanning)

```bash
cd scoresnap
# iOS
npm run ios

# Android
npm run android
```

Build and share via TestFlight/Play Store internal testing.

---

## 🎯 Recommended Test Scenarios

### Scenario 1: Weekend Foursome (Simple)
- **Players:** 4
- **Games:** Stroke Play + Skins (Carryover)
- **Bet:** $5/game
- **Time:** ~10 minutes (setup + score entry + settlement)

### Scenario 2: High-Stakes Round (Complex)
- **Players:** 4
- **Games:** Stroke Play + Skins + Nassau + BBB
- **Bet:** $10/game
- **Time:** ~15 minutes

### Scenario 3: Large Group (Multi-Group)
- **Players:** 12 (3 groups of 4)
- **Games:** Stroke Play + Skins + Stableford
- **Bet:** $5/game
- **Time:** ~20 minutes

---

## 📊 Expected Performance

- **Setup:** 2-3 minutes
- **Score entry (manual):** 5-7 minutes for 18 holes
- **Score entry (camera scan):** 30 seconds (mobile only)
- **Calculation:** < 100ms for all games
- **Settlement generation:** < 100ms
- **Total flow:** 8-12 minutes from start to settlement

---

## 🐛 Known Issues / Blockers

### Critical (Blocks Pilot)
The offline web flow passes automated checks; this does not establish native camera, live backend, or every game/UI combination as pilot-ready.

**GS-7 resolved:** Skins scoring is a per-contest setting: **Net** by default (including older contests without a setting), with a **Gross** option. Creation persists the setting in gameConfig. Games and Settlement show the mode and use the same field-wide skins calculation. Net allocates full rounded player handicaps by hole stroke index, including plus handicaps. Multiple skins winners receive proportional payouts matching their skin balances.

### Verified fixes (2026-10-21)
- GS-7: Four-player browser checks set handicaps through the UI, verify Net is selected by default and persisted through import, and check Games counts, Settlement amounts, and mode labels in both Net and Gross modes. Gross verification reloads a persisted contest fixture; creation toggle selection is also checked.
- Four-player, 18-hole real-app flow at **390×844** covers contest creation, scorecard import, leaderboard, Skins/Nassau results, and settlement. Every player row is reachable without clipping, and the settlement screenshot shows all four players.
- Home formats stored timestamps as local calendar dates; three timezone/boundary cases cover the UTC date regression.
- Sample Round requires `EXPO_PUBLIC_DEMO_MODE=true`, independently of offline mode. Previously saved demo rounds are hidden on Home when demo mode is off.
- CI workflow `.github/workflows/web-smoke.yml` runs Jest, exports the offline web app, serves it with SPA fallback, and runs Chromium checks on pushes and pull requests. Build failures, failed checks, and uncaught page errors fail the job. CI itself has not been run remotely (no push authorized).
- Local verification: **10 Jest tests passed**, covering **890 existing engine/parser assertions + 3 date cases + 4 skins-mode regression cases**; web export passed. Jest also passes under **Node 22.23.4** using dynamic imports with CommonJS interop. Browser verification passed **48/48 checks**, with no uncaught page errors; results are recorded in `scoresnap/e2e/screens/results.json`.

### Existing validation debt
- Repository-wide TypeScript checking still reports errors outside the skins-mode work (including gameBreakdowns, Snake/Rabbit result properties, onboarding SharedValue, and service types). The requested Jest, web export, and browser checks pass. The default Node stack overflows on the large engine test file; running tsc with an increased stack exposes these diagnostics.

### Minor (Nice to Have)
1. **Camera scanning web:** Not supported by Expo (architectural limitation)
   - **Workaround:** Use mobile app or manual entry on web

2. **Wolf/Hammer/Snake input UI:** Per-hole input UI not built
   - **Workaround:** Calculate these games after round with manual aux data

3. **No cloud sync:** All data local-only in offline mode
   - **Workaround:** Users can export/share results manually

4. **No Venmo integration:** Settlement shows money flows but doesn't auto-pay
   - **Workaround:** Users settle via Venmo/Cash App manually

### Future Enhancements (Post-Pilot)
- Live authentication (Supabase)
- Cloud sync (multi-device)
- Real-time leaderboards (shared rounds)
- Venmo/payment API integration
- Course API (live course data)
- Historical stats & trends

---

## 📝 Testing Checklist for Friends

- [ ] Open web preview link
- [ ] App loads without auth prompts
- [ ] Create new contest (select course, add players, choose games)
- [ ] Enter scores for 9 or 18 holes
- [ ] View live leaderboard updates
- [ ] Check settlement summary
- [ ] Verify zero-sum (total = $0)
- [ ] Test with 2 players (Nassau/Match Play)
- [ ] Test with 4 players (Wolf/Nines)
- [ ] Try multi-game combo (Stroke + Skins + Nassau)
- [ ] Refresh page - verify data persists
- [ ] Share feedback on UX/flows

---

## 📈 Success Metrics for Pilot

1. **Usability:** Can friends complete full flow without help?
2. **Accuracy:** Do settlement numbers match manual calculations?
3. **Performance:** Does the app feel fast/responsive?
4. **Engagement:** Do friends want to use it for next round?

---

## 🔗 Quick Links

| Resource | Path |
|----------|------|
| **Game Status** | `/workspace/GAMES_STATUS.md` |
| **Flow Documentation** | `/workspace/FLOW_DOCUMENTATION.md` |
| **Vercel Deployment** | `/workspace/VERCEL_DEPLOYMENT.md` |
| **Screenshots (real app)** | `scoresnap/e2e/screens/` |
| **Web E2E script** | `scoresnap/e2e/web-real-flow.mjs` |
| **Test Suite** | `scoresnap/src/engine/__tests__/` |

---

## 📞 Next Steps

1. **Deploy to Vercel**
   ```bash
   cd scoresnap
   EXPO_PUBLIC_OFFLINE_MODE=true npx expo export --platform web --output-dir dist-web
   vercel --prod
   ```

2. **Share with 3-5 friends**
   - Send Vercel URL
   - Share FLOW_DOCUMENTATION.md for guidance
   - Ask them to test Scenario 1 (simple foursome)

3. **Gather Feedback**
   - What was confusing?
   - What broke?
   - What features are missing?
   - Would they use it?

4. **Iterate**
   - Fix critical bugs
   - Add most-requested features
   - Improve UX based on feedback

---

## ✅ Deployment Readiness Checklist

- [x] Offline mode working
- [x] historical game inventory implemented & tested
- [x] Settlement engine validates zero-sum
- [x] Manual score entry functional
- [x] Web build exports successfully
- [x] Documentation complete
- [x] Real-app screenshots captured with Playwright (earlier mockup removed)
- [x] Vercel deployment guide written
- [ ] **Next:** Deploy to Vercel (not done yet, per instructions)
- [ ] **Next:** Share with friends
- [ ] **Next:** Gather feedback

---

## 🎉 Summary

**SnapScore is pilot-ready!**

✅ All core features work  
✅ historical game inventory implemented
✅ 761 engine checks passing (+129 scorecard scenario checks); Jest runs these suites plus 3 local-date cases
✅ Web preview mode (no auth)  
✅ Deployment docs complete  
✅ Real-app screenshots captured (Playwright, web build)  

**Missing:** Camera OCR on web (web uses text scorecard entry instead), cloud sync, payments

**Recommendation:** Deploy to Vercel today, share with friends tomorrow, gather feedback this weekend.

---

**Questions or issues?** Check the documentation files or open a GitHub issue.


## GS-9 — Per-contest skins scope (2026-10-21)

- Contest creation offers accessible Whole field (default) / Each group radios beside the existing Net/Gross controls; persisted as optional `gameConfig.skinsScope`. Older contests default to Whole field.
- Games and Settlement share scope boundaries and show scoring mode plus scope. Each-group skins calculate and reconcile cents independently inside each group, so skins transactions never cross groups. Profile wagering history also uses the saved contest settings.
- Added `scoresnap/tests/skins-scope.test.cjs`: Net/Gross × regular/carryover skins with two groups, default-field compatibility, differing outcomes, Games/Settlement agreement, fractional-cent reconciliation, deterministic ledgers, and group-only payments.
- Verification: `npx jest --runInBand` passes **15 tests / 5 suites**, including 4 new scope cases. The same suite passes on **Node 22.23.4** with dynamic imports and tsx. Offline Expo web export succeeds.
- Browser flow creates two groups through the UI, imports the scorecard into each group, then checks persisted Net/Whole field, Gross/Whole field, and Net/Each group results. Required 390×844 screenshots: `03c-skins-scope-toggle.png`, `10c-games-group.png`, `11c-settlement-group.png` in `scoresnap/e2e/screens/`.
- No commits, pushes, main changes, deployments, or secrets added. Changes remain uncommitted.
- Final browser verification: **87/87 checks passed**, no uncaught page errors; scope outcomes differ with two UI-created groups. All required screenshots captured; local server stopped. Nothing requested remains undone.

## GS-5: organizer accounts and guest players

Organizers need accounts when real Supabase auth is configured; players join by code without accounts. Explicit offline mode treats the local user as organizer. Implemented six-character contest codes, copy/share invites, home join entry, browser guest route, persisted guest UUID/player binding, own-score entry and gross leaderboard totals. Guests choose existing slots; missing names must be added by the organizer.

Offline joining works only in the same browser storage. E2e checks that a fresh browser context cannot resolve the local code, then uses a distinct guest identity in the same browser. Screenshots 15–19 cover the organizer code, join form, slot selection, scoring and claim placeholder.

Deferred: cross-device sharing/Supabase adapter, atomic slot reservation and server guest authorization, realtime sync/conflicts, secure account history claim, QR/presence/self-add. `claimGuestHistory()` currently explains “Claim your rounds — coming soon” and device-local retention. Draft SQL is checked in but was not applied. Real auth is wired for configured credentials but requires separate project/provider verification. See `scoresnap/docs/spec-contest-sharing.md`.

GS-5 verification: `npx jest --runInBand` passed 20/20 tests in six suites; the same tests also passed under Node 22 with dynamic import + tsx. Offline web export succeeded. Final real-browser e2e passed 94/94 checks, including existing Net/Gross skins, scope and cent reconciliation checks; screenshots 15–19 are 390×844. No uncaught browser errors. An additional TypeScript check reports existing errors in untouched files (games/settlement, onboarding, engine tests, services and Deno functions); none were reported in GS-5's new files.

GS-5 source changes: `app/(tabs)/index.tsx`, `app/_layout.tsx`, `app/auth/sign-in.tsx`, `app/contest/new.tsx`, `app/contest/[id]/_layout.tsx`, `app/join/[code].tsx`, `src/config/auth.ts`, `src/services/guest-join.ts`, `src/stores/auth-store.ts`, `src/stores/contest-store.ts`, `src/stores/guest-store.ts`, `src/ui/ContestJoinCode.tsx`, `tests/guest-join.test.cjs`, `e2e/web-real-flow.mjs`, `e2e/screens/*`, `docs/spec-contest-sharing.md`, and `supabase/migrations/002_contest_sharing_draft.sql` (all paths relative to `scoresnap/`), plus this summary. Changes remain uncommitted; no push, deploy, account creation or remote migration was performed.
