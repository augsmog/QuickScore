# SnapScore Game Mode PRDs — v1.1 Roadmap

**Last updated:** 2026-03-24
**Status:** Planning
**Author:** Augie / Claude

---

## Overview

SnapScore v1.0 ships with 8 fully integrated game modes (calculator + settlement). All 29 calculators are implemented, but 21 games lack settlement integration in `settlement.ts`. This document defines the PRD for each remaining game mode, organized by integration complexity.

### Design Principle: Accuracy Over Speed

**No approximations.** When a game needs data beyond hole scores (3-putts, partner picks, hammer decisions, greenies), we ask the user directly. Golfers are betting real money — they need to trust the numbers. Two collection points exist for auxiliary data:

1. **During manual scorecard entry:** After entering all players' scores for a hole, if the active games require additional info, show a quick follow-up prompt before advancing to the next hole.
2. **After OCR scan verification:** Once scores are confirmed on the review screen, present a "Game Details" questionnaire that walks through each hole asking game-specific questions.

### Current State

| Component | Status |
|-----------|--------|
| Calculators (`src/engine/calculators/`) | All 29 implemented |
| Settlement (`src/engine/settlement.ts`) | 8 game types handled |
| Scorecard entry | Standard 18-hole input only |
| OCR scanning | Reads hole-by-hole scores from scorecards |

### Integration Tiers

**Tier 1 — Settlement-only**: Games that only need a `case` added to `settlement.ts`. Standard hole scores are all that's needed. No new UI.

**Tier 2 — Settlement + per-hole prompts**: Games that need a simple yes/no or player-selection question per hole after scores are entered. Lightweight UI addition.

**Tier 3 — Settlement + multi-field input**: Games that need multiple data points per hole (BBB needs 3 selections per hole). More substantial UI work.

---

## Auxiliary Data Collection — UX Specification

### Pattern A: Scorecard Entry Follow-Up

When a contest includes games from Tier 2/3, the scorecard screen's "confirm" flow (checkmark button / auto-advance to next hole) is intercepted with a bottom-sheet prompt. The prompt appears **after all players' scores are entered for that hole** and **before moving to the next hole**.

```
┌──────────────────────────────────────┐
│                                      │
│  🐺 WOLF · Hole 5                    │
│  Wolf this hole: Augie               │
│                                      │
│  Who did you pick as your partner?   │
│                                      │
│  ┌──────────┐ ┌──────────┐          │
│  │  Billy   │ │  Mike    │          │
│  │  Score: 4│ │  Score: 5│          │
│  └──────────┘ └──────────┘          │
│  ┌──────────┐                       │
│  │  Dave    │                       │
│  │  Score: 3│                       │
│  └──────────┘                       │
│                                      │
│  ─────── OR ───────                  │
│                                      │
│  [ 🐺 LONE WOLF ]                   │
│                                      │
│  [ Skip — Decide Later ]            │
│                                      │
└──────────────────────────────────────┘
```

Rules:
- One prompt per game that needs data for this hole (stacked if multiple side bets active)
- "Skip" option always available — marks this hole as "needs review" and moves on
- Skipped holes show a warning badge on the settlement screen
- Prompts are contextual: Snake only asks if someone scored ≥ par+2; Greenies only shows on par 3s

### Pattern B: Post-OCR Game Details Questionnaire

After the user confirms scores on `scan/review.tsx` and taps "Confirm & Calculate", if the contest includes Tier 2/3 games, we navigate to a new `scan/game-details.tsx` screen instead of immediately committing. This screen walks hole-by-hole through only the questions that apply.

```
┌──────────────────────────────────────┐
│  SCORESNAP                     ?     │
│                                      │
│  Game Details                        │
│  VERIFY SIDE BET RESULTS            │
│                                      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  Progress: ████████░░ 14/18 holes    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                      │
│  HOLE 15 · Par 3 · 165 yds          │
│                                      │
│  🐍 SNAKE                            │
│  Did anyone 3-putt?                  │
│  [ No one ] [ Augie ] [ Billy ] ... │
│                                      │
│  🟢 GREENIES                         │
│  Who won the greenie?                │
│  [ No one ] [ Augie ] [ Billy ] ... │
│  (Only players who made par shown)   │
│                                      │
│         [ ← Prev ]  [ Next → ]      │
│                                      │
│  ─────────────────────────────────   │
│  [ Skip All — Use Scores Only ]     │
│                                      │
└──────────────────────────────────────┘
```

Rules:
- Only shows holes where at least one active game needs input
- Pre-selects obvious answers when possible (e.g., if only one player made par on a par 3, auto-select for greenie)
- "Skip All" option commits with auxiliary fields empty — these games settle as $0 rather than with wrong data
- Back/forward navigation so users can review previous holes
- Final screen shows summary of all auxiliary data before committing

### Data Model Extension

Add to `Player` interface in `types.ts`:
```typescript
export interface Player {
  id: string;
  name: string;
  handicap: number;
  team?: "A" | "B" | null;
  scores: number[];          // 18 holes, 0 = not yet played
  putts?: number[];          // 18 holes, 0 = not entered (for Snake)
}
```

Add to `Contest` interface in `contest-store.ts`:
```typescript
export interface Contest {
  // ... existing fields ...
  auxiliaryData?: {
    wolf?: { [hole: number]: { partnerId: string | null; isLoneWolf: boolean } };
    hammer?: { [hole: number]: { hammered: boolean; hammerBy: string; accepted: boolean } };
    snake?: { [hole: number]: string[] };  // player IDs who 3-putted
    greenies?: { [hole: number]: string | null };  // player ID of greenie winner
    bbb?: { [hole: number]: { bingo: string; bango: string; bongo: string } };
  };
}
```

This keeps auxiliary data cleanly separated from core scores, making it optional and backward-compatible.

---

## Tier 1 — Settlement-Only Integration

These games use standard hole scores and only need settlement logic wired up. No UI changes.

---

### 1. Nassau with Presses (`nassau_press`)

**Category:** Money Games | **Players:** 2 | **Premium:** Yes

**What it is:** Standard Nassau (front 9, back 9, overall) with automatic press bets that trigger when a player falls 2-down in any active bet.

**Calculator:** Uses `calcNassau` as base, extends with press tracking. Each press is a new mini-match starting from the current hole.

**Settlement logic:**
```
For each active bet (front, back, overall, + all presses):
  If p1 winning → p2 pays p1 betUnit
  If p2 winning → p1 pays p2 betUnit
  If tied → no payment
```

**Scorecard integration:** Standard hole scores. No additional input needed.

**OCR integration:** Works directly — same hole-by-hole scores as regular Nassau.

**Settlement effort:** Medium — need to track multiple overlapping bets with different start holes.

**Ship priority:** High — Nassau is already implemented, this is the natural upgrade for serious players.

---

### 2. Nines (`nines`)

**Category:** Points | **Players:** 4 (exactly) | **Premium:** Yes

**What it is:** 9 points distributed each hole: best score gets 5, second gets 3, third gets 1, worst gets 0. Ties split points.

**Calculator:** `calcNines` — fully implemented with tie-splitting logic.

**Settlement logic:**
```
After 18 holes:
  Each player's net = (their points - 40.5) × betUnit
  Players above 40.5 collect, players below pay
```

**Scorecard/OCR:** Standard hole scores. No additional input.

**Settlement effort:** Low — straightforward point-difference calculation.

**Ship priority:** High — popular foursome format.

---

### 3. Vegas (`vegas`)

**Category:** Team Money | **Players:** 4 (2v2) | **Premium:** Yes

**What it is:** Team scores on each hole combined into a 2-digit number (lower score first). Difference between team numbers = points won/lost.

**Calculator:** `calcVegas` — fully implemented.

**Settlement logic:**
```
Net = team1Won - team2Won
Team 2 each pays team 1 each (net × betUnit / 2), or vice versa
```

**Scorecard/OCR:** Standard hole scores. Requires teams assigned (already supported).

**Settlement effort:** Low.

**Ship priority:** High — extremely popular team gambling format.

---

### 4. Sixes / Round Robin (`sixes`)

**Category:** Rotating | **Players:** 4 (exactly) | **Premium:** Yes

**What it is:** Partners rotate every 6 holes. Everyone plays with and against everyone.

**Calculator:** `calcSixes` — implemented with rotation logic.

**Settlement logic:**
```
For each 6-hole segment:
  Winning team's players each collect betUnit from losing team's players
Net across all 3 segments determines final settlement
```

**Scorecard/OCR:** Standard hole scores.

**Settlement effort:** Low-Medium.

**Ship priority:** Medium.

---

### 5. Closeout (`closeout`)

**Category:** Match | **Players:** 2 | **Premium:** Yes

**What it is:** Head-to-head match play where a new match begins whenever one player clinches. Multiple matches = multiple bets.

**Calculator:** `calcCloseout` — tracks match boundaries and results.

**Settlement logic:**
```
Net = (matches won - matches lost) × betUnit
```

**Scorecard/OCR:** Standard hole scores.

**Settlement effort:** Low.

**Ship priority:** Medium.

---

### 6. Quota (`quota`)

**Category:** Handicap | **Players:** 2-8 | **Premium:** Yes

**What it is:** Target = 36 − handicap. Earn Stableford points. Beat your quota to win.

**Calculator:** `calcQuota` — fully implemented.

**Settlement logic:**
```
Winner = player with highest (points - quota)
Winner collects betUnit from each other player
```

**Scorecard/OCR:** Standard hole scores + handicap (already stored).

**Settlement effort:** Low.

**Ship priority:** Medium.

---

### 7. Chicago (`chicago`)

**Category:** Handicap | **Players:** 2-8 | **Premium:** Yes

**What it is:** Similar to Quota. Target = 36 − handicap. Highest net Stableford score wins.

**Calculator:** `calcChicago` — fully implemented.

**Settlement logic:** Same pattern as Quota.

**Scorecard/OCR:** Standard hole scores + handicap.

**Settlement effort:** Low.

**Ship priority:** Medium.

---

### 8. Aces & Deuces (`aces_deuces`)

**Category:** Bonus | **Players:** 2-8 | **Premium:** Yes

**What it is:** Birdie+ = collect 1 unit from each player. Double bogey+ = pay 1 unit to each player.

**Calculator:** `calcAcesDeuces` — counts aces and deuces per player.

**Settlement logic:**
```
Net per player = (aces - deuces) × (numPlayers - 1) × betUnit
```

**Scorecard/OCR:** Standard hole scores.

**Settlement effort:** Low.

**Ship priority:** Medium.

---

### 9. Dots / Trash (`dots`)

**Category:** Points | **Players:** 2-8 | **Premium:** Yes

**What it is:** Points for achievements: Birdie+ = +2, Par = +1, Bogey = 0, Double+ = −1.

**Calculator:** `calcDots` — fully implemented.

**Settlement logic:**
```
Net per player = (total dots - average dots) × betUnit
```

**Scorecard/OCR:** Standard hole scores.

**Settlement effort:** Low.

**Ship priority:** Medium.

---

### 10. Rabbit (`rabbit`)

**Category:** Chase | **Players:** 2-8 | **Premium:** Yes

**What it is:** Lowest scorer catches the rabbit. Holder at holes 9 and 18 wins the pot.

**Calculator:** `calcRabbit` — tracks possession through 18 holes.

**Settlement logic:**
```
Hole 9 holder collects betUnit from each player (front rabbit)
Hole 18 holder collects betUnit from each player (back rabbit)
```

**Scorecard/OCR:** Standard hole scores.

**Settlement effort:** Low.

**Ship priority:** Medium.

---

### 11. Defender (`defender`)

**Category:** Strategy | **Players:** 3-8 | **Premium:** Yes

**What it is:** Rotating defender vs the field. Defender wins = collects from all. Field wins = defender pays the winner.

**Calculator:** `calcDefender` — rotation and comparison logic implemented.

**Settlement logic:**
```
Per hole: defender wins → collect betUnit each; field wins → pay betUnit to winner
Sum across 18 holes
```

**Scorecard/OCR:** Standard hole scores.

**Settlement effort:** Medium.

**Ship priority:** Low-Medium.

---

### 12. Fourball (`fourball`)

**Category:** Team | **Players:** 4 (2v2) | **Premium:** Yes

**What it is:** Best ball of each partnership in match play format.

**Calculator:** `calcFourBall` — implemented.

**Settlement logic:**
```
Match play: if Team A wins → Team B pays betUnit each
```

**Scorecard/OCR:** Standard hole scores with teams assigned.

**Settlement effort:** Low.

**Ship priority:** High.

---

### 13. Scramble (`scramble`)

**Category:** Team | **Players:** 2-4 per team | **Premium:** Yes

**What it is:** All hit, play from best shot. One score per team per hole.

**Calculator:** `calcScramble` — uses minimum score per hole across team.

**Settlement logic:**
```
Team with lowest total wins. Losers pay betUnit each.
```

**Scorecard consideration:** Enter team score under one player's row, leave others at 0. Future: add team-score entry mode.

**OCR:** Works if one player per team has scores.

**Settlement effort:** Low.

**Ship priority:** Very High — most popular team format.

---

### 14. Shamble (`shamble`)

**Category:** Team | **Players:** 2-4 per team | **Premium:** Yes

**What it is:** Best drive selected, then own ball in. Team's best score counts.

**Calculator:** `calcShamble` — minimum score per team per hole.

**Settlement logic:** Same as Best Ball.

**Scorecard/OCR:** Standard per-player scores.

**Settlement effort:** Low.

**Ship priority:** Medium.

---

### 15. Alternate Shot (`alternate_shot`)

**Category:** Team | **Players:** 2 per team | **Premium:** Yes

**What it is:** Partners alternate shots, one ball per team.

**Settlement logic:** Team vs team stroke play. Lower total wins.

**Scorecard:** Enter under one player's row.

**Settlement effort:** Low.

**Ship priority:** Low.

---

### 16. Chapman (`chapman`)

**Category:** Team | **Players:** 2 per team | **Premium:** Yes

**What it is:** Both drive, swap, pick best, then alternate.

**Settlement logic:** Same as alternate shot.

**Settlement effort:** Low.

**Ship priority:** Low.

---

### 17. Banker (`banker`)

**Category:** Strategy | **Players:** 3-8 | **Premium:** Yes

**What it is:** Rotating banker takes all bets. Banker rotation is deterministic (based on hole number mod player count), so no extra input needed.

**Calculator:** `calcBanker` — implemented with auto-rotation.

**Settlement logic:**
```
Per hole:
  Banker lowest → each other player pays banker betUnit
  Player beats banker → banker pays that player betUnit
  Tie with banker → push
```

**Scorecard/OCR:** Standard hole scores. Rotation is automatic.

**Settlement effort:** Medium.

**Ship priority:** Medium.

---

## Tier 2 — Settlement + Per-Hole Prompts

These games need a simple question answered per hole. Each uses the follow-up prompt pattern described in the UX Specification above.

---

### 18. Wolf (`wolf`)

**Category:** Strategy | **Players:** 4 (exactly) | **Premium:** Yes

**What it is:** Rotating Wolf chooses a partner or goes Lone Wolf. Wolf + partner vs other two.

**Calculator:** `calcWolf` — needs to accept partner selection input rather than auto-selecting.

**Auxiliary data needed per hole:**
- Who is the Wolf? (auto-determined: hole number mod 4)
- Who did the Wolf pick? (player selection, or Lone Wolf)

**Scorecard prompt (appears after all 4 scores entered for the hole):**
```
🐺 WOLF · Hole 5
Wolf: Augie (auto-assigned)

Pick your partner:
  [ Billy · scored 4 ]
  [ Mike · scored 5 ]
  [ Dave · scored 3 ]

    ── or ──

  [ 🐺 LONE WOLF ]
```

**Post-OCR questionnaire:** Same question for each hole, showing each player's score for context.

**Settlement logic:**
```
Lone wolf wins → collect betUnit × 3
Lone wolf loses → pay betUnit × 3
Team wins → wolf+partner each collect betUnit from other pair
Team loses → wolf+partner each pay betUnit to other pair
```

**Settlement effort:** Medium — per-hole with variable multiplier based on lone wolf.

**Ship priority:** Very High — one of the most requested game modes.

---

### 19. Hammer (`hammer`)

**Category:** Pressure | **Players:** 2 | **Premium:** Yes

**What it is:** Head-to-head where either player can "hammer" (double the bet). Opponent must accept or concede.

**Auxiliary data needed per hole:**
- Was a hammer dropped? (yes/no)
- If yes: who dropped it?
- Did the opponent accept or concede?

**Scorecard prompt (appears after both scores entered):**
```
🔨 HAMMER · Hole 7
Current bet: $5

Was a hammer dropped this hole?

  [ No Hammer ]

  [ Augie hammered ]  [ Billy hammered ]

  ↓ (if hammer selected) ↓

  Did they accept?
  [ Accepted — played out ]  [ Conceded ]
```

**Post-OCR questionnaire:** Same question per hole.

**Settlement logic:**
```
Base value = betUnit
Each hammer doubles: betUnit → betUnit×2 → betUnit×4 ...
Winner takes the current value
Concede = conceding player pays current value without finishing hole
```

**Calculator update needed:** `calcHammer` must accept hammer event data instead of approximating from score margins. Accept events array: `{ hole: number, hammeredBy: string, accepted: boolean }[]`.

**Settlement effort:** Low-Medium.

**Ship priority:** High — intense drama, very popular.

---

### 20. Snake (`snake`)

**Category:** Putting | **Players:** 2-8 | **Premium:** Yes

**What it is:** Last player to 3-putt holds the snake. Snake holder at round end pays everyone.

**Auxiliary data needed per hole:**
- Did anyone 3-putt this hole? (multi-select players)

**Scorecard prompt (appears after scores entered, only if any score ≥ par+1):**
```
🐍 SNAKE · Hole 12

Did anyone 3-putt this hole?

  [ No one 3-putted ]

  [ Augie ]  [ Billy ]  [ Mike ]  [ Dave ]
    (tap all who 3-putted)

  [ Confirm ]
```

The prompt is **contextual** — it only appears when at least one player's score suggests a possible 3-putt (bogey or worse). If everyone made par or better, no prompt is needed since 3-putting and still making par is extremely rare.

**Post-OCR questionnaire:** Same question per hole. Skip holes where all scores ≤ par.

**Calculator update needed:** `calcSnake` must accept explicit 3-putt data: `{ hole: number, playerIds: string[] }[]` instead of approximating from double-bogeys.

**Settlement logic:**
```
Last player to 3-putt holds the snake
Snake holder pays betUnit to each other player
No 3-putts in the round = no snake payment
```

**Settlement effort:** Low.

**Ship priority:** High — extremely popular side bet.

---

### 21. Greenies (`greenies`)

**Category:** Par 3s | **Players:** 2-8 | **Premium:** Yes

**What it is:** On par 3s, closest to the pin wins — but only if they make par or better.

**Auxiliary data needed:** On par 3 holes only — who won the greenie?

**Scorecard prompt (auto-appears on par 3 holes after all scores entered):**
```
🟢 GREENIE · Hole 4 (Par 3)

Who was closest to the pin?

  [ No one / No greenie ]

  [ Augie · 3 ✓ ]    ← only players who made par shown
  [ Billy · 3 ✓ ]
  [ Mike · 4 ✗ ]      ← greyed out, didn't make par
  [ Dave · 2 ✓ ]
```

Players who didn't make par or better are shown but disabled/greyed out with an indicator that they didn't qualify (score > par). This teaches the rule while preventing invalid selections.

**Post-OCR questionnaire:** Only shown for par 3 holes (typically 4 per round). Very quick.

**Calculator update needed:** `calcGreenies` must accept explicit greenie winner per par-3 hole rather than approximating from lowest score.

**Settlement logic:**
```
Per par 3 with a greenie winner:
  Winner collects betUnit from each other player
```

**Settlement effort:** Low.

**Ship priority:** High — very popular side bet, and the questionnaire is only 4 holes.

---

## Tier 3 — Settlement + Multi-Field Input

These games need multiple data points per hole.

---

### 22. Bingo Bango Bongo (`bingo_bango_bongo`)

**Category:** Points | **Players:** 2-8 | **Premium:** Yes

**What it is:** Three points per hole: Bingo (first on green), Bango (closest to pin when all on green), Bongo (first to hole out).

**Auxiliary data needed per hole:** Three player selections (bingo winner, bango winner, bongo winner).

**Scorecard prompt (appears after all scores entered for the hole):**
```
🎯 BINGO BANGO BONGO · Hole 7

BINGO — First on the green:
  [ Augie ]  [ Billy ]  [ Mike ]  [ Dave ]

BANGO — Closest to pin (all on green):
  [ Augie ]  [ Billy ]  [ Mike ]  [ Dave ]

BONGO — First to hole out:
  [ Augie ]  [ Billy ]  [ Mike ]  [ Dave ]

  [ Confirm ]
```

**Post-OCR questionnaire:** This is the most input-heavy game — 3 selections × 18 holes = 54 taps. To make it manageable:
- Default "Bongo" to the player with the lowest score on the hole (usually correct — first to hole out often has fewest putts)
- Allow batch-skip with "I don't remember" → those holes award no BBB points
- Show a summary at the end for quick review

**Calculator update needed:** `calcBBB` must accept explicit per-hole event data rather than approximating all three from scores.

**Settlement logic:**
```
Each BBB point = betUnit from each other player
Net = (points won - points others won from you) × betUnit
```

**Settlement effort:** Low.

**Ship priority:** Medium — fun format but the 3-per-hole input is the heaviest UX burden of any game.

---

## Implementation Roadmap

### v1.1 Sprint (This Week) — Tier 1 Settlement Blitz

Wire up all 17 Tier 1 games (including Banker) that need only settlement.ts cases. Remove "Coming Soon" badges for these games.

**settlement.ts additions needed:**

```typescript
// Pure score-based — just need case blocks
case "nassau_press":    // extend nassau with press tracking
case "nines":           // point-difference payout
case "vegas":           // team net payout
case "sixes":           // 3-segment team payout
case "closeout":        // match-count payout
case "quota":           // quota-surplus winner
case "chicago":         // same pattern as quota
case "aces_deuces":     // ace/deuce count × betUnit
case "dots":            // point-difference payout
case "rabbit":          // hole 9 + 18 rabbit holder
case "defender":        // per-hole rotation
case "fourball":        // team match play
case "scramble":        // team stroke play
case "shamble":         // team best ball
case "alternate_shot":  // team stroke play
case "chapman":         // team stroke play
case "banker":          // per-hole banker rotation
```

**Estimated effort:** 2-3 hours.

**After this sprint:** 25 of 29 games are fully playable. The remaining 4 (Wolf, Hammer, Snake, Greenies) + BBB stay "Coming Soon" until their input UI is built.

### v1.2 Sprint (This Week / Next) — Tier 2 Input UI

Build the per-hole prompt system and wire up:

1. **Auxiliary data model** — add `auxiliaryData` to Contest type, `putts` to Player type
2. **Scorecard follow-up prompt component** — reusable bottom-sheet that fires between holes
3. **Post-OCR game-details screen** — `scan/game-details.tsx`
4. **Game-specific prompts:**
   - Wolf partner selection
   - Hammer yes/no + accept/concede
   - Snake 3-putt multi-select
   - Greenies par-3 winner pick
5. **Calculator updates** — Wolf, Hammer, Snake, Greenies accept auxiliary data
6. **Settlement cases** for Wolf, Hammer, Snake, Greenies

**Estimated effort:** 1-2 days.

**After this sprint:** 29 of 29 games playable. BBB can ship as the final addition.

### v1.3 Sprint (Next Week) — BBB + Polish

1. BBB 3-field per-hole input
2. Team score entry mode (for Scramble/Alternate Shot)
3. Enhanced OCR: detect team-format scorecards

---

## Scorecard & Scanning Matrix

| Game | Scores Only | Aux Input | Prompt Type | OCR + Questionnaire | Status |
|------|:-:|:-:|:-:|:-:|:-:|
| Nassau Press | Yes | — | — | Yes | v1.1 |
| Nines | Yes | — | — | Yes | v1.1 |
| Vegas | Yes | Teams | — | Yes | v1.1 |
| Sixes | Yes | — | — | Yes | v1.1 |
| Closeout | Yes | — | — | Yes | v1.1 |
| Quota | Yes | HCP | — | Yes | v1.1 |
| Chicago | Yes | HCP | — | Yes | v1.1 |
| Aces & Deuces | Yes | — | — | Yes | v1.1 |
| Dots | Yes | — | — | Yes | v1.1 |
| Rabbit | Yes | — | — | Yes | v1.1 |
| Defender | Yes | — | — | Yes | v1.1 |
| Fourball | Yes | Teams | — | Yes | v1.1 |
| Scramble | Yes* | Team mode | — | Partial | v1.1 |
| Shamble | Yes | — | — | Yes | v1.1 |
| Alternate Shot | Yes* | Team mode | — | Partial | v1.1 |
| Chapman | Yes* | Team mode | — | Partial | v1.1 |
| Banker | Yes | — | — | Yes | v1.1 |
| Wolf | Yes | Partner pick | 1 select/hole | Scores + questionnaire | v1.2 |
| Hammer | Yes | Hammer events | 1-2 taps/hole | Scores + questionnaire | v1.2 |
| Snake | Yes | 3-putt data | Multi-select/hole | Scores + questionnaire | v1.2 |
| Greenies | Yes | Pin winner | 1 select/par 3 | Scores + questionnaire | v1.2 |
| BBB | Yes | 3 events/hole | 3 selects/hole | Scores + questionnaire | v1.3 |

*Team formats: enter one score per team; individual rows left at 0.

---

## Key Architecture Decisions

1. **No approximations.** If a game needs auxiliary data, it stays "Coming Soon" until the input UI is built. Golfers betting real money need to trust the numbers completely. Wrong is worse than unavailable.

2. **Auxiliary data is structurally separate.** The `auxiliaryData` object on Contest is optional and keyed by game type. Core scoring works independently. This keeps the existing calculator/settlement pipeline clean.

3. **Two collection points, same data model.** Whether collected during live scorecard entry (Pattern A) or post-OCR (Pattern B), the data flows into the same `auxiliaryData` structure and feeds the same calculators.

4. **Contextual prompts only.** Snake prompt only appears when someone might have 3-putted (score ≥ bogey). Greenies only on par 3s. Wolf only on the Wolf's hole. This keeps the entry flow fast when side bets don't apply to a given hole.

5. **Settlement is zero-sum.** Every dollar paid equals a dollar collected. `netByPlayer` always sums to 0.

6. **Calculator ↔ Settlement separation.** Calculators produce game results from scores + auxiliary data. Settlement converts results to financial transactions. This keeps calculators testable and reusable regardless of bet amounts.

7. **Skip = $0, not wrong.** If a user skips auxiliary data entry for a game, that game settles at $0 for the skipped holes. Never infer or approximate what happened.
