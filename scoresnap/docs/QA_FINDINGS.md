# GS-13 QA findings

## Fixed: unplayed scores earn points and bonuses

The `Player.scores` contract defines zero as unplayed. Stableford, Modified
Stableford, Quota, Chicago, Dots, and Aces & Deuces nevertheless classify zero
against par and award points or bonuses. This affects incomplete and nine-hole
rounds represented by 18 slots with trailing zeros.

**Fixed:** all six calculators ignore zero or missing scores. Stableford and
Modified Stableford return zero per-hole points for missing slots; Dots and
Aces & Deuces produce no breakdown entries or events for unplayed holes. Quota
and Chicago retain handicap targets but count only points earned on played holes.
Settlement for these games produces no transactions before any hole is played.
Played-hole scoring and existing payout rules after play begins are unchanged.

Minimal reproduction, run from `scoresnap/` (installed dependencies only):

```sh
node --import tsx --input-type=module <<'JS'
const course = { name: 'Repro', holes: Array.from({ length: 18 }, (_, i) =>
  ({ num: i + 1, par: 4, hcp: i + 1, yards: 350 })) };
const players = ['A', 'B'].map(id =>
  ({ id, name: id, handicap: 0, scores: Array(18).fill(0) }));
for (const [file, fn] of [
  ['stableford', 'calcStableford'], ['mod-stableford', 'calcModStableford'],
  ['quota', 'calcQuota'], ['chicago', 'calcChicago'],
  ['dots', 'calcDots'], ['aces-deuces', 'calcAcesDeuces'],
]) {
  const mod = await import(`./src/engine/calculators/${file}.ts`);
  console.log(file, (mod.default ?? mod)[fn](players, course));
}
JS
```

Expected: zero earned points and no aces for either player, since neither has
played a hole. Handicap quota targets can remain nonzero.

Before the fix, actual per player: Stableford **90 points**, Modified Stableford **144 points**,
Quota **72 points**, Chicago **90 gross points**, Dots **36 dots / 18 birdies**.
Aces & Deuces reports **36 ace events** across the two players (their equal
payments cancel). The generated properties now enforce independent played-hole point schedules,
Dots breakdowns, and Aces & Deuces event lists for all six affected games.
Focused regressions cover all-zero rounds, nine played plus nine unplayed holes,
mid-round gaps, uneven player progress, and sparse/undefined/truncated scores,
including settlement. Legacy progressive Quota and Dots expectations were
corrected to exclude unplayed-hole bonuses.

## Coverage and reproduction

`npm test` discovers three legacy runners (332 + 429 + 129 = **890 checks**)
and 30 seeded properties, one for every member of the `GameType` union.
Each property runs 60 explicitly scheduled slots with fast-check-generated
score arrays, course pars, and wagers: **1,800 configurations** in total.
Every slot uses `numRuns: 1`; seed = `130000 + gameIndex * 100 + slot`.
Failures print game, slot, seed, counterexample, and shrink path. Run an individual
game with `node --import tsx tests/helpers/scoring-properties.ts skins`.

Coverage includes every metadata-legal player count up to eight, 9/18-hole
rounds (18 score slots, unplayed holes zero), par/ace/blowup/tie/mixed/partial
profiles, scratch/mixed/plus/36 handicaps, and net/gross plus field/group skins.
No game metadata permits one player; scoped skins naturally exercises singleton
groups. The engine still receives 18 course holes because several calculators
require that shape.

Enforced invariants: successful calculation, finite numbers, repeatability,
settlement zero-sum in integer cents, positive cent transactions, ledger/net
agreement, group isolation, stroke and point total aggregation, skin totals,
and player permutation where applicable. Nines and Vegas aggregate their hole
results; Dots checks its breakdown. Event arrays in Aces & Deuces are normalized
by hole and player, so display order is not mistaken for scoring behavior.

Rotations, positional opponents, simulated tie breaks, and shared team-score
representatives are intentionally excluded from permutation comparisons.
Settlement permutation is checked for skins using wagers divisible by all group
sizes: smaller wagers can legitimately move a remainder cent under the existing
input-order allocation policy.

## Validation result

`npm test`: **9 suites, 71 Jest tests passed in 12.027 seconds**.
All **1,800 generated configurations** and **890 legacy checks** passed, along
with the focused unplayed-hole regression runner and other existing Jest tests.
No sandbox EPERM workaround was needed for this run. No dependencies were fetched.
No commit or push was made.


## 2026-10-22 — deterministic scorecard corpus

No paid services or live OCR used. Fixtures are synthetic, contain no real personal data, and express desired results. Four parser defects are tracked with `test.failing`, not silently blessed as correct output. A future fix makes that test fail as an unexpected pass; remove `knownBug` when fixing it.

- **P1 — OUT/IN/total columns shift scores.** Repro: `test-scorecards/front-out.json`: `Alice,4,4,4,4,4,4,4,4,4,36,4,4,4,4,4,4,4,4,4,36,72`. Expected 18 fours; actual hole 10 is zero and hole 18 is truncated. Parser consumes summary cells as holes. Trailing totals after 18 holes work; embedded OUT needs header-aware column mapping.
- **P2 — nine-hole header ignored without a par row.** Repro: `header-nine.json`, `Hole,1,2,3,4,5,6,7,8,9` followed by nine fours for Alice. Expected `holeCount: 9`; actual 18 (scores are correctly padded). Labeled nine-hole par rows work.
- **P3 — player names containing “par” are discarded.** Repro: `name-parker.json`, Parker followed by 18 fours. Expected one player; actual none. `includes("par")` treats Parker as a malformed par label. Parser left unchanged pending a deliberate label-boundary fix.
- **P4 — trailing garbage accepted with high confidence.** Repro: `trailing-garbage.json`, `Alice,4abc,5`. Desired first score zero / review; actual 4 with 0.95 confidence because `parseInt` accepts prefixes. Requires a decision on annotation syntax before tightening validation.

The parser returns an empty player list rather than throwing for empty/malformed rows; `expectedError: "No players found"` identifies the scan UI's validation outcome. Corpus assertions test that empty result directly.

## Web matrix scope

24 flows: six legal roster/game bundles × manual/paste × nine/eighteen played holes. Includes two-player head-to-head, four-player Skins + Nassau, four/eight-player Best Ball with assigned teams, and eight-player Skins. Every contest is UI-created and every score is UI-entered or parsed/imported; no persisted contest is injected. Nine-hole cases are explicitly partial rounds on 18-hole courses: creation and manual navigation hardcode 18. These do **not** establish true nine-hole course support. Settlement checks reconcile rendered player amounts with integer-cent balances and transaction ledger; expected amounts use the production calculator, so independent game-rule correctness remains the engine tests' responsibility.

- **W1 — settlement debit lacked a sign (fixed).** First head-to-head manual flow, nine played holes: PlayerB owed $10 but the row rendered `$10.00`. `formatMoney` takes an absolute value and the ordinary player row omitted the sign. Added `-` for debits and `+` for credits; the matrix reads rendered signed amounts and balances them independently in cents. No payout rules changed.

## Validation on cursor/qa-corpus-e2e (2026-10-22)

- Offline Expo web export succeeded. No EPERM encountered.
- Corpus: 60 fixtures, 56 desired parses/errors pass and four expected parser failures reproduce; all 60 synthetic ML Kit geometry checks pass. Jest counts these as 120 passing checks, including `test.failing` cases. Corpus run: 0.593 seconds.
- Full Jest after the settlement display fix: eight suites, 160/160 checks green (includes those four expected failures), 7.411 seconds. Existing engine suites remain wired once; no CI changes.
- Browser matrix: 24/24 distinct flows exercised; initial full run 23 pass / one action timeout, 517.736 seconds. `foursome-best-ball-18-manual` timed out waiting for the PlayerD plus control to stabilize. Targeted rerun with a 30-second action timeout passed (1/1), 11.524 seconds. The timeout did not reproduce; retained as a timing flake rather than claiming a proven root cause. Total measured browser execution: 529.260 seconds. Default action timeout raised from 10 to 30 seconds, and `--only=<flow-id>` enables targeted reruns.
- Full and targeted reports remain separately in ignored `e2e/screens/matrix/results.json` and `e2e/screens/matrix/rerun/results.json`; success screenshots are 390×844. Initial failure evidence remains alongside them. `dist-web/` and all browser artifacts are ignored. No commits or pushes made.
