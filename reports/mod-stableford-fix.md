# Modified Stableford settlement fix

## Root cause

`settlement.ts` grouped `stableford` and `mod_stableford` into a single case
that called `calcStableford`, so Modified Stableford was settled on regular
Stableford points. The in-app Games scoreboard (`app/contest/[id]/games.tsx`)
had the same shortcut: it also rendered Modified Stableford with `calcStableford`.
So on `main` the two screens agreed with each other, but both used the wrong
points for this format, and the payout could differ from the Modified Stableford
standings in the rules explainer.

## Diff summary

- Import `calcModStableford` and give `mod_stableford` its own settlement case.
- Games scoreboard: render `mod_stableford` with `calcModStableford` (regular
  `stableford` still uses `calcStableford`), so the displayed leader and the
  settle-up winner use the same points.
- Preserve regular Stableford and all other settlement cases, the no-scores guard,
  winner-takes-one-unit-per-opponent policy, and shared cent reconciliation.
- Add a regression using the rules-explainer Modified Stableford fixture, including
  scoreboard totals, exact transfers, zero-sum nets, and regular Stableford behavior.
- Add an independent three-hole case with strictly opposite rankings, plus
  unplayed-round coverage for both formats.
- Add a static check that the Games scoreboard uses `calcModStableford` for
  `mod_stableford` (the screen itself has no render test harness).
- No explainer copy changes.

## Fixture before / after

At a $1 bet unit, Modified Stableford points (`calcModStableford`) are Casey 51,
Alex 48, Jordan 36, Sam 33. After this change the Games scoreboard shows those
numbers. Before it, the scoreboard showed regular Stableford points (Alex 41,
Casey 41, Jordan 36, Sam 35, with Alex listed first on input order).

| Player | Before net | After net |
| --- | ---: | ---: |
| Alex | +$3 | -$1 |
| Casey | -$1 | +$3 |
| Jordan | -$1 | -$1 |
| Sam | -$1 | -$1 |
| Total | $0 | $0 |

Before: Casey, Jordan, and Sam each pay Alex $1.
After: Alex, Jordan, and Sam each pay Casey $1.
Regular Stableford still pays Alex for these scores.

The independent par-4 three-hole example uses Steady `[1, 1, 3]` and Bold
`[2, 2, 2]`: regular points 13 versus 12 pay Steady, while modified points
21 versus 24 pay Bold.

## Provenance

Written by a Codex run in an isolated clone off `main` at `e43694d`. That clone's
`.git` was read-only, so the change was carried onto branch `fix/mod-stableford-settle`
(fresh worktree off `origin/main` `e43694d`) and committed there.

The test fixture is `scoresnap/tests/fixtures/mod-stableford-settlement.json`: only the
`mod_stableford` entry from the (not yet merged) rules-explainer
`rules-explainer-examples.json`, with its expected settlement nets corrected to
Casey +$3 / Alex -$1. Players, scores, course and scoreboard expectations are unchanged.
It uses its own file name so it does not collide with the rules-explainer fixture file.
When the rules-explainer work lands, its `mod_stableford` expected nets must use the
corrected values (Casey +$3, Alex -$1).

## Validation

- Full scoresnap suite on this branch: `cd scoresnap && npm test -- --runInBand`
  gives **17 suites passed, 249 tests passed** (including `engine.test.cjs`
  and `scoring-properties.test.cjs`).
- Changed files are `settlement.ts`, `games.tsx`, the new test and fixture, and this report.
- The new regression fails against the original `settlement.ts` (actual Alex +$3 /
  Casey -$1), so it catches the reported defect.
- `tsc --noEmit` reports 42 errors both before and after this change; none are
  in the changed lines (all are pre-existing).
- No explainer copy changes.
