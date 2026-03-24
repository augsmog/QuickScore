# SnapScore Design Overhaul — Premium & Minimal

**Goal:** Transform SnapScore from "vibecoded AI app" to "feels like a $10M startup built it."
**North Star:** Oura Ring, Arc Browser, Linear — restrained, intentional, expensive-feeling.
**Timeline:** 2–3 focused days across all screens.

---

## The Problem

The app works well functionally but visually screams "AI-generated." The tells:

1. **Emoji as identity** — ⛳ at 48–64px is the app's entire brand presence
2. **Gradient + glow on everything** — LinearGradient wrappers, accent shadows, hex opacity stacking (`COLORS.gold + "22"`)
3. **No typographic system** — system fonts at arbitrary weights, no custom typeface
4. **Competing visual elements** — home screen has 6+ distinct sections fighting for attention
5. **Inconsistent styling** — half NativeWind, half inline. Disabled states vary (0.5 vs 0.8 opacity)
6. **Color overload** — 14 named colors, each with 3–4 opacity variants. Too many accent colors per screen
7. **No whitespace discipline** — 10–20px margins everywhere, nothing breathes

---

## Phase 1: Design Foundation (Day 1)

### 1.1 — Custom Font: Inter

Install `expo-font` and load **Inter** (400, 500, 600, 700). It's the typeface of Linear, Vercel, and most premium tech products. Free from Google Fonts.

Update `theme.ts` typography to reference Inter explicitly. Use only 4 weights:

- **Inter 700** — headings, primary labels
- **Inter 600** — buttons, emphasis
- **Inter 500** — body, secondary labels
- **Inter 400** — captions, metadata

Kill all `fontWeight: "800"`. Extra-bold is the #1 vibecode tell.

### 1.2 — Color Palette Refinement

Current palette has too many named colors and relies on hex opacity tricks. Simplify:

**Keep:**
- `bg: "#0a1628"` — great base
- `accent: "#00d47e"` — distinctive, works
- `text: "#e8edf5"` — good contrast
- `textDim: "#7a8ba8"` — fine secondary

**Change:**
- `card: "#0f1a2e"` — bring closer to bg (less contrast = more premium)
- `border: "#1a2740"` — softer, barely visible dividers

**Remove from active use:**
- `purple`, `blue` as accent colors on the home screen
- Category color system (14 category colors is visual noise)
- `gold` overuse — reserve strictly for Pro badge, nothing else

**Add:**
- `textMuted: "#4a5d78"` — for tertiary info
- `surface: "#111c30"` — for subtle elevation without borders

**Kill the opacity modifier pattern.** Replace `COLORS.gold + "22"` with named tokens:
```typescript
accentSurface: "rgba(0, 212, 126, 0.06)",
accentBorder: "rgba(0, 212, 126, 0.12)",
```

### 1.3 — Spacing & Radius System

Define a strict scale and use nothing else:

```typescript
SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 }
RADII = { sm: 8, md: 12, lg: 16 }  // Kill borderRadius: 20, too bubbly
```

Page horizontal padding: always `SPACE.lg` (24px). No more 20px.

### 1.4 — Shadow System

Replace per-component shadows with 2 presets:

```typescript
SHADOWS = {
  sm: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3 },
  md: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
}
```

**Delete all colored shadows** (e.g., `shadowColor: COLORS.accent`). Colored shadows = vibecoded.

### 1.5 — Reusable Component Library

Create these base components in `src/ui/`:

- **`Card`** — surface bg, optional 1px border, consistent radius and padding
- **`Button`** — primary (filled accent), secondary (ghost with border), text-only. All with Inter 600.
- **`SectionHeader`** — label + optional action link. Replaces ad-hoc section headings.
- **`ListItem`** — standard row with left content, right chevron. For settings, contests, etc.
- **`Badge`** — small pill (e.g., "PRO", "LIVE", "3 players"). Consistent across app.
- **`Divider`** — hairline or spaced. Kill inconsistent `borderWidth: 1` usage.

---

## Phase 2: Screen Rewrites (Day 2)

### 2.1 — Home Screen (Biggest Impact)

**Current problem:** 6 sections competing — hero scan card, quick actions, active contests, completed contests, game grid, game modal. Way too much.

**New structure:**

```
[Status bar]

SnapScore                              [Profile avatar]

[If active contests exist:]
  Active Round                    →
  Pine Valley · 4 players · Hole 7

[Primary CTA - Scan or New Round]
  Simple filled button, no gradient, no glow.
  "Start a Round" or "Scan Scorecard"

[Recent rounds - simple list]
  Saturday Skins · Pine Valley
  Thursday Nassau · Merion

[Game modes - collapsed]
  "25+ Games Available" → tap to expand
  NOT a grid of 25 items on the home screen
```

Key changes:
- **Remove the 48px emoji header.** Use a clean text wordmark or the actual app icon at small size.
- **Kill the LinearGradient hero card.** Replace with a simple filled button or a clean card with no gradient.
- **Remove Quick Start card.** It's a power-user feature — bury it or add as a long-press option.
- **Collapse the game modes section.** Link to a dedicated games screen or use a "Browse Games" row.
- **Let the active contest be the hero** when one exists. That's what users care about.

### 2.2 — Scorecard Entry

This screen is actually the best designed in the app. Keep the core layout but:

- Replace the colored score borders (gold/green/orange/red per hole) with a single subtle indicator
- Use the custom font for score numbers
- Reduce the hole navigation pill size — they're too chunky
- Make the +/- buttons larger with more tap area but visually simpler (outline style, not filled)

### 2.3 — Settlement Screen

Currently over-animated with ChipStack, ScoreCounter, trophy emoji. For premium feel:

- **Remove ChipStack animation.** Replace with a clean summary card showing the winner's name in large type.
- **Keep ScoreCounter** but make it subtle (200ms, not dramatic)
- Transaction rows should look like a banking app — clean, with status indicators
- Venmo/Cash App buttons should be secondary actions, not prominent

### 2.4 — Profile Screen

Current profile screen has upgrade upsells mixed with user info. Separate concerns:

- **Top:** User info (name, avatar, member since)
- **Middle:** Stats row (rounds, scans, win rate) — clean numeric display
- **Bottom:** Settings list (simple ListItem rows)
- **Upgrade:** If free tier, one tasteful banner at top — not a gold-themed card with pricing badges

### 2.5 — Onboarding

The 3-slide onboarding with custom animations (GolfBallScene, ScanBeamScene, LeaderboardScene) is overkill. Premium apps have minimal onboarding:

- **Option A:** Single screen — app name, one-line value prop, Sign In with Apple button. That's it.
- **Option B:** Keep 3 slides but remove the animated scenes. Use simple illustrations or just large typography.

### 2.6 — Auth Screen

- Remove the 64px emoji
- Clean wordmark or logo
- Sign In with Apple (standard Apple button style)
- "Continue without account" as text link below, not a bordered button

---

## Phase 3: Polish & Consistency (Day 3)

### 3.1 — Migrate to Consistent Styling

Pick one approach and standardize. Recommendation: **NativeWind for layout** (flex, padding, margin, gap) + **theme.ts constants for colors and typography** via inline styles. This hybrid is fine — just be consistent.

Remove all bare string colors from components. Everything should reference COLORS or the Tailwind config.

### 3.2 — Animation Audit

Keep:
- AnimatedPressable (spring press feedback) — this is good
- Score counter animation on scorecard
- Page transitions (slide/fade)

Remove or simplify:
- ChipStack (settlement celebration)
- ConfettiOverlay
- GolfBallScene, ScanBeamScene, LeaderboardScene (onboarding)
- RollingBall, GameToken

Rule of thumb: if an animation is decorative rather than informational, cut it.

### 3.3 — Icon Consistency

Currently using Lucide throughout — this is fine. But ensure:
- Icons are always 20px in navigation/actions
- Icons are always `COLORS.textDim` unless they represent an action state
- No emoji-as-icons in the main UI (keep emoji only for game type indicators in the game list)

### 3.4 — Loading & Empty States

Replace `Skeleton.tsx` with content-specific empty states that feel intentional:
- Empty home: "No rounds yet. Start your first one."
- Empty leaderboard: "Scores will appear here as you play."
- Loading: Simple activity indicator, no skeleton shimmer.

### 3.5 — Final Sweep

- Ensure all disabled states use `opacity: 0.4` consistently
- Ensure all pressable feedback uses AnimatedPressable with `scaleValue={0.98}` (subtle)
- Verify safe area handling on all screens
- Test on iPhone SE (small screen) and iPhone 15 Pro Max (large screen)

---

## Implementation Order (Priority)

1. **theme.ts** — new font, refined colors, spacing scale, shadow presets
2. **Component library** — Card, Button, SectionHeader, ListItem, Badge
3. **Home screen** — biggest visual impact, most-seen screen
4. **Auth + Onboarding** — first impression
5. **Profile** — cleanup upsell mess
6. **Scorecard** — light polish, already decent
7. **Settlement** — de-animate, clean up
8. **Contest creation** — form cleanup, consistent inputs
9. **Scan screen** — simplify camera overlay
10. **Final consistency pass** — grep for leftover inline colors, inconsistent spacing

---

## What NOT to Change

- **The green accent color** — it's distinctive and works
- **The dark theme** — premium apps are almost always dark-first
- **The core UX flow** — scan → score → settle is solid
- **The game engine** — 30+ calculators is a real moat, don't touch
- **Zustand store architecture** — clean and functional
- **AnimatedPressable** — keep as the universal touch feedback
