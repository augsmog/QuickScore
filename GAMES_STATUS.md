# SnapScore game library status — 2026-10-30

Draft implementation; NOT release acceptance. The full PM WIRE target is incomplete. See the build report in `/workspace/aos-state/reports/snapscore-game-variations-build-20261030.md`.

The source of truth is `scoresnap/src/engine/types.ts`: `IMPLEMENTED_GAME_IDS`, the filtered `GAME_VARIATIONS`, `PLAYABLE_OPTION_IDS`, `PLAYABLE_FORMAT_IDS`, and derived `PLAYABLE_GAME_COUNT`. Current draft: **42 ways to play = 23 selectable base games + 18 distinct options + 1 tournament format**. Net/Gross counts once across games; automatic presses are already the pressed Nassau base. Combinations never add entries. Pro includes games and variants; multi-round/multi-group hosting requires Tournament Director. Free remains Stroke Play, Match Play, Stableford, Best Ball.

## Base games

- `stroke_play`: calculator and settlement case; selectable.
- `match_play`: calculator and settlement case; selectable.
- `stableford`: calculator and settlement case; selectable.
- `mod_stableford`: calculator and settlement case; selectable.
- `skins`: calculator and settlement case; selectable.
- `skins_carry`: calculator and settlement case; selectable.
- `nassau`: calculator and settlement case; selectable.
- `best_ball`: calculator and settlement case; selectable.
- `nassau_press`: calculator and settlement case; selectable.
- `nines`: calculator and settlement case; selectable.
- `vegas`: calculator and settlement case; selectable.
- `sixes`: calculator and settlement case; selectable.
- `closeout`: calculator and settlement case; selectable.
- `quota`: calculator and settlement case; selectable.
- `chicago`: calculator and settlement case; selectable.
- `aces_deuces`: calculator and settlement case; selectable.
- `dots`: calculator and settlement case; selectable.
- `rabbit`: calculator and settlement case; selectable.
- `defender`: calculator and settlement case; selectable.
- `fourball`: calculator and settlement case; selectable.
- `scramble`: calculator and settlement case; selectable.
- `shamble`: calculator and settlement case; selectable.
- `banker`: calculator and settlement case; selectable.

The seven remaining legacy calculator IDs are retained for saved contests but disabled for new selection and excluded from the count:

- Bingo Bango Bongo: score approximation remains legacy-only; no live category prompt and no settlement. Requires real first-on/closest/first-in input, explicit no-award, alias normalization and scoped persistence.
- Alternate Shot, Chapman: legacy calculators exist; no settlement or canonical team score-card input. Not available as two-player contests.
- Wolf, Hammer, Snake, Greenies: actual live AuxiliaryPrompt controls exist, but legacy calculators and payable fallback paths still simulate events from strokes. Excluded rather than advertising those guesses as paid settlement. Snake also needs ordered events for every hole, including three-putt pars. Greenies needs actual proximity/par validation parity; Hammer needs declined-hammer parity.

OCR GamePromptSheet includes BBB review, but its legacy write alias is not a working live BBB workflow. No new auxiliary prompt or round/group namespace is claimed in this draft.

## Variations

| ID | Status | Explanation |
|---|---|---|
| `skins_tiered` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `skins_progressive` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `skins_birdie_mult` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `skins_validation` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `skins_team` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `nassau_weighted` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `nassau_press_press` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `nassau_aloha` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `nassau_no_press_last` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `stableford_modified` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `vegas_birdie_flip` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `vegas_eagle_doubles` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `vegas_birdie_block` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `sixes_escalating` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `sixes_presses` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `rabbit_double` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `net_handicap` | WIRED | Version-one calculator and settlement use the same rule; descriptions live in the registry. |
| `nassau_auto_press` | HIDDEN | HIDDEN / FOLDED: select Nassau with Presses; no duplicate count. |
| `nassau_junk` | HIDDEN | HIDDEN: actual sandy/barkie/greenie collection is not implemented. |
| `wolf_blind` | HIDDEN | HIDDEN: no confirmed pre-hole blind declaration workflow. |
| `wolf_pig` | HIDDEN | HIDDEN: no confirmed selected-partner refusal workflow. |
| `wolf_carryover` | HIDDEN | HIDDEN: needs actual Wolf input/calculator parity first. |
| `snake_progressive` | HIDDEN | HIDDEN: needs chronological confirmed-none/event input per hole. |
| `stableford_joker` | HIDDEN | HIDDEN: no locked per-player two-hole declaration workflow. |
| `bbb_birdie_double` | HIDDEN | HIDDEN: real live BBB input and settlement are unfinished. |
| `bbb_chip_in_triple` | HIDDEN | HIDDEN: unsupported and incorrect category substitution; scope explicitly rejects it. |
| `match_bisque` | HIDDEN | HIDDEN: no locked pre-hole declarations/budget workflow. |

New contests created by setup use `rulesVersion: 1`. Existing contests without a version retain ignored-toggle legacy behavior and show a review warning; there is no silent adoption. Active/completed contest adoption and before/after review are NOT delivered. Hidden config keys remain in the type and legacy inventory and are not executed. The original 30-calculator/settlement baseline is captured in `tests/fixtures/game-defaults-1dee94d.json` and checked byte-for-byte with empty config, including hidden legacy games.

Weighted Skins, validation, team splits, Nassau bet ledger, Barracuda/Net, Vegas precedence, Sixes margins/presses and Rabbit checkpoint units feed settlement. New-rule settlements remain pending until all scores are entered; integer cents use the existing balanced entitlement allocator. Zero-dollar score-only contests are permitted. Invalid currency, conflicting rules, invalid pairs and duplicate names/IDs are rejected in setup/settlement. Store/import validation, unsupported saved-rule adoption, full round/course caller parity and release-device walkthrough remain build blockers.

Hopwood Cup's import now points to `calculators/stroke-play`. It already runs through `tests/engine.test.cjs`; the CJS wrapper matches Jest's test pattern. Local focused evidence is in the build report; CI does not replace local Jest.
