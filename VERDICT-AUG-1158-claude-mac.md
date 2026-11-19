# CHECKER VERDICT — chk-AUG-1158-28ecae774bb0-20261116T100632

- Ticket: AUG-1158 (Refs AUG-1159). Builder: OpenAI/Codex (ss-infra). Checker: anthropic/claude-code (claude-mac, opus). File-only, no Linear writes.
- Head SHA: 28ecae774bb0f88c9d064f6ab55f61410b70376e (worktree HEAD == enqueued sha; clean tree bar this verdict file). Base origin/main. Tier: HIGH.

## VERDICT: PASS (code scope only; AUG-1159 lifecycle gate explicitly RETAINED)

### Scope reviewed (5 files, git diff origin/main...HEAD)
1. `app/(tabs)/index.tsx` — Home ScrollView now `style={{flex:1, marginBottom: useBottomTabBarHeight()}}` + `contentContainerStyle={{paddingBottom:20}}`, replacing the old 100px fudge.
2. `app/contest/[id]/leaderboard.tsx` — Gross/Net toggle: container 36→48, each segment 32→44, redundant `hitSlop{top:6,bottom:6}` removed.
3. `e2e/journeys/home-rank-layout.browser.test.mjs` — NEW, 3 safe-area profiles × 2 cases.
4. `tests/leaderboard-toggle-style.test.cjs` — source guard updated to the new values.
5. `.github/workflows/web-smoke.yml` — contract-browser command gains `BASE_URL=http://127.0.0.1:8092` and the new test.

### Verification
- **Hook validity**: `useBottomTabBarHeight` IS exported by the installed `@react-navigation/bottom-tabs@7.15.5`; it throws only outside a bottom-tab screen. `app/(tabs)/index.tsx` is a direct `Tabs.Screen` under `(tabs)/_layout.tsx`, whose tab bar is `position:"absolute"` — the exact case where react-navigation adds NO auto content inset, so reserving the real tab-bar height is the correct fix (the old 100px was a hardcoded guess). Context is always present → no throw.
- **No regression in executing tests**: `aug826-pro-affordances.test.cjs` only `fs.readFileSync`s `(tabs)/index.tsx` as text (never transpiles/executes it), so the new import cannot break it. Confirmed by running jest: `leaderboard-toggle-style` + `aug826` → 14/14 PASS at this head. The updated unit test is strengthened (asserts 150x48, two `height:44`, no `hitSlop`), not weakened.
- **CI change is targeted**: the 4 pre-existing contract-browser tests use `page.setContent()` with a hardcoded sentinel host `:8192` (an offline-block target, never served) and ignore `BASE_URL` entirely — so forcing `BASE_URL=8092` is a no-op for them and required by the new test, which loads the real export. Port 8092 (`dist-web-sharing`) is already up at that step (lines 178–199). Home/toggle layout is flag-independent, so dist-web-sharing is a valid export to render.
- **Toggle semantics intact**: simple two-pill background-color switch, no animated indicator pinned to 32px; visible targets now 72×44 (≥44×44), container 48 = 44 + 2·2 padding; selection unchanged.
- **New test correctness (static)**: `node --check` OK; iterates the 3 real `SAFE_AREA_PROFILES`; test 1 asserts scroll-viewport bottom ≤ Home tab top (the marginBottom fix) and last card reachable/tappable; test 2 asserts both rank pills ≥44×44, ≤2px overlap, and gross↔net background selection toggles. No false-pass risk. (Builder's "six-profile" = 6 test cases, not 6 profiles — terminology, not a defect.)
- `git diff --check` clean.

### Advisory (NON-BLOCKING, per brief)
- The new browser test + the full web-smoke contract-browser matrix require a live Expo export on :8092 and Playwright chromium, which cannot run file-only on the Mac (no server/export). That is the separate exact-head green-CI merge gate; builder evidence shows green 6/6 at :8196. Everything verifiable file-only was verified.
- This verdict covers the code diff only. It does NOT declare AUG-1159 parent acceptance met: J-settlement-mark-lifecycle still FAILs at entry on undersized 33px Home game-mode chips (sibling AUG-1157). That lifecycle gate remains REQUIRED before parent close.

VERDICT: PASS
