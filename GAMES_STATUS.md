# SnapScore game library status — 2026-10-30, fix round 4

The implementation inventory is **57 ways to play = 30 selectable base games + 26 distinct options + 1 tournament format**. The single source is `scoresnap/src/engine/types.ts`; `PLAYABLE_GAME_COUNT` derives from the registries. All seven round-one removals are restored. Pro includes games and variants; multi-round or multi-group hosting requires Tournament Director. Free remains Stroke Play, Match Play, Stableford and Best Ball. This is implementation status, not release-device acceptance or approval to publish a store listing.

Versioned tournament primary game cards now show every round separately, using that round’s groups, course, cards and scoped events; a separate all-round settlement panel combines cash. Nassau cancelling weighted rounds, Skins, Vegas (including changed pars), Sixes and the common context boundary have red/green regressions. Legacy and single-round contexts retain identity. Live scorecard previews and daily leaderboard results also use the current round’s course, including round-specific course handicaps and pars. Round-2 Nassau/Skins and round-3 course selection have regressions against primary results and settlement. The tournament format therefore counts in the derived 57. See `/workspace/aos-state/reports/snapscore-game-variations-fix-r4-20261030.md` for current local validation; this round is local commit only.

The fix-r2 regressions additionally verify round-scoped Bisque match display against exact cash across two rounds and flat-Skins confirmed prefixes for missing/nonfinite inputs, carry/no-carry and gross/net, preserving versionless behavior. The fix-r1 regressions cover eagle-or-better BBB bonuses, group/round Joker leaderboard agreement with cash, course-handicap Net Skins, confirmed-prefix previews, and the exact Barracuda table. Independent numerical variant fixtures now run under Jest; the 2-to-200 birdie mutation is rejected. No base games or counted options were removed. See `/workspace/aos-state/reports/snapscore-game-variations-fix-r2-20261030.md` for historical validation and CI.

The round-two report supersedes the round-one report: `/workspace/aos-state/reports/snapscore-game-variations-continue-20261030.md`.

## Base games

- `stroke_play`: selectable, scoring and settlement implemented.
- `match_play`: selectable, scoring and settlement implemented.
- `stableford`: selectable, scoring and settlement implemented.
- `mod_stableford`: selectable, scoring and settlement implemented.
- `skins`: selectable, scoring and settlement implemented.
- `skins_carry`: selectable, scoring and settlement implemented.
- `nassau`: selectable, scoring and settlement implemented.
- `best_ball`: selectable, scoring and settlement implemented.
- `nassau_press`: selectable, scoring and settlement implemented.
- `nines`: selectable, scoring and settlement implemented.
- `vegas`: selectable, scoring and settlement implemented.
- `sixes`: selectable, scoring and settlement implemented.
- `closeout`: selectable, scoring and settlement implemented.
- `quota`: selectable, scoring and settlement implemented.
- `chicago`: selectable, scoring and settlement implemented.
- `aces_deuces`: selectable, scoring and settlement implemented.
- `dots`: selectable, scoring and settlement implemented.
- `rabbit`: selectable, scoring and settlement implemented.
- `defender`: selectable, scoring and settlement implemented.
- `fourball`: selectable, scoring and settlement implemented.
- `scramble`: selectable, scoring and settlement implemented.
- `shamble`: selectable, scoring and settlement implemented.
- `banker`: selectable, scoring and settlement implemented.
- `wolf`: selectable, scoring and settlement implemented.
- `hammer`: selectable, scoring and settlement implemented.
- `snake`: selectable, scoring and settlement implemented.
- `greenies`: selectable, scoring and settlement implemented.
- `bingo_bango_bongo`: selectable, scoring and settlement implemented.
- `alternate_shot`: selectable, scoring and settlement implemented.
- `chapman`: selectable, scoring and settlement implemented.

Wolf, Hammer, Snake, Greenies and BBB use the shared actual-event ledger. Missing events are pending, never inferred from scores. Snake records ordered putting events even on pars. BBB captures actual categories in live scoring and scan confirmation, including explicit no-award. Alternate Shot and Chapman require two or more pairs and one canonical gross team card, separate from individual-score games. Losing players each pay one bet unit, split across the winning pair; tied low teams push.

## Variations

| ID | Status | Explanation |
|---|---|---|
| `skins_tiered` | WIRED | Skin units: holes 1–6 = 1, 7–12 = 2, 13–18 = 3. Tied units carry only in Carryover Skins. |
| `skins_progressive` | WIRED | Hole N is worth N skin units; tied units retain their original values. |
| `skins_birdie_mult` | WIRED | An outright gross birdie doubles that hole's units; eagle or better triples them. Carried units are not multiplied. |
| `skins_validation` | WIRED | A win containing carried units is pending until the winner makes gross par or better on the next hole. Failure returns the original units to the pot. A win on 18 is exempt. |
| `skins_team` | WIRED | Two-player teams compete with best ball. Each team's skin entitlement is split equally between its partners. |
| `nassau_weighted` | WIRED | Front nine 1 bet unit, back nine 1, overall 2. With a $5 unit: $5/$5/$10. Presses inherit their parent bet's stake. |
| `nassau_press_press` | WIRED | A press that reaches 2 down starts one further press on the next hole, at the same stake and end hole. |
| `nassau_aloha` | WIRED | Mandatory separate bet on 18 worth HALF the original base unit, regardless of weights or earlier results. A tie pushes. |
| `nassau_no_press_last` | WIRED | No new press may start on holes 9 or 18. Existing bets continue through their end hole. |
| `nassau_junk` | WIRED | Each gross birdie or better, confirmed sandy, barkie, and qualifying par-3 greenie earns 1 unit from each other player. Feats stack once per player per hole, separate from Nassau weights and presses. |
| `wolf_blind` | WIRED | Record Blind Wolf before anyone tees off. The Wolf plays alone for 3 units against EACH opponent, win or lose. Ordinary solo is 2 per opponent. |
| `wolf_pig` | WIRED | A selected partner may refuse before play continues, forcing the Wolf solo at 4 units per opponent, win or lose. Cannot combine with Blind Wolf on the same hole. |
| `wolf_carryover` | WIRED | Each tied hole carries one base stake. The next decided hole multiplies its normal payout by the number of stacked holes. No exponential doubling; unresolved final ties pay nothing. |
| `snake_progressive` | WIRED | First ownership is 1 unit per opponent. Each chronological change of holder doubles the final stake; repeat three-putts by the same holder do not double it. Confirm ordered events every hole. Unsafe totals cannot settle. |
| `stableford_modified` | WIRED | Barracuda points: albatross or better +8, eagle +5, birdie +2, par 0, bogey −1, double or worse −3. |
| `stableford_joker` | WIRED | Each player publicly records TWO distinct Joker holes before the round. All points on those holes double, including negative points. |
| `vegas_birdie_flip` | WIRED | A gross birdie reverses the opposing team's number. Both teams may reverse; no automatic win or extra doubling. Vegas digit cap: 9. |
| `vegas_eagle_doubles` | WIRED | One team's gross eagle or better flips the opposing number and doubles the difference once, overriding birdie rules. Both teams eagle: no flip or double. Vegas digit cap: 9. |
| `vegas_birdie_block` | WIRED | Requires Flip the Bird. If both teams make gross birdie, neither number reverses. Eagle Rule takes precedence. Vegas digit cap: 9. |
| `bbb_birdie_double` | WIRED | SnapScore house rule: each confirmed BBB category earned by a player making a gross birdie is worth 2 points. Other categories stay at 1. No automatic sweep or chip-in bonus. |
| `sixes_escalating` | WIRED | Segments 1–6, 7–12, 13–18 pay winning-hole margin at 1, 2, 4 bet units per player. |
| `sixes_presses` | WIRED | Each segment starts one press after its base first reaches 2 down, starting next hole through segment end. Base and press margins settle at the segment stake. No recursive presses. |
| `rabbit_double` | WIRED | Add a third, full-round Rabbit wager paid by the holder at 18, in addition to front and back nine wagers. This can pay the back-nine holder twice. |
| `match_bisque` | WIRED | Handicap strokes converted into 'bisques' — strokes used at your discretion on any hole, declared before playing that hole. Save bisques for your worst hole type or the most important holes. |
| `net_handicap` | WIRED | Net uses course-handicap strokes; match/Nassau play relative to the lowest player, Stableford/Skins use full course handicaps. Natural-score bonuses still use gross scores. |
| `nassau_auto_press` | FOLDED | Select Nassau with Presses; no additional count. |
| `bbb_chip_in_triple` | HIDDEN | Unsupported substitution for actual BBB events; deliberately excluded by scope. |

Gross/Net is counted once, with the Net variation folded into that capability; group Skins scope is one further option. No combinations are counted. Tournament hosting counts once.

## Persistence, safety and compatibility

New setup writes `rulesVersion: 1` plus `inputRulesVersion: 1`. Absent rules version retains origin/main calculator/settlement behavior. Existing round-one contests without the input-rules marker do not activate formerly hidden controls. Unknown/hidden keys remain preserved in the stored audit record and are removed only from execution. Rules and money are locked after play starts; legacy adoption requires a separate contest rather than silently changing an outcome.

Inputs persist in round/group namespaces (`default/<group>` for a single round). Legacy unscoped inputs are read only for one single-round group; ambiguous tournament maps remain pending. BBB's legacy scan alias is normalized with conflict detection. Constituent tournament rounds settle with their own course, player handicaps and events. Settlement, profile wagering and live share use `calculateContestSettlement`; previews use the same event ledger. Team leaderboards read canonical cards.

Joker choices are public, exactly two per player and locked before scoring. Bisque records 0–2 strokes per player before each hole, validates full nonnegative rounded course-handicap budgets and replaces indexed net. Blind/Pig require recorded pre-play choices, never a global forced-solo switch. Junk records actual sandy/barkie/greenie feats and qualifies them against gross par; birdies are derived from gross scores. Store mutations validate host tiers; guest score/event capture has no new per-hole paywall. Individual OCR imports are rejected for shared-ball formats.

The unchanged origin/main golden fixture covers all 30 bases with omitted/empty config. Actual-input repairs intentionally replace speculative event money for new rules, fix Wolf conservation, and add the three previously absent settlements. Balanced integer-cent allocation is retained.

## Manual QA required

Release-device setup/edit/back/skip/reload, last-hole side-bet capture, complete-round locking, scan category confirmation and declarations, multi-round/multi-group course changes, canonical team cards, Pro/Free/TD access and eventual combined-tree validation with PR #33. No release-device QA was run in this build; it is not a build blocker.
