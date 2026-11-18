# AUG-314 / GAP-01 receipt: round edit and tournament-rounds route outlet

Finding: no code defect remains on main. The `Slot` outlet in `app/contest/[id]/_layout.tsx`
stays mounted for every child route (edit, tournament-rounds, games, ...), and chrome renders only on tab routes.

Landed by: 2fa3ebc (AUG-1115 route outlets + regression), 42a477f (AUG-1125 web Back), 98a0152 (AUG-1129 Back to origin tab).

Proof: `npx jest tests/gap01-round-routes.test.cjs tests/round-routes.test.cjs` -> 2 suites, 29 tests pass on origin/main.

Not verified here: live browser run (e2e/shared/gap01-routes.mjs); the AUG-1115 note flagged a tournament Back browser assertion for follow-up, later addressed by AUG-1125/1129.
"Add a game" lives at `app/contest/[id]/games.tsx`, a tab route, so it resolves through the same outlet.
