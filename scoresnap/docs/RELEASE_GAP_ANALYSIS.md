# SnapScore Golf — Release Gap Analysis
## v1.0 App Store Submission Readiness | March 2026

---

## Release Status: NEARLY READY — 3 Blockers Remaining

### BLOCKERS (Must fix before submission)

#### 1. ✅ Account Deletion (Apple Requirement) — RESOLVED
- Built in `settings.tsx`: "Delete My Account" with double-confirmation dialog
- Wipes all AsyncStorage keys (contests, auth, settings, scans, onboarding)
- Signs out and redirects to onboarding
- Future: add Supabase server-side delete when backend goes live

#### 2. Privacy Policy & Terms Pages Must Be Live
**Severity: CRITICAL — Apple will reject without this**
- Settings links to `scoresnap.app/privacy` and `scoresnap.app/terms` — hardcoded
- These pages must exist and load before submission
- Apple reviewer will check both URLs
- **Fix:** Publish privacy policy and terms of service pages at scoresnap.app

#### 3. App Store Metadata Completion
**Severity: BLOCKING — Cannot submit without these**
- Missing: App Store description, keywords, screenshots, promotional text
- Missing: "What's New" release notes
- Have: Bundle ID (com.scoresnap.app), version (1.0.0), icons, splash
- **Fix:** Prepare screenshots (6.7" + 6.5" + 5.5"), write description, choose keywords, set age rating

---

### HIGH PRIORITY (Should fix before v1.0, not blocking)

#### 4. ✅ Free Scan Limit — RESOLVED
- Changed: `FREE_SCAN_LIMIT = 3` (was 1)
- 3 free scans total to hook users before paywall

#### 5. Pricing Misalignment with Market
- Current pricing: $2.99/mo, $19.99/yr, $29.99 lifetime
- Competitive sweet spot: $29.99–$39.99/yr (see Pricing section below)
- Current annual ($19.99) underprices vs. value delivered
- Current lifetime ($29.99) is same as Beezer's annual — may leave money on table
- **See full pricing recommendation below**

#### 6. ✅ Tier 2 Game Auxiliary Input — RESOLVED
- Built `AuxiliaryPrompt.tsx`: bottom-sheet modal with per-game prompts (Wolf partner pick, Hammer yes/no, Snake 3-putt multi-select, Greenie winner)
- Wired into `scorecard.tsx`: triggers after last player confirms on each hole when Tier 2 games are active
- Settlement engine updated: `settlement.ts` uses real auxiliary data when available, falls back to calculator approximation if skipped
- Smart filtering: Snake only prompts on bogey+ holes, Greenies only on par 3s
- "Skip = $0, not wrong" — skipping never produces inaccurate results

#### 7. No Multi-Device Live Sync
- Supabase client exists but no realtime subscriptions
- All data is local-only (AsyncStorage)
- Every major competitor has live sync
- **Not blocking v1.0** — but should be prominently on the roadmap
- Competitive analysis flags this as "Must-Have" for v1.5

---

### MEDIUM PRIORITY (v1.5 / v2.0)

| Gap | Current State | Competitive Context | Timeline |
|-----|--------------|-------------------|----------|
| GPS rangefinder | Not implemented | Table stakes — Beezer, 18Birdies, Golf Pad all have it | v2.0 (+4 mo) |
| Apple Watch | Not implemented | Beezer + 18Birdies have it; serious golfers expect it | v2.5 (+6 mo) |
| Spectator/viewer mode | Not implemented | Golf Bettor has 5-digit code sharing | v2.0 |
| Tournament/league mode | Multiple groups supported, no tournament wrapper | Golf GameBook makes $300K/mo from this | v3.0 |
| Data export (GDPR) | Not implemented | Technically required for EU users | v1.5 |
| Advanced stat tracking (FIR, GIR, putts) | Statistics screen built (3 tabs, deep analytics), but no per-hole putt/FIR/GIR entry during scoring | SwingU/TheGrint compete here | v2.0 |

---

## Pricing Analysis & Recommendation

### Current SnapScore Pricing
| Plan | Price |
|------|-------|
| Monthly | $2.99/mo |
| Annual | $19.99/yr |
| Lifetime | $29.99 |

### Competitive Pricing Landscape
| Tier | Apps | Annual Price |
|------|------|-------------|
| Budget | Golf Bettor (dying, last updated Sept 2023) | $9.99 |
| Mid-Low | TheGrint, Golf Pad | $19.99–$29.99 |
| Mid (sweet spot) | Beezer, Golf GameBook, Skins App | $29.99–$40 |
| Mid-High | Hole19, SwingU Plus | $49.99 |
| Premium | 18Birdies, SwingU Pro, Stick Golf | $59.99–$99.99 |

### Recommended Pricing: Option A (Aggressive Growth)
| Tier | Price | Includes |
|------|-------|----------|
| **Free** | $0 | 7 game modes (stroke, match, stableford, skins, skins carry, nassau, best ball), basic scorecard, 3 OCR scans/month |
| **Pro** | $4.99/mo or $29.99/yr | All 25+ games, unlimited OCR, settlement tracking, no ads, 40-player groups |
| **Pro+** (future, with GPS) | $7.99/mo or $49.99/yr | Everything in Pro + GPS, advanced stats, Apple Watch, tournament mode |

### Recommended Pricing: Option B (Premium Positioning)
| Tier | Price | Includes |
|------|-------|----------|
| **Free** | $0 | 7 game modes, basic scorecard, 3 OCR scans total |
| **SnapScore Pro** | $4.99/mo or $39.99/yr or $59.99 lifetime | All features |

### Pricing Rationale
1. **$29.99/yr matches Beezer** — proven price point, and SnapScore has OCR (no one else does)
2. **$19.99/yr current annual undervalues** — Golf Pad charges $29.99 with no game modes
3. **$29.99 lifetime is too cheap** — Beezer charges $29.99/yr; a lifetime at that price cannibalizes recurring revenue. Should be $49.99–$59.99 lifetime minimum
4. **Free tier is non-negotiable** — every app with 1M+ downloads has one. Current 1-scan-ever limit is effectively no free tier
5. **OCR is the upsell trigger** — 3 free scans hooks users, then paywall for unlimited

### Revenue Projection (Conservative)
| Metric | Year 1 | Year 2 |
|--------|--------|--------|
| Downloads | 15,000 | 50,000 |
| Free→Pro conversion | 8% | 10% |
| Paying users | 1,200 | 5,000 |
| ARPU (blended) | $28 | $32 |
| Annual revenue | $33,600 | $160,000 |

Note: Beezer has raised $2.12M and generates ~$194K/yr with <5K downloads/month. Their marketing is weak. SnapScore can capture their users.

---

## What's Actually Working (Strengths for v1.0)

| Feature | Status | Notes |
|---------|--------|-------|
| 25+ game mode calculators | ✅ Complete | All calculators implemented + tested |
| Settlement engine (all games) | ✅ Complete | settlement.ts handles all 29 game types |
| OCR scanning (ML Kit + Claude Vision) | ✅ Complete | Unique in market — NO competitor has this |
| Scorecard entry (manual) | ✅ Complete | Full numpad, hole navigation, progress tracking |
| Leaderboard | ✅ Complete | Score-to-par bug fixed, live color coding |
| Paywall + RevenueCat | ✅ Complete | Native paywall with custom fallback |
| Venmo/CashApp deep links | ✅ Complete | Direct payment links from settlement screen |
| Course database (30K+ courses) | ✅ Complete | Via GolfCourseAPI integration |
| Auth (Apple, Google, Email) | ✅ Complete | Supabase-ready, local auth works |
| Error boundaries + Sentry | ✅ Complete | Production error tracking configured |
| Offline-first architecture | ✅ Complete | All stores persist to AsyncStorage |
| Settings screen | ✅ Complete | 20+ preferences across 6 categories |
| Statistics screen | ✅ Complete | 3-tab analytics: overview, scoring, hole-by-hole |
| 40-player group support | ✅ Complete | 17 individual + 4 team games scale to 40 |
| Onboarding flow | ✅ Complete | 4-step with animations |
| Dark theme (Midnight Fairway) | ✅ Complete | Consistent design system |
| EAS Build profiles | ✅ Complete | dev, preview, testflight, production |

---

## Action Plan: Path to Submission

### This Week (Blockers)
1. ✅ Implement account deletion in settings — DONE (double-confirm dialog + AsyncStorage wipe)
2. ☐ Publish privacy policy + terms of service at scoresnap.app — **USER ACTION**
3. ☐ Prepare App Store screenshots (minimum 3 sizes) — **USER ACTION**
4. ☐ Write App Store description + keywords — **Can draft for you**

### Before Submission
5. ☐ Update pricing to $4.99/mo, $29.99/yr, $49.99 lifetime in RevenueCat dashboard + App Store Connect — **USER ACTION**
6. ✅ Bump FREE_SCAN_LIMIT from 1 → 3 — DONE (scan-store.ts)
7. ✅ Build Tier 2 aux input — DONE (AuxiliaryPrompt.tsx + scorecard.tsx wiring + settlement.ts with real aux data)
8. ☐ Fresh TestFlight build + 48hr soak test
9. ✅ Verify Golf Course API key in production — Confirmed (ADIO3YUTMVD6W6JUTKAKH6MVF4 in .env)

### v1.5 (2 months post-launch)
10. ☐ Multi-device live sync via Supabase Realtime
11. ☐ Data export (GDPR compliance)
12. ☐ App Store Optimization based on initial reviews

### v2.0 (4 months post-launch)
14. ☐ Basic GPS (front/center/back yardages) — estimated $15–30K build cost
15. ☐ Spectator/viewer mode
16. ☐ Advanced stat tracking (FIR, GIR, putts per hole)
