# AUG-350: Tournament CI installer pin

Engineering-owned setup repair, separate from PDF acceptance.

## Origin and evidence

- Failed post-merge run: https://github.com/augsmog/QuickScore/actions/runs/41391660607 (job 125104181495), merge e8605d2.
- Primary error: `Failed to resolve latest Supabase CLI release: rate limit exceeded`.
- App build and tournament tests did not run. Cleanup subsequently reported `supabase: command not found`; this is secondary, not a failed product assertion.
- Passed final PR comparison: run 41390555169, job 125100779371. Both runs used `supabase/setup-cli@v1` at action SHA `1dedf2c611547ede7232d26866dd3c56ab903bbb`. Successful run's cache key establishes installed CLI `2.122.0`.
- Exact upstream action source: https://github.com/supabase/setup-cli/blob/1dedf2c611547ede7232d26866dd3c56ab903bbb/src/utils.ts . Only `version: latest` calls release-discovery API; an explicit version selects its official release asset directly.

## Scope

Change only Tournament's CLI version input to `2.122.0`. The existing action reference remains unchanged; its observed implementation SHA is recorded, not falsely claimed as an immutable tag pin. No upgrade, new dependency, secret, credential, permission or app assertion. Cleanup remains unchanged: suppressing its secondary missing-command failure is unnecessary to this repair and must not hide the primary setup failure.

## Acceptance

Run `npm test -- --runInBand tests/tournament-cli-setup.test.cjs`. Regression and its mutations fail closed for floating/changed versions and weakened failure semantics. Independent source review must confirm the workflow differs only in the intended version input. Fresh hosted Tournament setup plus both complete app tests, and all other triggered gates, must pass on the exact candidate before merge. Do not rerun the unchanged failed commit as proof of the repair.

No live database, product release or broader AUG-315 device/offline/Unicode acceptance is implied.
