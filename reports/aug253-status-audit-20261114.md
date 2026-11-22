# AUG-253 status audit (Nov 14 2026, claude-mac fallback lane)

Ticket: AUG-253 "Tournament leaderboard at 72+: virtualized list, search, My group, pinned You row" (Figma 15:2).
Audited at `origin/main` as of this branch's base. Screen: `scoresnap/app/contest/[id]/leaderboard.tsx`. Row model: `scoresnap/src/engine/leaderboard-rows.ts`.

## Acceptance items vs main

| Item from the ticket | On main? | Where | Test |
|---|---|---|---|
| FlashList, 44 pt rows, not ScrollView | FlashList yes; 44 pt row height not pinned (FlashList 2 auto-measures, see comment at `LeaderboardResultsList.tsx:50`) | `LeaderboardResultsList.tsx` (individual view uses FlashList, ScrollView only in groups view) | `tests/leaderboard-flash-list.test.cjs`, `tests/leaderboard-72-player-smoke.test.cjs` |
| Search players | Yes (AUG-735 / 253g) | `playerQuery` -> `buildLeaderboardRows({ query })`; ranks fixed over the whole field first | `tests/leaderboard-search.test.cjs` |
| My group filter | Yes | `myGroupOnly` + `viewerGroupId` from an **approved** online membership | `src/engine/__tests__/leaderboard-rows.test.ts` |
| T ties | Yes | `rankLabel` = `T<rank>` when tied | `leaderboard-rows.test.ts` |
| THRU: tee time before start, F when finished | Yes (253n, AUG-747, AUG-760) | `thru ?? teeTime ?? "—"`, current-round THRU for multi-round | `tests/leaderboard-round-columns.test.cjs` |
| R1 / Today columns from RoundInfo | Yes (253m / 253v) | `roundInfo.r1` / `roundInfo.today` | `tests/leaderboard-round-columns.test.cjs`, `tests/leaderboard-round-course.test.cjs` |
| Pinned You row | **Chrome only** (253j) | `youPlayerId = getFixtureYouPlayerId()` - a test/debug global, `undefined` in production | `tests/leaderboard-you-chrome.test.cjs` |

Test run on this branch: `cd scoresnap && npx jest tests/leaderboard- src/engine/__tests__/leaderboard-rows.test.ts` -> 12 suites, 120 tests passed.

## The one remaining gap

The pinned You row never shows in production because `youPlayerId` comes only from the fixture global. Main already has a real viewer identity on this screen: `viewerPlayerId = membership?.status === "approved" ? membership.player_id : null` (used for My group). The likely last slice is:

```ts
const youPlayerId = getFixtureYouPlayerId() ?? viewerPlayerId ?? undefined;
```

plus a unit test for approved / pending / revoked / host-with-no-membership, and 390x844 captures.

**Not done here on purpose.** AUG-254 (Backlog) says the pinned You row is post-launch design backlog and "do not start a duplicate identity implementation from this card; reconcile with the active account-first work (AUG-81 / AUG-331 / AUG-259)". Showing a "You" chip to real users from membership is an identity-adjacent product change, so it needs an owner or advisor yes before a lane builds it.
