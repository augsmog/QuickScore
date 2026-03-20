# ScoreSnap (QuickScore) — Comprehensive UI/UX Audit

**Date:** March 18, 2026
**Auditor context:** Complete code review of every screen, component, navigation flow, theme file, store, and service in the ScoreSnap React Native/Expo codebase.
**Target user:** Social golfers (30–55 M) who wager on rounds, 1–4x/month. Benchmark apps: Venmo, DraftKings, ESPN, Cash App, 18Birdies.

---

## Executive Summary

ScoreSnap has a surprisingly strong foundation for a v1. The dark-navy + green accent palette is premium and golf-appropriate, the 25+ game engine is genuinely impressive, and core flows (contest creation, scorecard entry, settlement) are logically sound. However, the app currently reads as a **competent developer prototype** rather than a **trustworthy consumer product**. The gap is not in functionality — it's in polish, personality, and the dozens of small trust signals that separate an app a golfer *downloads* from one they *pay for*.

The biggest risk areas: (1) no real onboarding or value demonstration before requiring action, (2) zero personality or celebration moments around winning/losing money, (3) the scan-to-result flow is simulated with no real wow-moment payoff, (4) inconsistent styling approach mixing inline styles and NativeWind classes, and (5) missing professional-grade states (loading, error, empty, skeleton) across nearly every screen.

**Verdict:** With the P0 fixes below, this can ship as a credible beta. Without them, the target demographic will bounce within 30 seconds.

---

## 1. First Impressions & Onboarding

### Current State

The app opens directly to the Home screen (`app/(tabs)/index.tsx`). There is a sign-in screen (`app/auth/sign-in.tsx`) but **it is not wired into the navigation flow** — `_layout.tsx` has no auth gate. The root layout goes straight to `(tabs)`.

The Home screen shows:
- A ⛳ emoji as the logo (48px)
- "ScoreSnap" in 30px bold
- "Scan. Score. Settle." tagline
- A "Scan Scorecard" hero CTA
- A "New Contest" secondary CTA
- A 25+ game modes grid

### Problems

**No onboarding flow exists (P0).** A first-time user lands on a screen with two CTAs and a wall of game mode chips. There is no explanation of what the app does, who it's for, or why they should trust it with their betting math. Compare to DraftKings, which walks new users through account setup, explains the value prop, and gets them to their first bet within 3 screens.

**The sign-in screen is orphaned (P0).** `sign-in.tsx` exists but is never navigated to. The root `_layout.tsx` shows `(tabs)` immediately. There's no auth check, no `useAuthStore().isInitialized` gate, nothing. The Google Sign-In handler literally shows an `Alert.alert` saying "Google Sign-In requires configuring OAuth credentials." This is a trust-destroyer if a user somehow reaches it.

**The "logo" is an emoji (P1).** The ⛳ emoji at line 69 of `sign-in.tsx` (64px) and line 48 of `index.tsx` (48px) is the entire brand identity. No custom logo, no wordmark, no visual brand at all. This alone signals "hobby project" to anyone who's used Venmo or Cash App. Even a simple SVG wordmark would 10x the perceived quality.

**Time-to-wow is too long (P1).** The "wow moment" is scanning a scorecard and seeing results calculated. But a new user has to: understand the app → tap Scan → grant camera permission → position card → wait for OCR → review results. That's 5+ steps before they see any value. DraftKings and ESPN show value on the home screen immediately (live scores, bet slips).

### Recommendations

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 1 | Add 3-screen onboarding carousel: (a) "Snap your scorecard" with camera illustration, (b) "Settle bets instantly" with settlement preview, (c) "25+ game modes" with game icons. Skip button visible. | P0 | DraftKings first-launch |
| 2 | Wire auth flow: check `useAuthStore().isInitialized` in root layout, show sign-in or onboarding before tabs. Support anonymous mode properly. | P0 | Any production app |
| 3 | Replace emoji logo with a proper SVG wordmark/icon. At minimum use a custom font for "ScoreSnap" with a distinctive mark. | P1 | Cash App's $, Venmo's "V" |
| 4 | Add a demo/sample contest on first launch so users can see game results, leaderboard, and settlement without creating anything. | P1 | 18Birdies sample round |

---

## 2. Visual Design Quality

### Color Palette

**Current:** `bg: #0a1628` (deep navy), `card: #111d33` (slightly lighter navy), `accent: #00d47e` (bright green), `text: #e8edf5` (light gray), `textDim: #7a8ba8` (muted blue-gray), plus gold, warn (orange), danger (red), purple, blue.

**Assessment: Strong foundation (7/10).** The dark navy + green is golf-appropriate and premium-feeling. It avoids the cliché "golf green" palette. The accent green (#00d47e) has good energy — it reads as money/success, which fits the wagering context perfectly. The dark theme feels right for an app you'd use at the 19th hole.

**Issues:**
- The palette is defined in *two places* (`src/ui/theme.ts` COLORS object AND `tailwind.config.js` colors) and they're nearly identical but use different key names (`textDim` vs `text-dim`). This creates maintenance risk and inconsistency. **P2.**
- There's no semantic color layer. Colors are used directly (`COLORS.warn`, `COLORS.danger`) rather than through semantic tokens like `success`, `error`, `info`. This matters when you want consistent meaning across contexts. **P2.**
- The `accentGlow: "rgba(0,212,126,0.15)"` is the only rgba value — everything else uses hex + string concatenation for opacity (`COLORS.accent + "22"`). This hex-appending pattern (`"#00d47e22"`) works but is fragile and unclear. **P2.**

### Typography

**Current:** System fonts only. No custom font is loaded anywhere (`package.json` has no font packages, no `expo-font` import, no `useFonts` hook). All text uses RN defaults with `fontWeight` variations (400–800).

**Assessment: Weak point (4/10).** System fonts (San Francisco on iOS, Roboto on Android) are readable but generic. Every other app on the user's phone uses them. Premium apps in this space use custom fonts:
- DraftKings: custom sans-serif with distinctive numerals
- ESPN: ESPN-specific font family
- Cash App: Cash App Sans
- 18Birdies: custom heading font

The heavy reliance on `fontWeight: "800"` (extrabold) for emphasis creates visual monotony — everything screams for attention.

**Specific issues:**
- Score numbers on the scorecard (`scorecard.tsx` line 186) use `text-4xl font-extrabold` — this is good for the current hole but the same weight is used for almost every number everywhere.
- The game mode chips in `index.tsx` use `fontSize: 12, fontWeight: "500"` — these are too small and light for comfortable reading in outdoor/bright conditions.
- No `letterSpacing` variation except in section headers. Numbers need tighter tracking for a dashboard feel.

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 5 | Add a custom font for headings and numbers. Inter, Plus Jakarta Sans, or DM Sans would all work. Load via `expo-font`. | P1 | DraftKings, Cash App |
| 6 | Create a typography scale: `display` (scores, big numbers), `heading`, `body`, `caption`, `label`. Apply consistently. | P1 | Any design system |
| 7 | Increase font sizes for outdoor readability. Body text at 12–13px is too small for a golf course. Minimum 14px body, 16px for scores. | P1 | 18Birdies |

### Spacing, Alignment, and Padding

**Assessment: Good but inconsistent (6/10).** The app generally uses 20px horizontal padding (`paddingHorizontal: 20`, `px-5`) and 12–16px gaps. But there are inconsistencies:

- `index.tsx`: Scan card uses `marginHorizontal: 20` but game mode grid uses `paddingHorizontal: 20` — visually identical but coded differently.
- Card border radius varies: 10, 12, 14, 16, 20 — five different radii across the app. The scan hero card is `borderRadius: 20`, contest cards are `borderRadius: 16`, game chips are `borderRadius: 10`, input fields are `borderRadius: 12`, and buttons are `borderRadius: 14`. This needs a system.
- The bottom padding on scrollable screens varies between `paddingBottom: 24`, `h-4`, `h-24`, `height: 32`, and `height: 100` — these are ad-hoc spacers rather than a consistent safe-area-aware approach.

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 8 | Standardize border radii to 3 values: `sm` (8), `md` (14), `lg` (20). Apply consistently across cards, buttons, inputs. | P1 | |
| 9 | Use consistent scroll padding. Define a `BOTTOM_SAFE` constant that accounts for tab bar + safe area. | P2 | |

### Icons

**Assessment: Good (7/10).** The app uses `lucide-react-native` throughout, which is a clean, consistent icon set. Icons are appropriately sized (16–48px depending on context). The use of emoji for game types (🏌️, ⚔️, 💰, 🐺) is a smart choice — it's visually engaging and immediately recognizable.

**One issue:** The Google sign-in button uses a plain "G" text character (`<Text style={{ fontSize: 18 }}>G</Text>`) instead of the actual Google logo. This looks amateurish and potentially violates Google's branding guidelines. **P0 if shipping with Google sign-in.**

### Overall Visual Quality Rating

**Current: Looks like a $2/month utility, not a $5/month premium product.**

The bones are there. The color palette, layout structure, and information hierarchy are solid. What's missing is *texture* — subtle gradients, shadows, border effects, micro-animations, and custom typography that elevate from "functional dark theme" to "premium dark experience."

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 10 | Add subtle gradient backgrounds to hero cards (Scan CTA, Pro upgrade). A slight gradient from `accent + "08"` to `accent + "15"` adds depth. | P2 | DraftKings bet cards |
| 11 | Add shadow/glow to primary CTAs. The scan button in camera mode has this (`shadowColor: COLORS.accent`) — apply similar treatment to all primary buttons. | P2 | Cash App send button |

---

## 3. Core User Flows

### Scan Flow: Camera → OCR → Results

**Current path:** Home → Scan button → Camera view → Capture → "Processing" progress bar → Review screen

**What works well:**
- Camera screen has alignment guides with corner brackets — professional touch (`scan/index.tsx` lines 118–168)
- Haptic feedback on capture (`Haptics.impactAsync`) and completion (`Haptics.notificationAsync`) — great
- Processing screen has contextual status messages ("Detecting scorecard layout...", "Reading scores with AI...", "Validating data...") — builds confidence
- Free scan counter badge is shown pre-capture — honest and clear
- Paywall state within the scan screen is well-handled — doesn't just error, offers clear upgrade path

**Critical problems:**

**The OCR is entirely simulated (P0).** `scan/index.tsx` lines 47–63 use `setInterval` with random increments to fake a progress bar, then navigates to the review screen. `scan/review.tsx` has **hardcoded sample data** (lines 51–79: "M. Thompson", "D.R.", "Chris L", "J. Parks" with preset scores). There is no actual ML Kit integration, no cloud fallback, no image processing whatsoever. The comment on line 51 says "In production: send to ML Kit, then cloud fallback if needed." This is the core value proposition of the app and it's a placeholder.

**The review screen is extremely well-designed but unreachable in reality (P0).** The scan review screen (`scan/review.tsx`) is actually the most sophisticated screen in the app: confidence scoring per cell, color-coded uncertain values, name matching to existing contest players, inline editing, a scorecard grid with Front 9/Back 9 splits. This is genuinely impressive UX. But since the OCR is fake, no user will ever see this working with their actual data.

**No photo preview/confirmation (P1).** After capturing, the user goes straight to "Processing" with no preview of what was captured. If the photo is blurry or poorly framed, there's no chance to retake before consuming their free scan. The scan is consumed at line 35 (`useScan()`) *before* the photo is even processed.

**The scan consumes the free scan before knowing if it succeeded (P0).** `useScan()` is called at line 35 of `scan/index.tsx`, immediately after `handleCapture` is triggered. If `takePictureAsync` fails (line 64 catch block), the scan is already consumed. The user loses their one free scan on a failed capture.

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 12 | Implement actual OCR pipeline (ML Kit on-device → Claude Vision cloud fallback). This is the product. | P0 | Genius Scan, Adobe Scan |
| 13 | Move `useScan()` call to after successful OCR, not before photo capture. | P0 | — |
| 14 | Add photo preview step between capture and processing: "Does this look right?" with retake option. | P1 | Any document scanner |
| 15 | Add a "Try with sample scorecard" demo mode that uses the existing hardcoded data to show the flow without consuming a scan. | P1 | — |

### Contest Creation Flow

**Current path:** 3-step wizard: Players & Course → Games → Review & Create

**What works well:**
- Step progress indicator with green bars is clear (`contest/new.tsx` lines 188–198)
- Course search with tee box selection is surprisingly complete (`CourseSearch.tsx`) — uses a real API (`golfcourseapi.com`), shows tee colors, ratings, slopes
- Team mode toggle is smooth with visual state change (card background color shifts)
- Game selection has emoji icons, free/pro badges, and descriptions
- Haptic feedback on player add/remove, game toggle, and contest creation
- Review step shows a clean summary before committing

**Problems:**

**Step 1 is overwhelming (P1).** Contest name, course search, team toggle, team names, player list with handicaps, group numbers — all on one screen. A slightly drunk golfer at the 19th hole cannot process this. DraftKings breaks bet setup into focused micro-steps.

**No smart defaults (P1).** The contest name defaults to empty, requiring the user to type something creative when they just want to play. Should auto-generate: "Saturday Round", "March 18 at [course]", etc. Player handicap defaults to "0" — most social golfers have a handicap, and 0 is a scratch golfer. Should prompt for it more prominently or default to a common range (15–20).

**The game list shows all 27 games in a flat list (P1).** In Step 2, `ALL_GAMES.map(...)` renders every game sequentially. There's no categorization, no "Popular" section, no recommendation based on player count. A 4-player group should see Wolf and Skins prominently; a 2-player group should see Nassau and Match Play. The pro/free distinction is clear but there's no filtering.

**No way to edit after creation (P1).** Once a contest is created (`router.replace`), there's no edit flow. Can't add a player who showed up late, can't add a game someone suggested on the 3rd hole, can't change the bet unit. The store has `updateContest` but no UI exposes it.

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 16 | Auto-generate contest name based on date + course. "Saturday at Pebble Beach" > blank field. | P1 | — |
| 17 | Add "Quick Setup" option: 2 or 4 players, Skins + Stroke Play, $5 unit. One tap to start. | P1 | DraftKings quick bet |
| 18 | Filter/recommend games based on player count. Don't show 4-player games to a 2-player contest. | P1 | — |
| 19 | Add contest editing after creation (add player, add game, change bet unit). | P1 | — |

### Scorecard Entry

**Current:** Hole-by-hole entry with +/– buttons per player. Horizontal hole selector (1–18). Current hole info shows par, yards, HCP.

**What works well:**
- The +/– stepper UI is golf-standard and works well for one-handed use (`scorecard.tsx`)
- Score coloring using `scoreColor()` (gold for eagle, green for birdie, white for par, orange for bogey, red for double+) is excellent
- Haptic feedback on every score change
- Hole navigation with "← Hole N" / "Hole N →" buttons at bottom
- Group selector for multi-group contests

**Problems:**

**No "complete round" or "finalize" action (P1).** There's no way to mark a contest as finished. The store has `completeContest()` but it's never called from any UI. The contest just sits in "active" state forever. This means settlement amounts keep changing if someone accidentally taps a score.

**No undo on score entry (P2).** If you fat-finger a score, you can correct it with +/–, but there's no undo for the last action. Relevant when entering scores quickly for 4 players.

**The hole selector is tiny on small screens (P2).** 18 holes at `w-10 h-10` with `mx-0.5` spacing means the full strip is ~200px wide. On a 375px-wide iPhone, only ~8 holes are visible at once with no indication that you can scroll. No "Front 9" / "Back 9" separator or label is visible in the scroll strip.

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 20 | Add "Finalize Round" button on scorecard or leaderboard. Locks scores, triggers settlement, marks contest completed. | P0 | 18Birdies "Post Round" |
| 21 | Add Front 9 / Back 9 divider in hole selector strip with a visual gap or label at hole 10. | P2 | — |
| 22 | Show mini-scorecard summary (9-hole totals) above the hole selector for quick reference. | P2 | 18Birdies |

### Results & Settlement

**Current:** Contest detail screen has 4 tabs: Leaderboard, Scorecard, Games, Settlement.

**What works well:**
- Leaderboard with rank badges (gold/silver/bronze), team dots, front/back split, to-par display
- Settlement screen shows net positions (green for winning, red for losing) and individual transactions
- Games screen renders results differently per game type (skins map, Nassau front/back/overall boxes, Stableford rankings)
- Share button exists on settlement screen

**Problems:**

**Zero celebration or emotional payoff (P1).** Winning a skins pot should feel like hitting a jackpot on DraftKings. Currently it's a flat line of text: "M. Thompson — 4 skins · $20". No animation, no confetti, no sound, no visual pop. This is a *betting* app — the emotional highs and lows are the product.

**Settlement "Share Results" button does nothing (P0).** The `Share2` button in `settlement.tsx` line 151 has no `onPress` handler — it's purely visual. Sharing results is critical for the social aspect. This is how the app grows virally.

**The "who owes whom" flow is incomplete (P1).** Settlement shows transactions but there's no way to: mark a payment as settled, link to Venmo/Zelle/Cash App for payment, track running balances across rounds, or see a history of settlements. Compare to Splitwise, which turns "you owe $20" into an actionable payment flow.

**Many game types show placeholder text (P1).** `games.tsx` lines 377–391 catch all unimplemented games with a generic italic message: "{game.name} results calculated per group". For the 18 premium games that aren't stroke_play/skins/nassau/stableford/match_play/best_ball, the Games tab shows nothing useful.

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 23 | Add celebration animation when viewing settlement as a net winner (confetti, green glow, "$20 up" hero number). | P1 | DraftKings win screen |
| 24 | Implement Share Results with shareable image/card (generate a scorecard image). | P0 | 18Birdies share |
| 25 | Add "Settle via Venmo/Cash App" deep links from transaction rows. | P1 | Splitwise |
| 26 | Add "Mark as Settled" toggle per transaction. | P1 | Splitwise |
| 27 | Implement remaining game calculators or clearly label which games are "coming soon" vs active. | P1 | — |

---

## 4. Information Architecture

### Navigation Structure

**Current:** 3-tab bottom nav (Home, Contests, Profile) + modal screens (New Contest, Scan, Paywall) + nested contest detail with 4 sub-tabs (Leaderboard, Scorecard, Games, Settlement).

**Assessment: Mostly good (7/10).** The 3-tab structure is simple and appropriate. Home as the primary CTA surface, Contests as the list view, Profile for account/settings.

**Problems:**

**The Home tab and Contests tab are redundant (P2).** Home shows active contests, completed contests, *and* is the game mode discovery page. Contests tab shows... the same contest list with slightly different formatting. The user has two places that show the same data. Either make Home purely a dashboard/CTA surface (scan + new contest + stats) or merge them.

**Contest sub-tabs use `router.replace` which breaks back navigation (P1).** In `contest/[id]/_layout.tsx` lines 126–129, switching between Leaderboard/Scorecard/Games/Settlement uses `router.replace`. This means the system back button/gesture won't navigate through tab history — it'll exit the contest entirely. Should use a local tab state without URL-based navigation, or use `router.push` with a tab state manager.

**No "History" or "Past Rounds" dedicated section (P2).** Completed contests appear on the Home screen (limited to 3 via `.slice(0, 3)`) and in the Contests tab. But there's no dedicated history/archive view with search, filtering by course, or date ranges. For a golfer who plays 4x/month, after 6 months they'll have 24+ contests with no good way to find a specific one.

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 28 | Fix contest sub-tab navigation: don't use `router.replace` for tabs. Use local state or a proper TabView component. | P1 | — |
| 29 | Differentiate Home (dashboard, CTAs, quick actions) from Contests (full list, search, filter). | P2 | — |
| 30 | Add search/filter to Contests tab (by course, date, status). | P2 | 18Birdies round history |

---

## 5. Trust & Credibility Signals

### Loading States

**Current:** `ActivityIndicator` appears in sign-in screen (line 127) and course search (line 197). Scan processing has a custom progress bar. That's it.

**Missing loading states (P1):**
- Contest list on Home/Contests tab: no skeleton/shimmer while data loads (currently it's in-memory Zustand, but when backed by Supabase this will matter)
- Course search results: the ActivityIndicator is small and easy to miss
- Settlement calculation: no loading indicator for complex multi-game settlements
- Share action: no loading state while generating shareable content

### Error States

**Current:** Sign-in has an error banner (`sign-in.tsx` lines 133–148). Scan review has OCR confidence warnings. That's it.

**Missing error states (P0):**
- Network errors on course search (API fails silently, returns empty array)
- Camera failures (`takePictureAsync` catch just sets phase to "ready" — no user feedback)
- Contest not found shows "Contest not found" plain text — no recovery action
- No global error boundary

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 31 | Add error states with retry actions for all network operations (course search, future OCR). | P0 | Any production app |
| 32 | Add a global error boundary with "Something went wrong" + "Try Again" UI. | P0 | — |
| 33 | Add skeleton/shimmer loading states for list screens. | P1 | DraftKings feed |

### Empty States

**Assessment: Decent (6/10).** Contest list has an empty state with Trophy icon + helpful text (`contests.tsx` lines 32–39). Leaderboard, Games, and Settlement all have empty states with emoji + text. These are functional but bland.

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 34 | Enhance empty states with illustrations (not just emoji) and primary CTA buttons. "No contests yet" should have a prominent "Create Your First Contest" button. | P2 | Venmo empty state |

### Animations & Transitions

**Current:** `react-native-reanimated` is installed but **never imported or used anywhere in the app.** Screen transitions use Expo Router's built-in `animation: "slide_from_right"` and `"slide_from_bottom"`. There are zero custom animations in any component.

**Assessment: Major gap (3/10).** No list item animations, no number counting animations on scores, no transition effects on tab switches, no pull-to-refresh, no press animations on cards (despite having `Pressable` everywhere). The app feels static.

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 35 | Add press scale animation to all Pressable cards/buttons using Reanimated. Even a subtle 0.97 scale on press adds life. | P1 | Cash App buttons |
| 36 | Add counting animation to score numbers and settlement amounts. | P2 | DraftKings odds changes |
| 37 | Add list item stagger animations on screen mount. | P2 | Many modern apps |

### Professional Touches

**Status bar:** Correctly set to `style="light"` in `_layout.tsx`. Good.

**Safe area insets:** Used correctly via `react-native-safe-area-context` with `edges={["top"]}` on most screens. The camera screen handles both top and bottom safe areas. Good.

**Haptic feedback:** Used extensively and appropriately — score changes, captures, contest creation, player add/remove, game toggles. This is a genuine strength.

**Tab bar:** Height is 60px with 8px padding, active tint is accent green. This is standard and appropriate. However, `paddingBottom: 8` may not account for home indicator on iPhone X+ — should use `useSafeAreaInsets` bottom. **P1.**

**Keyboard handling:** `keyboardShouldPersistTaps="handled"` is set on the New Contest scroll view. Good. But there's no `KeyboardAvoidingView` wrapper anywhere, which will cause input fields to be hidden behind the keyboard on smaller screens. **P1.**

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 38 | Add `KeyboardAvoidingView` to all screens with text inputs (New Contest, Scan Review). | P1 | — |
| 39 | Ensure tab bar respects safe area bottom inset for iPhone X+ devices. | P1 | — |

---

## 6. Fun & Personality

### Current Personality Level: Low (3/10)

The app is functional but emotionally flat. The tagline "Scan. Score. Settle." is punchy and good. The game type emojis add visual personality. But beyond that, the app treats golf betting like accounting software.

**What's missing for the golf betting culture:**

**No trash talk / banter support (P2).** Social golfers who bet love trash talk. There's no way to add notes to a hole ("Pressed here and took his lunch money"), no reaction system, no group chat integration.

**No "moments" (P1).** When someone wins a 5-carry skins pot, that should be a *moment*. When someone snakes on 18, that should be dramatic. Currently, results are displayed in flat data tables with identical styling regardless of magnitude.

**No sound effects (P2).** A subtle "cha-ching" on winning, a crowd groan on a triple bogey, a golf clap on birdie — these would add massive personality. The app already imports `expo-haptics`; pairing haptics with sound creates visceral feedback.

**The pro upgrade feels transactional, not aspirational (P2).** The paywall screen (`paywall.tsx`) competently lists features and prices. But it doesn't make you *want* to be a pro user. Compare to DraftKings Crown — the premium tier feels exclusive and desirable.

| # | Fix | Priority | Benchmark |
|---|-----|----------|-----------|
| 40 | Add celebration moments: confetti animation on big skins wins, score popup animations for eagle/albatross, dramatic settlement reveal. | P1 | DraftKings win animations |
| 41 | Add contextual copy with personality. "M. Thompson cleaned up" instead of just "+$45". "Snake holder: D.R. (3-putt on 14 🐍)" instead of just results. | P2 | ESPN alerts |
| 42 | Add "Highlights" section to completed contests: biggest skins pot, worst hole, biggest comeback, etc. | P2 | ESPN game recap |

---

## 7. Technical Debt Affecting UX

### Mixed Styling Approaches

The codebase uses **both** inline `style={{}}` objects and NativeWind `className=""` strings, often in the same file. For example, `contests.tsx` uses `className="flex-1 bg-bg"` for the container but `style={{ backgroundColor: COLORS.accent }}` for the button. `index.tsx` uses almost exclusively inline styles. `contest/new.tsx` mixes both heavily.

This isn't just a code quality issue — it means you can't reliably theme-switch, can't use Tailwind's responsive utilities, and makes it harder for designers to contribute.

| # | Fix | Priority |
|---|-----|----------|
| 43 | Pick one: either go all-in on NativeWind/Tailwind or use a StyleSheet-based system. Mixing both is the worst of both worlds. | P2 |

### State Persistence

**Contest data is entirely in-memory Zustand (P0 for launch).** The store has no persistence layer. Close the app, lose all contests. `expo-sqlite` is listed as a dependency and `src/db/schema.ts` exists, but the store doesn't use either. `AsyncStorage` is also installed but unused.

**Scan count is also in-memory (P0).** The free scan limit resets on every app restart. A user gets infinite free scans by force-quitting. This breaks the monetization model.

| # | Fix | Priority |
|---|-----|----------|
| 44 | Add Zustand persistence with AsyncStorage or SQLite for contests and scan count. | P0 |
| 45 | Server-side scan count tracking via Supabase for paying users. | P0 (for monetization) |

### Missing `userInterfaceStyle`

`app.json` sets `"userInterfaceStyle": "automatic"` but the entire app is hardcoded to dark mode. If a user has light mode system preference, the status bar, keyboard, and system dialogs will be light while the app is dark, creating visual clashes. Should be `"dark"`.

| # | Fix | Priority |
|---|-----|----------|
| 46 | Change `userInterfaceStyle` to `"dark"` in app.json since the app is dark-only. | P1 |

---

## Priority Summary

### P0 — Must Fix Before Launch (Blockers)

1. Wire auth flow / add auth gate to root layout
2. Implement actual OCR pipeline (the core product feature)
3. Fix scan consumption timing (don't consume before success)
4. Add "Finalize Round" action to mark contests complete
5. Implement Share Results functionality
6. Add state persistence (contests + scan count survive app restart)
7. Add error states and global error boundary
8. Add onboarding flow for first-time users

### P1 — Fix Within First Month (Quality Gaps)

9. Replace emoji logo with proper brand mark
10. Add custom font (headings + numbers)
11. Increase font sizes for outdoor readability
12. Standardize border radii and spacing system
13. Add photo preview before OCR processing
14. Add "Quick Setup" one-tap contest creation
15. Filter game recommendations by player count
16. Add contest editing after creation
17. Fix contest sub-tab navigation (don't use `router.replace`)
18. Add celebration/animation moments for wins
19. Add press animations to all interactive elements
20. Add `KeyboardAvoidingView` to input screens
21. Fix tab bar safe area inset
22. Set `userInterfaceStyle` to `"dark"`
23. Add skeleton loading states
24. Add sample/demo contest for first-time experience
25. Add "Settle via Venmo/Cash App" deep links
26. Add "Mark as Settled" toggle on transactions
27. Implement remaining game calculators (or "coming soon" labels)
28. Auto-generate contest names

### P2 — Nice to Have (Polish)

29. Unify styling approach (pick NativeWind or StyleSheet, not both)
30. Semantic color tokens
31. Consistent opacity handling (stop hex-appending)
32. Differentiate Home vs Contests tabs
33. Add search/filter to Contests list
34. Enhanced empty states with illustrations
35. Number counting animations
36. Sound effects for key moments
37. Personality-driven contextual copy
38. Highlights/recap section for completed contests
39. Trash talk / notes on holes
40. Front 9 / Back 9 divider in hole selector

---

## Appendix: File-by-File Reference

| File | Role | Key Issues |
|------|------|------------|
| `app/_layout.tsx` | Root navigator | No auth gate, hardcoded bg color |
| `app/(tabs)/_layout.tsx` | Tab bar | No safe area bottom inset |
| `app/(tabs)/index.tsx` | Home screen | Emoji logo, mixed inline styles, game grid unfiltered |
| `app/(tabs)/contests.tsx` | Contest list | Redundant with Home, mixes className + style |
| `app/(tabs)/profile.tsx` | Profile | Hardcoded "Golfer" name, settings buttons do nothing |
| `app/auth/sign-in.tsx` | Auth screen | Not connected to nav, Google handler is placeholder |
| `app/paywall.tsx` | Subscription | CTA buttons have no purchase logic |
| `app/scan/index.tsx` | Camera/scan | OCR is fake, scan consumed before success |
| `app/scan/review.tsx` | OCR review | Excellent UX design, hardcoded sample data |
| `app/contest/new.tsx` | Contest wizard | Overwhelming step 1, no smart defaults |
| `app/contest/[id]/_layout.tsx` | Contest tabs | `router.replace` breaks back nav |
| `app/contest/[id]/index.tsx` | Leaderboard | Clean but no celebration for winners |
| `app/contest/[id]/scorecard.tsx` | Score entry | No finalize action, no undo |
| `app/contest/[id]/games.tsx` | Game results | 18 games show placeholder text |
| `app/contest/[id]/settlement.tsx` | Settlement | Share does nothing, no payment linking |
| `src/ui/theme.ts` | Color palette | Duplicated in tailwind.config.js |
| `src/ui/CourseSearch.tsx` | Course picker | Well-built, uses real API |
| `src/stores/contest-store.ts` | Contest state | No persistence, data lost on restart |
| `src/stores/scan-store.ts` | Scan tracking | No persistence, free scans infinite |
| `src/stores/auth-store.ts` | Auth state | Properly structured, unused |

---

*End of audit. The foundation here is stronger than most v1 apps. The scoring engine with 27 game types is a genuine competitive advantage. Fix the P0s, polish the P1s, and this becomes a product social golfers will actually pay for.*
