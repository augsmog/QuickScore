# SnapScore — Target Personas & Gap Analysis

## 6 Target Personas

---

### 1. "Saturday Skins" Steve — The Weekend Wagerer
**Age:** 35–50 | **Handicap:** 12–20 | **Rounds/month:** 2–4
**Who he is:** Plays every Saturday with the same 3 guys. They always have money on it — skins, nassau, maybe a press. The "math guy" in the group who tracks bets on the back of the scorecard, then argues at the bar about who owes what.

**Why he downloads SnapScore:** Tired of bar-napkin math. Wants to scan the card, get the settlement, and Venmo each other before the second beer.

**Core needs:**
- Fast contest setup (same 4 guys, same games, every week)
- Scorecard scanning that actually works
- Accurate settlement with Venmo/CashApp links
- Share results to the group text

**What he'll pay for:** Unlimited scans + all game modes. He's the first to buy lifetime.

---

### 2. "Track Everything" Tina — The Stat-Driven Improver
**Age:** 28–40 | **Handicap:** 8–15 | **Rounds/month:** 4–8
**Who she is:** Takes golf seriously. Tracks handicap, knows her GIR%, and wants to see trends over time. Uses GHIN already. Might play in a club league.

**Why she downloads SnapScore:** Wants a single app that handles scoring AND the betting side games her group plays. Hates switching between 3 apps.

**Core needs:**
- Accurate stroke play scoring with stats
- Handicap tracking over time
- Round history with course-specific data
- Clean, professional UI (hates gimmicky apps)

**What she'll pay for:** Annual — if stats tracking works. Won't pay if the profile page is all mock data.

---

### 3. "Just Tell Me What I Owe" Jake — The Casual Participant
**Age:** 25–35 | **Handicap:** 22–36 (or doesn't know) | **Rounds/month:** 1–2
**Who he is:** Plays when invited. Doesn't know what Nassau means. Gets dragged into bets by his friends. Just wants to know if he won or lost and how much.

**Why he downloads SnapScore:** His buddy Steve told everyone to download it before the round.

**Core needs:**
- Zero learning curve — open app, see scores, see what he owes
- Don't need to understand game rules to use it
- Quick sign-up or skip entirely
- Settlement screen that's dead simple

**What he'll pay for:** Nothing. He's a free tier user forever. But he's critical — he's how the app spreads virally.

---

### 4. "Tournament Director" Tom — The Group Organizer
**Age:** 40–60 | **Handicap:** 5–15 | **Rounds/month:** 3–6
**Who he is:** Organizes the annual buddies' trip, the work outing, the charity scramble. Manages 8–20 players across multiple groups. Currently uses spreadsheets.

**Why he downloads SnapScore:** Wants one place to manage a multi-group event with different game formats, then settle everything at the end.

**Core needs:**
- Multi-group contest support
- Team formats (scramble, best ball, shamble)
- Settlement across all groups/games combined
- Export or share results to everyone at once
- Reliable — can't have it crash during a 20-person outing

**What he'll pay for:** Pro monthly during event season, or lifetime if he runs events regularly.

---

### 5. "Content Creator" Casey — The Golf Influencer
**Age:** 22–32 | **Handicap:** 5–12 | **Rounds/month:** 6–10
**Who she is:** Posts golf content on Instagram/TikTok. Films her rounds. Loves apps that look good on camera and produce shareable content.

**Why she downloads SnapScore:** Wants to show the scorecard results and settlement in her videos. Loves the scan feature as content.

**Core needs:**
- Beautiful, screenshot-worthy UI
- Shareable results (images, not just text)
- Quick scanning that looks impressive on video
- The app itself needs to look premium in screenshots

**What she'll pay for:** Monthly — if the sharing features are good enough to justify it in her content.

---

### 6. "Old School" Oscar — The Reluctant Tech Adopter
**Age:** 55–70 | **Handicap:** 10–18 | **Rounds/month:** 4–8
**Who he is:** Plays a lot. Keeps a physical handicap card. Skeptical of apps. His kids or younger playing partners are pushing him to try it.

**Why he downloads SnapScore:** Someone in his group set it up and handed him the phone to enter scores.

**Core needs:**
- Large, readable text and buttons
- Intuitive score entry (the numpad is key for him)
- Works offline / no account required
- Doesn't feel overwhelming

**What he'll pay for:** Won't buy himself, but might accept if someone gifts it or sets it up for him.

---

## Gap Analysis: Persona vs. Current App

### Scoring Each Persona (Ready / Gaps / Broken)

| Feature | Steve (Wagerer) | Tina (Stats) | Jake (Casual) | Tom (Organizer) | Casey (Influencer) | Oscar (Old School) |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|
| Onboarding | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auth (skip/Apple) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Contest creation | ✅ | ✅ | ⚠️ Needs Steve | ✅ | ✅ | ⚠️ Needs help |
| Score entry (manual) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Scorecard scanning | ⚠️ OCR mocked | ⚠️ OCR mocked | N/A | ⚠️ OCR mocked | ⚠️ OCR mocked | N/A |
| Stroke play calc | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Skins calc | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Nassau calc | ✅ | ✅ | N/A | ✅ | ✅ | ✅ |
| Stableford calc | ✅ | ✅ | N/A | ✅ | N/A | ✅ |
| Wolf/Banker/Hammer | ❌ Stub | N/A | N/A | ❌ Stub | N/A | N/A |
| Team games (scramble etc.) | N/A | N/A | N/A | ❌ Stub | N/A | N/A |
| Settlement display | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Venmo/CashApp links | ⚠️ No recipient | N/A | ⚠️ No recipient | ⚠️ No recipient | N/A | N/A |
| Share results | ⚠️ Text only | ⚠️ Text only | ✅ Text is fine | ⚠️ Text only | ❌ Needs images | ⚠️ Text only |
| Profile stats | N/A | ❌ All mock | N/A | N/A | N/A | N/A |
| Round history | N/A | ❌ Mock | N/A | N/A | N/A | N/A |
| Handicap tracking | N/A | ❌ Missing | N/A | N/A | N/A | N/A |
| Cloud sync | ⚠️ Local only | ❌ Need it | ⚠️ Local only | ❌ Need it | ⚠️ Local only | ✅ Fine |
| Paywall/Pro | ✅ | ✅ | ✅ Free tier | ✅ | ✅ | ✅ Free tier |

### Legend
- ✅ = Works well enough for v1.0 launch
- ⚠️ = Has limitations but won't block launch
- ❌ = Broken, stubbed, or missing — risks bad reviews

---

## Critical Gaps for App Store Submission THIS WEEK

### 🔴 Must Fix Before Submission (Blocks approval or causes immediate 1-star reviews)

**1. Game calculators that are stubs**
~15 premium game modes return empty/placeholder results. If a Pro user selects Wolf and gets no results, that's a refund request.

**Options:**
- **A) Disable the stub games entirely** — only show the 7 that work (stroke, match, stableford, skins, skins carry, nassau, best ball). Rename "25+ games" to "7 game modes" in marketing. Ship honest.
- **B) Ship all 27 but mark unfinished ones as "Coming Soon"** — users see them but can't select them yet.
- **C) Sprint to implement the top 5 missing calcs** (Wolf, Hammer, Nines, Vegas, Scramble) and disable the rest.

**Recommendation: Option B.** It's honest, shows ambition, and doesn't break anything. Users see what's coming.

**2. Profile page is 100% mock data**
Scoring avg 82.4, GIR 44%, wagering history, course history — all hardcoded. Any user who plays a round and goes to their profile will see fake data that doesn't match their scores. This is the most obvious "this is half-baked" signal.

**Fix:** Replace mock stats with real calculations from contest-store data. Even if the stats are basic (number of rounds, average score from completed contests), real data is better than fake data.

**3. OCR scanning is mocked**
The ML Kit implementation returns fake data. Claude Vision is wired but depends on the API key being set. If scanning is your headline feature and it doesn't work, that's a problem.

**Fix:** Verify Claude OCR works in the TestFlight build with a real EXPO_PUBLIC_ANTHROPIC_API_KEY. If ML Kit isn't implemented, that's okay — Claude alone is fine for v1. But test it.

### 🟡 Should Fix (Won't block approval but hurts retention)

**4. Venmo/CashApp deep links don't specify recipient**
The links open the payment app but don't pre-fill who to pay. Users have to manually find the person. This makes the "settle instantly" promise feel broken.

**Fix:** Add a Venmo/CashApp username field to player profiles during contest creation.

**5. No contest deletion**
Users can't remove old contests. The list just grows forever.

**Fix:** Add a long-press → delete option or swipe-to-delete on contest list items.

**6. Google Sign-In is a stub**
Shows an alert saying "requires OAuth configuration." Either implement it or remove the button entirely.

**Fix:** Remove the Google Sign-In button for v1. Apple Sign-In + anonymous is enough for iOS.

**7. "How It Works" button goes to contest creation**
On the home screen, the ghost button labeled "How It Works" actually navigates to `/contest/new`. That's confusing UX.

**Fix:** Either rename it to "New Contest" or point it to an actual explainer.

### 🟢 Can Wait (Post-launch improvements)

- Cloud sync / Supabase integration
- Real handicap tracking / GHIN integration
- Shareable scorecard images (for Casey persona)
- Push notifications
- Friend list / social features
- Course database improvements
- Contest export (PDF/CSV)
- Settlement history persistence

---

## Recommended v1.0 Scope (Ship This Week)

**What's in:**
- Manual score entry (works great)
- 7 fully working game modes
- Settlement calculation + Venmo/CashApp links
- Text-based results sharing
- Apple Sign-In + anonymous mode
- 1 free scan + Pro subscription ($2.99/$19.99/$29.99)
- Beautiful redesigned UI
- Scan feature (with Claude Vision, verified working)

**What's honestly communicated:**
- Remaining games shown as "Coming Soon"
- Profile stats calculated from real contest data (even if basic)
- No cloud sync yet (local-only, noted in onboarding or FAQ)

**What's removed:**
- Google Sign-In button (not ready)
- Mock profile data (replaced with real calculations)
- Any "25+ games" claims in UI (say "7 game modes + more coming")

This scope gives every persona a good first experience, avoids the "fake data" problem, and gives you a real product to iterate on with TestFlight feedback.
