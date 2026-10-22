# QA findings

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
