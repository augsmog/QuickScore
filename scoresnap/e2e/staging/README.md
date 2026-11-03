# Disposable staging (AUG-395)

A write-safe staging target for E2E journeys. It is a never-linked local Supabase stack with the
full migration chain, five synthetic test accounts and one seeded contest. It has no hosted
project, no customer data and no spend.

| Role | Email | In seeded contest |
|---|---|---|
| owner | snapscore-staging-owner@example.test | yes (owner) |
| player2 | snapscore-staging-player2@example.test | yes |
| player3 | snapscore-staging-player3@example.test | yes |
| player4 | snapscore-staging-player4@example.test | yes |
| outsider | snapscore-staging-outsider@example.test | no (RLS must hide it) |

- The seeded contest has id `5e5e0000-0000-4000-8000-000000000001`, is called "Staging Seed Round", and is set on the synthetic 18-hole, par-72 course "Staging Synthetic Links". It has 4 players and a fixed join code, `STAGE2`.
- Every run generates fresh random passwords. They are written only to `$RUNNER_TEMP/staging.env` (mode 600) and masked in CI. The uploaded manifest holds no credentials.
- `seed.mjs` refuses any URL other than `http://127.0.0.1:54321` or `http://localhost:54321`.
- To run it in CI, use the `E2E disposable staging` workflow (workflow_dispatch). It also runs on PRs that touch migrations. It seeds twice and fails if the second run changes any identity or row.
- To run it locally, run `supabase start`, then `supabase db reset`, then `supabase status -o json > /tmp/st/staging-status.json`, then `STAGING_DIR=/tmp/st node e2e/staging/seed.mjs`.
- To use it in a journey, `source $RUNNER_TEMP/staging.env`. That gives you `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `STAGING_<ROLE>_EMAIL/PASSWORD`.

This target does not cover App Store sandbox purchasers, TestFlight testers, or a hosted staging
project. Those need the owner and are tracked on AUG-395.
