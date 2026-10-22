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
