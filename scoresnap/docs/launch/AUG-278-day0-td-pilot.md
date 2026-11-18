# AUG-278: Day-0 own-group round + free Tournament Director (TD) for 3-5 real events

Status: **builder prep only. The real-world steps below are owner actions and are not done.** The ticket body was not readable in this unattended run (vault clone has no git objects), so scope is taken from the AUG-278 commit history (G2 and G4 already merged) and the ticket title.

## Engineering evidence already in the repo (re-run before each event)
| Gate | What it proves | Command |
|---|---|---|
| G2 | Scored 56-player, 14-group leaderboard: ranks, ties, totals, THRU | `npx jest src/engine/__tests__/td-readiness-56-player.test.ts` |
| G4 | Tournament-scale settlement gating | `npx jest src/engine/__tests__/contest-settlement-16p.test.ts` |
| E2E | 16-player tournament flow | `scoresnap/e2e/tournament-16-player.mjs` |
| E2E | 56-player empty state only (no scored data) | `scoresnap/e2e/hopwood-cup-56-player.mjs` |

## Day-0 own-group round (owner, on a real phone)
1. Fresh install of the release candidate build. Note build number.
2. Play 18 holes with your own group, scoring every hole in the app.
3. Record: holes where entry felt slow, any crash or hang, whether leaderboard and settlement matched the paper card.
4. Capture screenshots of the final leaderboard and settlement screen.

## Free TD pilot, 3-5 real events (owner, outreach)
For each event, log in a table: event name, date, organiser contact, player count, groups, build, issues, willing-to-quote (y/n).
- Offer the TD tier free for the event. Do not take payment and do not change pricing.
- Before the event, run the G2/G4 commands above on the shipping commit.
- After the event, collect organiser feedback within 48 h.

## Exit criteria
- Day-0 round completed with no data loss.
- 3 events run (stretch 5), zero unresolved settlement mismatches.
- Every issue filed as its own ticket by the owner (this run does not write Linear).

## Not done here
No outreach, no event contact, no build, no submission. These need the owner.
