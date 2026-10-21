# SnapScore Core Flow Documentation

This document describes the complete user flow through the app, from landing to settlement.

## 📱 Screen-by-Screen Flow

### 1. Landing / Home Screen
**File:** `app/(tabs)/index.tsx`

**What Users See:**
- **Active Contests** section (empty for new users)
- **Completed Contests** section (with history)
- **Quick Actions:**
  - 🎮 "New Contest" button (primary CTA)
  - 📸 "Quick Scan & Settle" button
  - 🔍 "Browse Game Modes" link

**Sample Contest Card:**
```
┌─────────────────────────────────┐
│ Saturday Morning Round          │
│ Pebble Beach                    │
│                                 │
│ 🏌️ 4 players • 3 games         │
│ 💰 $5/game • Active             │
│                                 │
│ [View Details →]                │
└─────────────────────────────────┘
```

**Actions:**
- Tap "New Contest" → Contest Setup
- Tap existing contest → Contest Detail
- Tap "Quick Scan" → Camera (mobile only)

---

### 2. New Contest Setup
**File:** `app/contest/new.tsx`

**Flow Steps:**

#### Step 1: Course Selection
```
Search courses...
━━━━━━━━━━━━━━━━━━━━━━

Recent Courses:
• Pebble Beach (Par 72)
• Torrey Pines South (Par 72)
• Bethpage Black (Par 71)

[+ Add Custom Course]
```

#### Step 2: Player Setup
```
Group 1  [+ Add Player]
─────────────────────────
• Mike T. (HCP: 12)    [×]
• Dave R. (HCP: 8)     [×]
• Chris L. (HCP: 15)   [×]
• Jay P. (HCP: 10)     [×]

[+ Add Another Group]
```

#### Step 3: Game Selection
```
Select Games to Play
━━━━━━━━━━━━━━━━━━━━━━

Popular Combinations:
✓ Stroke Play
✓ Skins (Carryover)
□ Nassau
□ Stableford

All Games (29):
• Individual (4)
• Betting (14)
• Point Games (6)
• Team Games (5)

Bet Unit: $5 per game
```

#### Step 4: Review & Create
```
Contest Summary
━━━━━━━━━━━━━━━━━

Saturday Morning Round
Pebble Beach (Par 72)

Players: 4
Games: 2 (Stroke Play, Skins)
Bet: $5/game

Total Pot: $40

[Create Contest]
```

---

### 3. Contest Detail / Score Entry
**File:** `app/contest/[id]/index.tsx`

**Layout:**

```
┌────────────────────────────────────┐
│ Saturday Morning Round         ⚙️ │
│ Pebble Beach                       │
├────────────────────────────────────┤
│                                    │
│ 📸 Scan Scorecard                 │
│ ✏️  Enter Scores Manually          │
│                                    │
├────────────────────────────────────┤
│                                    │
│ 🏆 Leaderboard  💰 Settlement      │
│                                    │
└────────────────────────────────────┘
```

**Tabs:**
1. **Overview** (shown above)
2. **Scorecard** (hole-by-hole entry)
3. **Games** (game-specific results)
4. **Settlement** (money flows)

---

### 4. Scorecard (Manual Entry)
**File:** `app/contest/[id]/scorecard.tsx`

**Hole-by-Hole Grid:**

```
      1   2   3   4   5   6   7   8   9  OUT
Par   4   5   4   3   4   3   4   5   4   36
─────────────────────────────────────────────
Mike  5   6   4   3   5   3   5   6   4   41
Dave  4   5   5   4   4   3   4   5   5   39
Chris 5   7   4   4   6   4   5   5   5   45
Jay   4   5   4   3   5   4   5   6   4   40

      ↓ Tap any cell to edit
```

**Score Entry Modal:**
```
┌──────────────────┐
│ Mike • Hole 1    │
│                  │
│      [ 5 ]       │
│                  │
│  1  2  3  4  5   │
│  6  7  8  9  0   │
│                  │
│ [Cancel] [Save]  │
└──────────────────┘
```

---

### 5. Live Leaderboard
**File:** `app/contest/[id]/index.tsx` (Leaderboard tab)

**During Round:**
```
Leaderboard (thru 9)
━━━━━━━━━━━━━━━━━━━━━

Stroke Play:
1. Dave R.     39  (+3) 💰
2. Jay P.      40  (+4)
3. Mike T.     41  (+5)
4. Chris L.    45  (+9)

Skins:
Dave R.    3 skins 💰
Mike T.    1 skin
Jay P.     0 skins
Chris L.   0 skins
```

**After Round:**
```
Final Results
━━━━━━━━━━━━━━

Stroke Play:
🥇 Dave R.     77  (+5)
🥈 Jay P.      79  (+7)
🥉 Mike T.     82  (+10)
4th Chris L.   86  (+14)

Skins (Carryover):
Dave R.    7 skins
Mike T.    4 skins
Jay P.     3 skins
Chris L.   2 skins
Push       2 skins
```

---

### 6. Settlement Summary
**File:** `app/contest/[id]/settlement.tsx`

**Money Flows:**

```
Settlement
━━━━━━━━━━━━━━━━━━━━━━━

Net Position:
Dave R.    +$30.00 💰
Mike T.     -$5.00
Jay P.     -$10.00
Chris L.   -$15.00
           -------
Total:      $0.00 ✓

Transaction Breakdown:

Stroke Play ($5):
• Mike T.  → Dave R.   $5.00
• Jay P.   → Dave R.   $5.00
• Chris L. → Dave R.   $5.00

Skins ($5/skin, 16 won):
• Mike T.  → Dave R.   $7.50
• Jay P.   → Dave R.   $10.00
• Chris L. → Dave R.   $7.50

[Share Results] [Settle with Venmo]
```

---

### 7. Camera Scan Flow (Mobile Only)
**Files:** 
- `app/scan/index.tsx` (camera)
- `app/scan/review.tsx` (review)

**Step 1: Camera View**
```
┌─────────────────────────────────┐
│ [×] Cancel         [OFF][ON][⚡]│
│                                 │
│    ┌─────────────────────┐     │
│    │                     │     │
│    │                     │     │
│    │     Scorecard       │     │
│    │     Viewfinder      │     │
│    │                     │     │
│    │                     │     │
│    └─────────────────────┘     │
│                                 │
│  Align your scorecard in frame │
│  Ensure scores are legible      │
│                                 │
│  [📷]  🔘  [🔄]                 │
└─────────────────────────────────┘
```

**Step 2: Processing**
```
Processing Scorecard
━━━━━━━━━━━━━━━━━━━━

[████████░░░░░░░░░░] 65%

Reading scores with AI...
```

**Step 3: Review & Confirm**
```
Digitized Scores
⚠ 3 FLAGGED

Par:  4  5  4  3  4  3  4  5  4  ...
Mike: 5  6  4  3  5⚠ 3  5  6  4  ...
Dave: 4  5  5  4  4  3  4  5  5  ...

Tap any score to edit

[Rescan] [Confirm & Calculate →]
```

---

### 8. Quick Scan & Settle (No Contest)
**Flow:** Scan → Review → Auto-create contest → See results

**Use Case:** Weekend round, just want to settle up quickly without contest management.

```
Quick Settle
━━━━━━━━━━━━━━━━━

Detected Players:
• M. Thompson (82)
• D.R. (77)
• Chris L (86)
• J. Parks (79)

Auto-selected games:
✓ Stroke Play
✓ Skins

[Calculate Settlement →]
```

---

## 🎮 Example Complete Flow

### Scenario: Saturday Morning Foursome

**Players:** Mike (12), Dave (8), Chris (15), Jay (10)  
**Course:** Pebble Beach (Par 72)  
**Games:** Stroke Play + Skins (Carryover)  
**Bet:** $5/game

**Flow:**

1. **Home** → Tap "New Contest"
2. **Setup** → Select Pebble Beach
3. **Setup** → Add 4 players with handicaps
4. **Setup** → Select Stroke Play + Skins
5. **Setup** → Set bet to $5
6. **Setup** → Create contest
7. **Contest Detail** → Choose input method:
   - **Option A:** Tap "Scan Scorecard" (mobile)
     - Point camera at scorecard
     - Review & confirm scores
   - **Option B:** Tap "Enter Scores Manually"
     - Enter hole-by-hole scores
8. **Leaderboard** → View live standings (after every hole)
9. **Settlement** → See final money flows
10. **Share** → Export results or pay via Venmo

**Total Time:**
- Setup: 2 minutes
- Score entry (manual): 5 minutes
- Score entry (scan): 30 seconds
- Review settlement: 1 minute

**Result:**
```
Final Settlement:
Dave R.  +$30 (won both games)
Jay P.   -$10
Mike T.   -$5
Chris L. -$15

Zero-sum validated ✓
```

---

## 🔄 Alternative Flows

### Flow 1: Quick Start (Demo Mode)
```
Home → Quick Start → Auto-filled contest with 4 players
```

### Flow 2: Scan First (No Setup)
```
Home → Quick Scan → Review → Auto-create contest → Settlement
```

### Flow 3: Manual Entry Only (Web)
```
Home → New Contest → Setup → Manual Entry → Settlement
```

### Flow 4: Multi-Group Tournament
```
Home → New Contest → Add 3 groups of 4 → Different games per group
```

---

## 🎯 Key User Actions Per Screen

### Home
- Create new contest
- View existing contest
- Quick scan
- Browse games

### Setup
- Search/select course
- Add/remove players
- Set handicaps
- Select games
- Set bet amount
- Create contest

### Contest Detail
- Scan scorecard (mobile)
- Enter scores manually
- View leaderboard
- View settlement
- Share results
- Edit contest settings

### Scorecard
- Tap cell to edit score
- Swipe between front/back
- Auto-save changes
- View running totals

### Settlement
- See net position
- See transaction breakdown
- Share results
- Pay via Venmo (future)

---

## 📊 Data Flow

```
Score Entry (Manual or Scan)
    ↓
Per-Hole Validation
    ↓
Update Contest Store
    ↓
Trigger Calculation Engine
    ↓
Calculate All Games (29 available)
    ↓
Generate Transactions
    ↓
Validate Zero-Sum
    ↓
Display Results
```

---

## 🚀 Performance Notes

- **Score entry latency:** < 100ms per hole
- **Calculation time:** < 50ms for all games (4 players)
- **Calculation time:** < 200ms for all games (40 players)
- **Settlement generation:** < 100ms
- **OCR processing:** 2-5 seconds (mobile only)

---

## 🔒 Data Persistence

**Offline Mode (Web & Mobile):**
- All data stored in AsyncStorage (mobile) or localStorage (web)
- No cloud sync
- Survives app restarts
- Cleared on sign-out

**Future (Supabase Sync):**
- Real-time sync across devices
- Shared contest access
- Historical data backup
- Cross-device leaderboards

---

## Summary

The app provides **three main entry paths**:

1. **Full Contest Flow** (manual setup → score entry → results)
2. **Quick Scan & Settle** (scan → auto-detect → results)
3. **Demo Mode** (pre-filled data → explore features)

All three paths converge at the settlement summary, where users see:
- Final leaderboard
- Game-by-game results
- Money flows
- Net position per player

The entire flow is designed to be completed in under 10 minutes, with the scan path taking as little as 2 minutes from scorecard photo to final settlement.
