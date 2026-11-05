# AUG-277 activation live-apply packet (draft; no live action performed)

This packet covers the three proposed activation SQL files only. The Day-14 worksheet is `scoresnap/scripts/analytics/day14-report.sql`; it emits rows from `activation_daily`, `retention_cohorts`, `organizer_contest_players`, and `round_share_rate`. Rates are fractions from 0 to 1. Targets are planning assumptions. The views contain no historical backfill, so the report starts accumulating server-observed outcomes only after the changes are applied and traffic reaches the server.

**Approval gate:** this is a prepared plan, not authorization. The PM must obtain the separate owner yes before applying any file to the live Supabase project. Do not apply from this packet until that yes is recorded. Estimated cost: **$0**, using the existing Supabase project and its current plan; no new service or paid resource is required.

## Ordered apply list

Apply in this order, after approval, from the exact merged and reviewed commit:

1. `scoresnap/supabase/proposed/20261103170000_first_round_finished.sql`
2. `scoresnap/supabase/proposed/20261104090000_activation_retention.sql`
3. `scoresnap/supabase/proposed/20261104110000_activation_share_rate.sql`

Use the project's approved migration/change process and record the exact commit and resulting migration receipts. The activation-candidate CI workflow validates this order on a disposable stack; it is not a live-apply tool.

## Exclusions required before the first real calculation

`analytics_cohort_exclusions` is empty by default. Populate it from reviewed, offline identity lists before treating any rate as a real result. Insert only profile UUIDs and one allowed reason per profile (`staff`, `automated_test`, `rehearsal`); retain the source list and review date with the operator's change record.

- **staff:** current internal staff and contractor roster from the organization's approved people/operations roster. Do not infer staff status from product activity or query production users to build the list.
- **automated_test:** QA and E2E account identities from the checked-in test fixtures under `scoresnap/scripts/ci/` plus the maintained E2E/device test-account manifest. Reconcile fixture accounts to profile UUIDs from the approved account manifest; do not enumerate live accounts.
- **rehearsal:** accounts explicitly listed by the launch/rehearsal organizer in the offline rehearsal attendee and test-account record. Do not infer a rehearsal from timestamps, contest names, or live database content.

If an authoritative offline source is missing or does not map an identity to a profile UUID, leave that identity unresolved and disclose the cohort limitation; do not guess or read live user data to fill gaps. Recheck the lists before each formal cohort review.

## Read-only pre-checks

Run these only after owner approval and immediately before apply, using the approved project connection. They inspect state but make no changes:

```sql
SELECT current_database(), current_user, current_setting('server_version');
SELECT to_regclass('public.first_round_finishes') AS first_round_finishes,
       to_regclass('public.activation_daily') AS activation_daily,
       to_regclass('public.retention_cohorts') AS retention_cohorts,
       to_regclass('public.organizer_contest_players') AS organizer_contest_players,
       to_regclass('public.round_share_rate') AS round_share_rate,
       to_regclass('public.analytics_cohort_exclusions') AS analytics_cohort_exclusions;
-- If to_regclass reports an existing table, then inspect its row count separately:
-- SELECT count(*) AS existing_first_finish_rows FROM public.first_round_finishes;
```

Confirm the connection is the intended existing project and retain the output. If the first-finish table already exists, stop and reconcile its migration provenance before applying anything. Confirm the offline exclusion lists are reviewed and ready before beginning; do not run any user/profile enumeration query.

## Read-only post-checks

After the approved apply and exclusion seeding, run the worksheet plus these checks and retain dated results with the change record:

```sql
SELECT * FROM public.activation_daily ORDER BY date DESC;
SELECT * FROM public.retention_cohorts ORDER BY cohort_date DESC;
SELECT * FROM public.organizer_contest_players ORDER BY created_at DESC;
SELECT * FROM public.round_share_rate ORDER BY cohort_date DESC;
SELECT count(*) AS excluded_profiles,
       count(*) FILTER (WHERE reason = 'staff') AS staff,
       count(*) FILTER (WHERE reason = 'automated_test') AS automated_test,
       count(*) FILTER (WHERE reason = 'rehearsal') AS rehearsal
FROM public.analytics_cohort_exclusions;
SELECT has_table_privilege('anon','public.activation_daily','SELECT') AS anon_activation_read,
       has_table_privilege('authenticated','public.retention_cohorts','SELECT') AS authenticated_retention_read,
       has_table_privilege('service_role','public.activation_daily','SELECT') AS service_activation_read,
       has_table_privilege('service_role','public.round_share_rate','SELECT') AS service_share_read;
```

The first two client-role privilege results must be `false`; service-role view reads must be `true`. D7 rates remain `NULL` when no members are mature. Verify the exclusion totals against the reviewed offline lists. Preserve zero-denominator/NULL rates as such; do not substitute zero.

## Exact rollback order

If the approved operator chooses rollback, use the existing rollback files in reverse apply order:

1. `scoresnap/supabase/rollbacks/20261104110000_activation_share_rate.sql`
2. `scoresnap/supabase/rollbacks/20261104090000_activation_retention.sql`
3. `scoresnap/supabase/rollbacks/20261103170000_first_round_finished.sql`

These remove the three proposals' objects; retain the apply/rollback receipts and verify object absence before any later retry.

## Limits of measurement

- `players_added` counts roster rows, and `members_joined` counts approved non-host memberships. **Invitations sent are not measured**; there is no server-side invitation event.
- `round_share_rate` measures a confirmed non-organizer member on an eligible first completed round. Created links and server-observed join requests remain separate signals; client share-sheet intent is unknown.
- **Trial-to-paid is not measured**; it requires StoreKit/subscription outcome data and is outside this change.
- Activation and retention are server-observed lower bounds. Local-only rounds, historical pre-apply activity, reinstalls, and identity merges are not backfilled or resolved here.
- D7 30–40%, organizer roster 3+, and confirmed share 10% are planning assumptions, not promises or launch gates.
